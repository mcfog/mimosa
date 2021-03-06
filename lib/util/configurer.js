"use strict";
var Module, PRECOMPILE_FUN_REGION_END_RE, PRECOMPILE_FUN_REGION_LINES_MAX, PRECOMPILE_FUN_REGION_SEARCH_LINES_MAX, PRECOMPILE_FUN_REGION_START_RE, baseDefaults, fs, logger, moduleManager, path, processConfig, util, validators, wrench, _, _applyAndValidateDefaults, _extend, _extractPrecompileFunctionSource, _findConfigPath, _moduleDefaults, _requireConfig, _validateSettings, _validateWatchConfig;

path = require('path');

fs = require('fs');

wrench = require('wrench');

logger = require('logmimosa');

_ = require('lodash');

require('coffee-script');

util = require('./util');

validators = require('./validators');

moduleManager = require('../modules');

Module = require('module');

PRECOMPILE_FUN_REGION_START_RE = /^(.*)\smimosa-config:\s*{/;

PRECOMPILE_FUN_REGION_END_RE = /\smimosa-config:\s*}/;

PRECOMPILE_FUN_REGION_SEARCH_LINES_MAX = 5;

PRECOMPILE_FUN_REGION_LINES_MAX = 100;

baseDefaults = {
  minMimosaVersion: null,
  modules: ['lint', 'server', 'require', 'minify', 'live-reload'],
  watch: {
    sourceDir: "assets",
    compiledDir: "public",
    javascriptDir: "javascripts",
    exclude: [/[/\\](\.|~)[^/\\]+$/],
    throttle: 0
  }
};

_extend = function(obj, props) {
  Object.keys(props).forEach(function(k) {
    var val;

    val = props[k];
    if ((val != null) && typeof val === 'object' && !Array.isArray(val) && typeof obj[k] === typeof val) {
      return _extend(obj[k], val);
    } else {
      return obj[k] = val;
    }
  });
  return obj;
};

_findConfigPath = function(file) {
  var configPath, ext, _i, _len, _ref;

  _ref = [".coffee", ".js", ""];
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    ext = _ref[_i];
    configPath = path.resolve("" + file + ext);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }
};

_validateWatchConfig = function(config) {
  var currVersion, errors, i, isHigher, jsDir, minVersionPieces, versionPieces, _i;

  errors = [];
  if (config.minMimosaVersion != null) {
    if (config.minMimosaVersion.match(/^(\d+\.){2}(\d+)$/)) {
      currVersion = require('../../package.json').version;
      versionPieces = currVersion.split('.');
      minVersionPieces = config.minMimosaVersion.split('.');
      isHigher = false;
      for (i = _i = 0; _i <= 2; i = ++_i) {
        if (+versionPieces[i] > +minVersionPieces[i]) {
          isHigher = true;
        }
        if (!isHigher) {
          if (+versionPieces[i] < +minVersionPieces[i]) {
            return ["Your version of Mimosa [[ " + currVersion + " ]] is less than the required version for this project [[ " + config.minMimosaVersion + " ]]"];
          }
        }
      }
    } else {
      errors.push("minMimosaVersion must take the form 'number.number.number', ex: '0.7.0'");
    }
  }
  config.watch.sourceDir = validators.multiPathMustExist(errors, "watch.sourceDir", config.watch.sourceDir, config.root);
  if (errors.length > 0) {
    return errors;
  }
  if (!config.isVirgin) {
    if (typeof config.watch.compiledDir === "string") {
      config.watch.compiledDir = validators.determinePath(config.watch.compiledDir, config.root);
      if (!fs.existsSync(config.watch.compiledDir) && !config.isForceClean) {
        logger.info("Did not find compiled directory [[ " + config.watch.compiledDir + " ]], so making it for you");
        wrench.mkdirSyncRecursive(config.watch.compiledDir, 0x1ff);
      }
    } else {
      errors.push("watch.compiledDir must be a string");
    }
  }
  if (typeof config.watch.javascriptDir === "string") {
    jsDir = path.join(config.watch.sourceDir, config.watch.javascriptDir);
    if (!config.isVirgin) {
      validators.doesPathExist(errors, "watch.javascriptDir", jsDir);
    }
  } else {
    if (config.watch.javascriptDir === null) {
      config.watch.javascriptDir = "";
    } else {
      errors.push("watch.javascriptDir must be a string or null");
    }
  }
  validators.ifExistsFileExcludeWithRegexAndString(errors, "watch.exclude", config.watch, config.watch.sourceDir);
  if (typeof config.watch.throttle !== "number") {
    errors.push("watch.throttle must be a number");
  }
  return errors;
};

