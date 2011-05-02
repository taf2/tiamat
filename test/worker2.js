exports.run = function() {
  // create the HTTP server
  var http = require('http');
  var server = http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Hello World:' + process.pid + '\n');
  });
  return server;
}
