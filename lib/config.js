var vm         = require('vm'),
    fs         = require('fs'),
    path       = require('path'),
inherits = require('sys').inherits,
EventEmitter = require('events').EventEmitter;

/*
  Allow configuration files to be loaded as JavaScript
*/
var ConfigLoader = exports.ConfigLoader = function() { }
inherits(ConfigLoader, EventEmitter);

ConfigLoader.prototype.load = function(config_path) {
  this.options = {};

  // expose some nice things into the config context...
  this.options.__dirname = path.resolve(path.normalize(path.dirname(config_path)));
  this.options.require = function(p) { return require(p); }
  this.options.console = {error: console.error, log: console.log };
  this.options.process = process;

  fs.readFile(config_path, function (err, data) {
    if (err) throw err;
    vm.runInNewContext(data, this.options, config_path);
    this.emit("loaded", this.options);
  }.bind(this));
  console.log("reading file: %s", config_path);
}

if (process.argv[1] == __filename) {
  console.log("load it");
  var config = new ConfigLoader();
  config.on("loaded", function(config) {
    console.log("loaded");
    console.log(config);
  });
  config.load("config.js");
}