_requireConfig = function(configPath) {
  var config, configModule, err, precompileFunSource, raw;

  if (path.extname(configPath)) {
    return require(configPath);
  } else {
    raw = fs.readFileSync(configPath, "utf8");
    config = raw.charCodeAt(0) === 0xFEFF ? raw.substring(1) : raw;
    precompileFunSource = _extractPrecompileFunctionSource(config);
    if (precompileFunSource.length > 0) {
      try {
        config = eval("(" + (precompileFunSource.replace(/;\s*$/, '')) + ")")(config);
      } catch (_error) {
        err = _error;
        if (err instanceof SyntaxError) {
          err.message = "[precompile region] " + err.message;
        }
        throw err;
      }
    }
    configModule = new Module(path.resolve(configPath));
    configModule.filename = configModule.id;
    configModule.paths = Module._nodeModulePaths(path.dirname(configModule.id));
    configModule._compile(config, configPath);
    configModule.loaded = true;
    return configModule.exports;
  }
};

_extractPrecompileFunctionSource = function(configSource) {
  var configLinesRead, functionRegionLinesRead, functionSource, markerLinePrefix, newlinePos, pos, sourceLine, _ref;

  pos = configLinesRead = functionRegionLinesRead = 0;
  while ((pos < configSource.length) && (functionRegionLinesRead ? functionRegionLinesRead < PRECOMPILE_FUN_REGION_LINES_MAX : configLinesRead < PRECOMPILE_FUN_REGION_SEARCH_LINES_MAX)) {
    newlinePos = configSource.indexOf("\n", pos);
    if (newlinePos === -1) {
      newlinePos = configSource.length;
    }
    sourceLine = configSource.substr(pos, newlinePos - pos);
    pos = newlinePos + 1;
    if (!functionRegionLinesRead) {
      if (markerLinePrefix = (_ref = PRECOMPILE_FUN_REGION_START_RE.exec(sourceLine)) != null ? _ref[1] : void 0) {
        functionRegionLinesRead = 1;
        functionSource = "";
      } else {
        configLinesRead++;
      }
    } else {
      if (PRECOMPILE_FUN_REGION_END_RE.test(sourceLine)) {
        return functionSource;
      }
      functionRegionLinesRead++;
      functionSource += "" + (sourceLine.replace(markerLinePrefix, '')) + "\n";
    }
  }
  return "";
};

_validateSettings = function(config, modules) {
  var allConfigKeys, defaults, errors, mod, modKeys, moduleErrors, _i, _len;

  errors = _validateWatchConfig(config);
  if (errors.length === 0) {
    config.extensions = {
      javascript: ['js'],
      css: ['css'],
      template: [],
      copy: []
    };
    config.watch.compiledJavascriptDir = validators.determinePath(config.watch.javascriptDir, config.watch.compiledDir);
  } else {
    return [errors, {}];
  }
  for (_i = 0, _len = modules.length; _i < _len; _i++) {
    mod = modules[_i];
    if (mod.validate == null) {
      continue;
    }
    if (mod.defaults != null) {
      config = _.clone(config, true);
      allConfigKeys = Object.keys(config);
      defaults = mod.defaults();
      modKeys = typeof defaults === "object" && !Array.isArray() ? Object.keys(defaults) : [];
      allConfigKeys.forEach(function(key) {
        if (modKeys.indexOf(key) < 0 && typeof config[key] === "object") {
          return util.deepFreeze(config[key]);
        }
      });
    } else {
      util.deepFreeze(config);
    }
    moduleErrors = mod.validate(config, validators);
    if (moduleErrors) {
      errors.push.apply(errors, moduleErrors);
    }
  }
  config = _.clone(config, true);
  return [errors, config];
};

