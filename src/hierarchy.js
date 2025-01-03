import _ from 'lodash';
const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * Check if a given member object is of kind `event`.
 * @param {Object} member - The member to check.
 * @returns {boolean} `true` if it is of kind `event`, otherwise false.
 */
const isEvent = member => member.kind === 'event';

/**
 * We need to have members of all valid JSDoc scopes.
 * @private
 */
const getMembers = () => ({
  global: Object.create(null),
  inner: Object.create(null),
  instance: Object.create(null),
  events: Object.create(null),
  static: Object.create(null)
});

/**
 * Pick only relevant properties from a comment to store them in
 * an inheritance chain
 * @param comment a parsed comment
 * @returns reduced comment
 * @private
 */
function pick(comment) {
  if (typeof comment.name !== 'string') {
    return undefined;
  }

  const item = {
    name: comment.name,
    kind: comment.kind
  };

  if (comment.scope) {
    item.scope = comment.scope;
  } else if (comment.memberof) {
    item.scope = 'static';
  }

  return item;
}

/**
 * @param {Array<Object>} comments an array of parsed comments
 * @returns {Array<Object>} nested comments, with only root comments
 * at the top level.
 */
export default function (comments) {
  let id = 0;
  const root = {
    members: getMembers()
  };

  const namesToUnroot = [];

  comments.forEach(comment => {
    let path = comment.path;
    if (!path) {
      path = [];

      if (comment.memberof) {
        // TODO: full namepath parsing
        path = comment.memberof
          .split('.')
          .map(segment => ({ scope: 'static', name: segment }));
      }

      if (!comment.name) {
        comment.errors.push({
          message: 'could not determine @name for hierarchy'
        });
      }

      path.push({
        scope: comment.scope || 'static',
        name: comment.name || 'unknown_' + id++
      });
    }

    let node = root;

    while (path.length) {
      const segment = path.shift();
      const scope = segment.scope;
      const name = segment.name;

      if (!hasOwnProperty.call(node.members[scope], name)) {
        // If segment.toc is true, everything up to this point in the path
        // represents how the documentation should be nested, but not how the
        // actual code is nested. To ensure that child members end up in the
        // right places in the tree, we temporarily push the same node a second
        // time to the root of the tree, and unroot it after all the comments
        // have found their homes.
        if (
          segment.toc &&
          node !== root &&
          hasOwnProperty.call(root.members[scope], name)
        ) {
          node.members[scope][name] = root.members[scope][name];
          namesToUnroot.push(name);
        } else {
          const newNode = (node.members[scope][name] = {
            comments: [],
            members: getMembers()
          });
          if (segment.toc && node !== root) {
            root.members[scope][name] = newNode;
            namesToUnroot.push(name);
          }
        }
      }

      node = node.members[scope][name];
    }

    node.comments.push(comment);
  });
  namesToUnroot.forEach(function (name) {
    delete root.members.static[name];
  });

  /*
   * Massage the hierarchy into a format more suitable for downstream consumers:
   *
   * * Individual top-level scopes are collapsed to a single array
   * * Members at intermediate nodes are copied over to the corresponding comments,
   *   with multisignature comments allowed.
   * * Intermediate nodes without corresponding comments indicate an undefined
   *   @memberof reference. Emit an error, and reparent the offending comment to
   *   the root.
   * * Add paths to each comment, making it possible to generate permalinks
   *   that differentiate between instance functions with the same name but
   *   different `@memberof` values.
   *
   *     Person#say  // the instance method named "say."
   *     Person.say  // the static method named "say."
   *     Person~say  // the inner method named "say."
   */
  function toComments(nodes, root, hasUndefinedParent, path) {
    const result = [];
    let scope;

    path = path || [];

    for (const name in nodes) {
      const node = nodes[name];

      for (scope in node.members) {
        node.members[scope] = toComments(
          node.members[scope],
          root || result,
          !node.comments.length,
          node.comments.length && node.comments[0].kind !== 'note'
            ? path.concat(node.comments[0])
            : []
        );
      }

      for (let i = 0; i < node.comments.length; i++) {
        const comment = node.comments[i];

        comment.members = {};
        for (scope in node.members) {
          comment.members[scope] = node.members[scope];
        }

        let events = comment.members.events;
        let groups = [];

        if (comment.members.instance.length) {
          groups = _.groupBy(comment.members.instance, isEvent);

          events = events.concat(groups[true] || []);
          comment.members.instance = groups[false] || [];
        }

        if (comment.members.static.length) {
          groups = _.groupBy(comment.members.static, isEvent);

          events = events.concat(groups[true] || []);
          comment.members.static = groups[false] || [];
        }

        if (comment.members.inner.length) {
          groups = _.groupBy(comment.members.inner, isEvent);

          events = events.concat(groups[true] || []);
          comment.members.inner = groups[false] || [];
        }

        if (comment.members.global.length) {
          groups = _.groupBy(comment.members.global, isEvent);

          events = events.concat(groups[true] || []);
          comment.members.global = groups[false] || [];
        }

        comment.members.events = events;

        comment.path = path.map(pick).concat(pick(comment)).filter(Boolean);

        const scopeChars = {
          instance: '#',
          static: '.',
          inner: '~',
          global: ''
        };

        comment.namespace = comment.path.reduce((memo, part) => {
          if (part.kind === 'event') {
            return memo + '.event:' + part.name;
          }
          let scopeChar = '';
          if (part.scope) {
            scopeChar = scopeChars[part.scope];
          }
          return memo + scopeChar + part.name;
        }, '');

        if (hasUndefinedParent) {
          const memberOfTag = comment.tags.filter(
            tag => tag.title === 'memberof'
          )[0];
          const memberOfTagLineNumber =
            (memberOfTag && memberOfTag.lineNumber) || 0;

          comment.errors.push({
            message: `@memberof reference to ${comment.memberof} not found`,
            commentLineNumber: memberOfTagLineNumber
          });

          root.push(comment);
        } else {
          result.push(comment);
        }
      }
    }

    return result;
  }

  return toComments(root.members.static);
}
