var fork = require(__dirname + '/../build/default/fork.node');
var PipeParser = require(__dirname + '/../lib/pipe_parser').PipeParser;
var net = require("net");
var fs = require("fs");
var netBinding = process.binding('net');

var pipeFDs = [];
pipeFDs.push(netBinding.pipe());
pipeFDs.push(netBinding.pipe());
var pid = fork.fork();

function prepareTalk(pipe) {
  netBinding.close(pipe[0]); // close the read fd 
  var pipeWriteStream = new net.Stream();
  pipeWriteStream.open(pipe[1]);
  return pipeWriteStream;
}
function prepareListen(pipe) {
  netBinding.close(pipe[1]); // close the write fd
}

function talkOnPipe(writeStream, msg) {
  var output = [PipeParser.startToken(), new Buffer(JSON.stringify(msg)), PipeParser.endToken()];
  output.forEach(function(out) {
    writeStream.write(out);
    writeStream.flush();
  });
}
function listenOnPipe(parser, pipe, cb) {
  var pipeReadStream = new net.Stream();

  pipeReadStream.addListener('data', function(data) {
    parser.parse(data);
    pipeReadStream.resume();
  });

  pipeReadStream.addListener('end', function(data) {
    console.log(fork.getpid() + " write pipe was closed");
  });
  pipeReadStream.open(pipe[0]); // listen on the read fd
  pipeReadStream.resume();
}

if (pid == 0) {
  console.log("child:"  + fork.getpid());
  prepareListen(pipeFDs[0]);
  var writeStream = prepareTalk(pipeFDs[1]);
  var parser = new PipeParser();
  parser.on("message", function(data) {
    console.log(fork.getpid() + ", child received: %s, %s", data, JSON.parse(data));
  });
  parser.on("error", function(msg) { console.error(msg); });
  listenOnPipe(parser, pipeFDs[0], function() {
    console.log("parent closed write pipe");
  });

  for (var i = 0; i < 1000; ++i) {
    talkOnPipe(writeStream, {message:("hello parent, " + i)});
  }
  writeStream.destroySoon();
}
else {
  console.log("parent:" + fork.getpid());
  prepareListen(pipeFDs[1]);
  var writeStream = prepareTalk(pipeFDs[0]);
  var parser = new PipeParser();
  parser.on("message", function(data) {
    console.log(fork.getpid() + ", parent received: %s, %s", data, JSON.parse(data));
  });
  parser.on("error", function(msg) { console.error(msg); });
  listenOnPipe(parser, pipeFDs[1], function() {
    console.log("child closed write pipe");
  });
  for (var i = 0; i < 1000; ++i) {
    talkOnPipe(writeStream, {message:("hello child, " + i)});
  }
  writeStream.destroySoon();
  //netBinding.close(pipeFDs[1][0]);
}