_moduleDefaults = function(modules) {
  var defs, mod, _i, _len;

  defs = {};
  for (_i = 0, _len = modules.length; _i < _len; _i++) {
    mod = modules[_i];
    if (mod.defaults != null) {
      _.extend(defs, mod.defaults());
    }
  }
  _.extend(defs, baseDefaults);
  return defs;
};

_applyAndValidateDefaults = function(config, callback) {
  var moduleNames, _ref;

  moduleNames = (_ref = config.modules) != null ? _ref : baseDefaults.modules;
  return moduleManager.getConfiguredModules(moduleNames, function(modules) {
    var err, errors, _ref1;

    config.root = process.cwd();
    config = _extend(_moduleDefaults(modules), config);
    _ref1 = _validateSettings(config, modules), errors = _ref1[0], config = _ref1[1];
    err = errors.length === 0 ? (logger.debug("No mimosa config errors"), null) : errors;
    return callback(err, config, modules);
  });
};

processConfig = function(opts, callback) {
  var config, err, mainConfigPath, profileConfig, profileConfigPath;

  config = {};
  mainConfigPath = _findConfigPath("mimosa-config");
  if (mainConfigPath != null) {
    try {
      config = _requireConfig(mainConfigPath).config;
    } catch (_error) {
      err = _error;
      return logger.fatal("Improperly formatted configuration file [[ " + mainConfigPath + " ]]: " + err);
    }
  } else {
    logger.warn("No configuration file found (mimosa-config.coffee/mimosa-config.js/mimosa-config), running from current directory using Mimosa's defaults.");
    logger.warn("Run 'mimosa config' to copy the default Mimosa configuration to the current directory.");
  }
  logger.debug("Your mimosa config:\n" + (JSON.stringify(config, null, 2)));
  if (opts.profile) {
    if (!config.profileLocation) {
      config.profileLocation = "profiles";
    }
    profileConfigPath = _findConfigPath(path.join(config.profileLocation, opts.profile));
    if (profileConfigPath != null) {
      try {
        profileConfig = _requireConfig(profileConfigPath).config;
      } catch (_error) {
        err = _error;
        return logger.fatal("Improperly formatted configuration file [[ " + profileConfigPath + " ]]: " + err);
      }
      logger.debug("Profile config:\n" + (JSON.stringify(profileConfig, null, 2)));
      config = _extend(config, profileConfig);
      logger.debug("mimosa config after profile applied:\n" + (JSON.stringify(config, null, 2)));
    } else {
      return logger.fatal("Profile provided but not found at [[ " + (path.join('profiles', opts.profile)) + " ]]");
    }
  }
  config.isVirgin = opts != null ? opts.virgin : void 0;
  config.isServer = opts != null ? opts.server : void 0;
  config.isOptimize = opts != null ? opts.optimize : void 0;
  config.isMinify = opts != null ? opts.minify : void 0;
  config.isForceClean = opts != null ? opts.force : void 0;
  config.isClean = opts != null ? opts.clean : void 0;
  config.isBuild = opts != null ? opts.build : void 0;
  config.isWatch = opts != null ? opts.watch : void 0;
  config.isPackage = opts != null ? opts["package"] : void 0;
  config.isInstall = opts != null ? opts.install : void 0;
  return _applyAndValidateDefaults(config, function(err, newConfig, modules) {
    if (err) {
      logger.error("Unable to start Mimosa for the following reason(s):\n * " + (err.join('\n * ')) + " ");
      return process.exit(1);
    } else {
      logger.debug("Full mimosa config:\n" + (JSON.stringify(newConfig, null, 2)));
      logger.setConfig(newConfig);
      return callback(newConfig, modules);
    }
  });
};

module.exports = processConfig;
