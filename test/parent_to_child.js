var posix = require(__dirname + '/../build/default/posixtools.node');
var net = require("net");
var fs = require("fs");
var netBinding = process.binding('net');

var pipeFDs = netBinding.pipe();
var pid = posix.fork();

if (pid == 0) {
  netBinding.close(pipeFDs[1]); // close the write fd
  console.log("child:"  + posix.getpid());
  var pipeReadStream = new net.Stream();
  pipeReadStream.addListener('data', function(data) {
    console.log(data.toString('utf8'));
  });
  pipeReadStream.addListener('end', function(data) {
    console.log("parent closed the write pipe\r\n");
  });
  pipeReadStream.open(pipeFDs[0]);
  pipeReadStream.resume();
}
else {
  netBinding.close(pipeFDs[0]); // close the read fd 
  console.log("parent:" + posix.getpid());
  var pipeWriteStream = new net.Stream();
  pipeWriteStream.open(pipeFDs[1]);
  pipeWriteStream.write("\nhello child\r\n");
  netBinding.close(pipeFDs[1]); // close the write fd 
}
