var fs           = require('fs'),
    path         = require('path'),
    inherits     = require('sys').inherits,
    EventEmitter = require('events').EventEmitter;

/*
  Allow configuration files to be loaded as JavaScript
*/
var ConfigLoader = exports.ConfigLoader = function() { }
inherits(ConfigLoader, EventEmitter);

ConfigLoader.prototype.load = function(config_path) {
  var config = require(config_path);

  this.options = config.load();

  this.options.config_path = config_path;

  this.emit("loaded", this.options);
}
ConfigLoader.prototype.verify = function(config) {
  if (!config.worker_app) {
    console.error("Must provide a worker_app in either a referenced configuration file or as -s 'your_app.js'");
    return false;
  }

  if (!path.existsSync(config.worker_app)) {
    console.error("Worker app path not found: %s", config.worker_app);
    return false;
  }

  if (config.stderr_path && !path.existsSync(path.dirname(config.stderr_path))) {
    console.error("stderr path not found: %s", config.stderr_path);
    return false;
  }

  if (config.stdout_path && !path.existsSync(path.dirname(config.stdout_path))) {
    console.error("stdout path not found: %s", config.stdout_path);
    return false;
  }

  if (config.pidfile && !path.existsSync(path.dirname(config.pidfile))) {
    console.error("pidfile path not found: %s", config.pidfile);
    return false;
  }

  if (config.working_directory && !path.existsSync(config.working_directory)) {
    console.error("working_directory path not found: %s", config.working_directory);
    return false;
  }
  return true;
};

ConfigLoader.prototype.defaults = function(config) {

  if (!config.tcp) { config.tcp = 'tcp4'; }
  if (!config.backlog) { config.backlog = 128; }
  if (!config.listen_sock && !config.listen_port) { config.listen_port = 1337; }
  if (!config.listen_sock && !config.listen_addr) { config.listen_addr = "127.0.0.1"; }
  if (!config.workers) { config.workers = 1; }
  if (!config.working_directory) { config.working_directory = process.cwd(); }
  if (config.daemonize && !config.stderr_path) { config.stderr_path = "/dev/null"; }
  if (config.daemonize && !config.stdout_path) { config.stdout_path = "/dev/null"; }
  if (config.daemonize && !config.pidfile) { config.pidfile = "/tmp/tiamat-" + process.pid + ".pid"; }
  if (!config.timeout) { config.timeout = 45; }

  config.timeout *= 1000;

  return config;
};

if (process.argv[1] == __filename) {
  console.log("load it");
  var config = new ConfigLoader();
  config.on("loaded", function(config) {
    console.log("loaded");
    console.log(config);
  });
  config.load("config.js");
}
