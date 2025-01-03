import parse from '../../src/parsers/javascript.js';
import hierarchy from '../../src/hierarchy.js';

function toComments(fn, filename) {
  return parse(
    {
      file: filename || 'test.js',
      source: fn instanceof Function ? '(' + fn.toString() + ')' : fn
    },
    {}
  );
}

function evaluate(fn, callback) {
  return hierarchy(toComments(fn, callback));
}

function map(arr, prop) {
  return arr.map(function (item) {
    return item[prop];
  });
}

test('hierarchy', function () {
  const comments = evaluate(function () {
    /**
     * @name Class
     * @class
     */
    /**
     * @name getFoo
     * @memberof Class
     * @instance
     */
    /**
     * @name isClass
     * @memberof Class
     * @static
     */
    /**
     * @name MAGIC_NUMBER
     * @memberof Class
     */
    /**
     * @name event
     * @memberof Class
     * @kind event
     */
  });

  expect(map(comments, 'name')).toEqual(['Class']);

  const classMembers = comments[0].members;

  expect(map(classMembers.static, 'name')).toEqual(['isClass', 'MAGIC_NUMBER']);
  expect(map(classMembers.instance, 'name')).toEqual(['getFoo']);

  expect(map(classMembers.static[0].path, 'name')).toEqual([
    'Class',
    'isClass'
  ]);
  expect(map(classMembers.instance[0].path, 'name')).toEqual([
    'Class',
    'getFoo'
  ]);
  expect(map(classMembers.events[0].path, 'name')).toEqual(['Class', 'event']);
});

test('hierarchy - nesting', function () {
  const comments = evaluate(function () {
    /**
     * @name Parent
     * @class
     */
    /**
     * @name enum
     * @memberof Parent
     */
    /**
     * @name Parent
     * @memberof Parent.enum
     */
    /**
     * @name Child
     * @memberof Parent.enum
     */
  });

  expect(map(comments, 'name')).toEqual(['Parent']);

  const classMembers = comments[0].members;
  expect(map(classMembers.static, 'name')).toEqual(['enum']);

  const enumMembers = classMembers.static[0].members;
  expect(map(enumMembers.static, 'name')).toEqual(['Parent', 'Child']);
  expect(map(enumMembers.static[0].path, 'name')).toEqual([
    'Parent',
    'enum',
    'Parent'
  ]);
  expect(map(enumMembers.static[1].path, 'name')).toEqual([
    'Parent',
    'enum',
    'Child'
  ]);
});

test('hierarchy - multisignature', function () {
  const comments = evaluate(function () {
    /**
     * @name Parent
     * @class
     */
    /**
     * @name foo
     * @memberof Parent
     * @instance
     */
    /**
     * @name foo
     * @memberof Parent
     * @instance
     */
  });

  expect(map(comments[0].members.instance, 'name')).toEqual(['foo', 'foo']);
});

test('hierarchy - missing memberof', function () {
  const test = evaluate(function () {
    /**
     * @name test
     * @memberof DoesNotExist
     */
  })[0];

  expect(test.errors).toEqual([
    {
      message: '@memberof reference to DoesNotExist not found',
      commentLineNumber: 2
    }
  ]);
});

test('hierarchy - anonymous', function () {
  const result = evaluate(function () {
    /** Test */
  })[0];

  expect(result.errors).toEqual([
    {
      message: 'could not determine @name for hierarchy'
    }
  ]);
});

test('hierarchy - object prototype member names', function () {
  const comments = evaluate(function () {
    /**
     * @name should
     * @function
     */
    /**
     * @name Assertion
     * @class
     * @memberof should
     */
    /**
     * @name hasOwnProperty
     * @memberof should.Assertion
     * @instance
     * @function
     **/
    /**
     * @name otherMethod
     * @memberof should.Assertion
     * @instance
     * @function
     **/
  });

  expect(map(comments[0].members.static[0].members.instance, 'name')).toEqual([
    'hasOwnProperty',
    'otherMethod'
  ]);
});

test('hierarchy - member namespace defaults to static', function() {
  const comments = evaluate(function() {
    /**
     * @namespace fooNamespace
     */
    /**
     * @class BarClass
     * @memberof fooNamespace
     */
  });

  expect(comments[0].members.static[0].namespace).toEqual(
    'fooNamespace.BarClass'
  );
});
