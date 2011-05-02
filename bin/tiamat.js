/*
  Tiamat is a multi headed forking server.
*/
require.paths.unshift(__dirname + "/../lib");

var Tiamat = require("tiamat/server.js").Tiamat;
var Daemon = require("tiamat/daemon.js");
var Config = require("tiamat/config.js").ConfigLoader;
var opt    = require('getopt');

function cli() {
  var opt = require('getopt');
  opt.setopt("hdc::");
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
      default:
        break;
    }
  });
  return options;
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
    console.log("loaded");
    console.log(config);
    runApp(config);
  });
  config.load(options['config']);
}
else {
  console.log(options);
  runApp(options);
}
