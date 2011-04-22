var net = require('net');
var fork = require(__dirname + '/../build/default/fork.node');

var sockpath = 'socket';
// create a server
var server = net.createServer(function (c) {
  c.write('hello\r\n', 'utf8');
  c.pipe(c);
  console.log("exit parent");
  process.exit(0);
});

var pid = fork.fork();

if (pid > 0) {
  console.log("parent:" + fork.getpid());
  server.listen(sockpath);
}
else {
  delete server;
  console.log("child:"  + fork.getpid());
  setTimeout(function() {
    // create a client to connect to parent server
    var client = new net.Socket({type:'unix'});
    client.connect(sockpath, function() { console.log("connected"); });
    client.on("data", function(d) { console.log(d.toString('utf8')); });
  }, 100);
}
