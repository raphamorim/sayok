#! /usr/bin/env node

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var notifier = path.join(__dirname, 'terminal-notifier');

if (os.type() !== 'Darwin')
  return null;

function removeNewLines(str) {
  var excapedNewline = process.platform === 'win32' ? '\\r\\n' : '\\n';
  return str.replace(/\r?\n/g, excapedNewline);
};

function escapeQuotes(str) {
  if (typeof str === 'string') {
    return str.replace(/(["$`\\])/g, '\\$1');
  } else {
    return str;
  }
};

function isArray(arr) {
  return Object.prototype.toString.call(arr) === '[object Array]';
};

function mapIconShorthand(options) {
  if (options.i) {
    options.icon = options.i;
    delete options.i;
  }

    return options;
};

function mapText(options) {
  if (options.text) {
    options.message = options.text;
    delete options.text;
  }

  return options;
};

function mapToMac(options) {
  options = mapIconShorthand(options);
  options = mapText(options);

  if (options.icon) {
    options.appIcon = options.icon;
    delete options.icon;
  }

  if (options.sound === true) {
    options.sound = 'Bottle';
  }

  if (options.sound === false) {
    delete options.sound;
  }

  if (options.sound && options.sound.indexOf('Notification.') === 0) {
    options.sound = 'Bottle';
  }

  if (options.wait === true) {
    if (!options.timeout) {
      options.timeout = 5;
    }
    delete options.wait;
  }

  options.json = true;
  return options;
};

function actionJackerDecorator(emitter, options, fn, mapper) {
  fn = fn || noop;

  if (typeof fn !== 'function') {
    throw new TypeError(
      'The second argument must be a function callback. You have passed ' +
        typeof fn
    );
  }

  return function(err, data) {
    var resultantData = data;
    var metadata = {};
    // Allow for extra data if resultantData is an object
    if (resultantData && typeof resultantData === 'object') {
      metadata = resultantData;
      resultantData = resultantData.activationType;
    }

    // Sanitize the data
    if (resultantData) {
      resultantData = resultantData.toLowerCase().trim();
      if (resultantData.match(/^activate|clicked$/)) {
        resultantData = 'activate';
      }
    }

    fn.apply(emitter, [err, resultantData, metadata]);
    if (!mapper || !resultantData) return;

    var key = mapper(resultantData);
    if (!key) return;
    emitter.emit(key, emitter, options, metadata);
  };
};


function fileCommandJson(notifier, options, cb) {
  if (process.env.DEBUG && process.env.DEBUG.indexOf('notifier') !== -1) {
    console.info('node-notifier debug info (fileCommandJson):');
    console.info('[notifier path]', notifier);
    console.info('[notifier options]', options.join(' '));
  }
  return cp.execFile(notifier, options, function(error, stdout, stderr) {
    if (error) return cb(error, stdout);
    if (!stdout) return cb(error, {});

    try {
      var data = JSON.parse(stdout);
      cb(stderr, data);
    } catch (e) {
      cb(e, stdout);
    }
  });
};

function constructArgumentList(options, extra) {
  var args = [];
  extra = extra || {};

  // Massive ugly setup. Default args
  var initial = extra.initial || [];
  var keyExtra = extra.keyExtra || '';
  var allowedArguments = extra.allowedArguments || [];
  var noEscape = extra.noEscape !== void 0;
  var checkForAllowed = extra.allowedArguments !== void 0;
  var explicitTrue = !!extra.explicitTrue;
  var keepNewlines = !!extra.keepNewlines;
  var wrapper = extra.wrapper === void 0 ? '"' : extra.wrapper;

  var escapeFn = function(arg) {
    if (isArray(arg)) {
      return removeNewLines(arg.join(','));
    }

    if (!noEscape) {
      arg = escapeQuotes(arg);
    }
    if (typeof arg === 'string' && !keepNewlines) {
      arg = removeNewLines(arg);
    }
    return wrapper + arg + wrapper;
  };

  initial.forEach(function(val) {
    args.push(escapeFn(val));
  });
  for (var key in options) {
    if (
      options.hasOwnProperty(key) &&
      (!checkForAllowed || inArray(allowedArguments, key))
    ) {
      if (explicitTrue && options[key] === true) {
        args.push('-' + keyExtra + key);
      } else if (explicitTrue && options[key] === false) continue;
      else args.push('-' + keyExtra + key, escapeFn(options[key]));
    }
  }
  return args;
};


function Notification(options) {
  if (!(this instanceof Notification)) {
    return new Notification(options);
  }
  this.options = options;

  EventEmitter.call(this);
}
util.inherits(Notification, EventEmitter);
var activeId = null;

Notification.prototype.notify = function(options, callback) {
  var fallbackNotifier;
  var id = { _ref: 'val' };
  activeId = id;

  if (typeof options === 'string') {
    options = { title: 'node-notifier', message: options };
  }
  callback = callback || function() {};

  if (typeof callback !== 'function') {
    throw new TypeError(
      'The second argument must be a function callback. You have passed ' +
        typeof fn
    );
  }

  var actionJackedCallback = actionJackerDecorator(
    this,
    options,
    callback,
    function(data) {
      if (activeId !== id) return false;

      if (data === 'activate') {
        return 'click';
      }
      if (data === 'timeout') {
        return 'timeout';
      }
      if (data === 'replied') {
        return 'replied';
      }
      return false;
    }
  );

  options = mapToMac(options);

  if (!options.message && !options.group && !options.list && !options.remove) {
    callback(new Error('Message, group, remove or list property is required.'));
    return this;
  }

  var argsList = constructArgumentList(options);
  fileCommandJson(
    this.options.customPath || notifier,
    argsList,
    actionJackedCallback
  );
  return this;
};

Notification({}).notify({
  title: require(path.resolve(process.cwd(), 'package.json')).name,
  message: 'Task Succeed!',
  icon: path.join(__dirname, 'checked.png'),
  sound: false,
  wait: false,
  timeout: 1.5,
  type: 'info',
});
