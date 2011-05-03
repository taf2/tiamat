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
  var config = require(config_path);

  this.options = config.load();

  this.emit("loaded", this.options);
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
