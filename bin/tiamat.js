#!/usr/bin/env node
/*
  Tiamat is a multi headed forking server.
*/
require.paths.unshift(__dirname + "/../lib");

var Tiamat = require("tiamat/server.js").Tiamat;
var Daemon = require("tiamat/daemon.js");
var Config = require("tiamat/config.js").ConfigLoader;
var opt    = require('getopt');
var path   = require('path');

function cli() {
  var opt = require('getopt');
  opt.setopt("hdc:s:p::");
  var options = {};

  opt.getopt(function (o, p) {
    switch (o) {
      case "h":
        opt.showHelp("tiamat", function (o) {
          switch (o) {
            case "h": return "Show this help menu";
            case "c": return "Server configuration path";
            case "d": return "Daemonize the server";
            default:  return "Option '"+o+"'";
          }
        });
        process.exit(0);
        break;
      case "c":
        options['config'] = p[0];
        break;
      case "d":
        options['daemonize'] = true;
        break;
      case "s":
        if (!p[0].match(/^\//)) {
          options['worker_app'] = path.join(process.cwd(),  p[0]);
        }
        else {
          options['worker_app'] = p[0];
        }
        break;
      case "p":
        options['listen_port'] = p[0];
        break;
      default:
        break;
    }
  });
  return options;
}

function verifyConfig(config) {
  if (!config['worker_app']) {
    console.error("Must provide a worker_app in either a referenced configuration file or as -s 'your_app.js'");
    process.exit(1);
  }
}

function applyDefaults(config) {
  if (!config['tcp']) { config['tcp'] = 'tcp4'; }
  if (!config['backlog']) { config['backlog'] = 128; }
  if (!config['listen_sock'] && !config['listen_port']) { config['listen_port'] = 1337; }
  if (!config['listen_sock'] && !config['listen_addr']) { config['listen_addr'] = "127.0.0.1"; }
  if (!config['workers']) { config['workers'] = 1; }
  if (!config['working_directory']) { config['working_directory'] = process.cwd(); }
  if (!config['stderr_path']) { config['stderr_path'] = "/dev/null"; }
  if (!config['stdout_path']) { config['stdout_path'] = "/dev/null"; }
  if (!config['pidfile']) { config['pidfile'] = "/tmp/tiamat-" + process.pid + ".pid"; }
  return config;
}

function runApp(config) {
  if (process.env['__NIX_FD'] || !config.daemonize) { // reexec from old master or just don't daemonize
    Tiamat(config);
  }
  else {
    console.log("running app as a daemon");
    Daemon.daemonize(function() {
      Tiamat(config);
    }, config.working_directory, config.stdout_path, config.stderr_path);
  }
}

var options = cli();

if (options['config']) {
  var config = new Config();
  config.on("loaded", function(config) {
    config = applyDefaults(config);
    verifyConfig(config);
    runApp(config);
  });
  config.load(options['config']);
}
else {
  options = applyDefaults(options);
  verifyConfig(options);
  runApp(options);
}
