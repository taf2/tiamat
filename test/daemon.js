// create a daemon using fork the parent process will go away after daemonize
var fs = require("fs");

daemonize = require(__dirname + "/../lib/daemon.js").daemonize;

daemonize(function() {
  console.log("daemonized");

  var http = require('http');
  http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Hello World\n');
  }).listen(1337, "127.0.0.1");

  console.log("done?");
}, __dirname, "stdout.log", "stderr.log", "daemon.pid");
