var geoip = require('geoip');
var querystring = require('querystring');
var geodb = geoip.open(__dirname + "/../../GeoLiteCity.dat");

// create the HTTP server
var http = require('http');
var server = http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  var params = querystring.parse(req.url.split('?')[1]);
  ipaddr = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  if (ipaddr == '127.0.0.1') { ipaddr = '173.13.232.33'; }
  var record = geoip.City.record_by_addr(geodb, ipaddr);
  res.end('Hello World:' + process.pid + '\n' + JSON.stringify(record) + "\n");
});
if (!process.env.TIAMAT) {
  server.listen(4001);
}

module.exports = server;
