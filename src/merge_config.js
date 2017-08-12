/* @flow */

var yaml = require('js-yaml'),
  fs = require('fs'),
  pify = require('pify'),
  readPkgUp = require('read-pkg-up'),
  path = require('path'),
  stripComments = require('strip-json-comments');

function processToc(config: DocumentationConfig, absFilePath: string) {
  if (!config || !config.toc) {
    return config;
  }

  config.toc = config.toc.map(entry => {
    if (entry && entry.file) {
      entry.file = path.join(path.dirname(absFilePath), entry.file);
    }

    return entry;
  });

  return config;
}

/**
 * Use the nearest package.json file for the default
 * values of `name` and `version` config.
 *
 * @param {Object} config the user-provided config, usually via argv
 * @returns {Promise<Object>} configuration with inferred parameters
 * @throws {Error} if the file cannot be read.
 */
async function mergePackage(config: Object): Promise<Object> {
  if (config.noPackage) {
    return Promise.resolve(config);
  }
  try {
    const pkg = await readPkgUp();
    ['name', 'homepage', 'version'].forEach(key => {
      config[`project-${key}`] = config[`project-${key}`] || pkg.pkg[key];
    });
  } catch (_) {
    return config;
  }
  return config;
}

/**
 * Merge a configuration file into program config, assuming that the location
 * of the configuration file is given as one of those config.
 *
 * @param {Object} config the user-provided config, usually via argv
 * @returns {Promise<Object>} configuration, if it can be parsed
 * @throws {Error} if the file cannot be read.
 */
async function mergeConfigFile(config): Promise<Object> {
  if (config && typeof config.config === 'string') {
    var filePath = config.config;
    var ext = path.extname(filePath);
    var absFilePath = path.resolve(process.cwd(), filePath);
    const rawFile = await pify(fs).readFile(absFilePath, 'utf8');
    if (ext === '.json') {
      return Object.assign(
        {},
        config,
        processToc(JSON.parse(stripComments(rawFile)), absFilePath)
      );
    }
    return Object.assign(
      {},
      config,
      processToc(yaml.safeLoad(rawFile), absFilePath)
    );
  }

  return Promise.resolve(config || {});
}

function mergeConfig(config: Object): Promise<DocumentationConfig> {
  config.parseExtension = (config.parseExtension || [])
    .concat(['js', 'jsx', 'es5', 'es6']);

  return mergeConfigFile(config).then(mergePackage);
}

module.exports = mergeConfig;
