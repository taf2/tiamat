var posix = require('../build/default/posixtools.node'),
    inherits = require('sys').inherits,
    EventEmitter = require('events').EventEmitter,
    net = require('net'),
    fs = require('fs'),
    vm = require('vm'),
    netBinding = process.binding('net'),
    PipeParser = require(__dirname + '/pipe_parser').PipeParser;

//
// setup a pipe for sending messages to another process over a pipe
//
function WriteChannel(pipe) {
  this.pipe = pipe;
  this.prepare();
}
WriteChannel.prototype.prepare = function() {
  netBinding.close(this.pipe[0]);
  this.writer = new net.Stream();
  this.writer.open(this.pipe[1]);
}
WriteChannel.prototype.send = function(msg) {
  this.writer.write(PipeParser.startToken());
  this.writer.write(JSON.stringify(msg));
  this.writer.write(PipeParser.endToken());
}
WriteChannel.prototype.close = function() {
  this.writer.destroySoon();
}

//
// setup a pipe for receiving messages from another process over a pipe
// emits:
//    message: a complete message
//    error: an error in the message passing e.g. malformated boundary
//    end: stream was closed
//
function ReadChannel(pipe) {
  this.pipe = pipe;
  this.parser = new PipeParser();
  this.parser.on("message", function(msg) { this.emit("message",msg); }.bind(this));
  this.parser.on("error", function(error) { this.emit("error",error); }.bind(this));
  this.prepare();
}
inherits(ReadChannel, EventEmitter);
ReadChannel.prototype.prepare = function() {
  netBinding.close(this.pipe[1]); // close the write fd
  this.reader = new net.Stream();
  this.reader.on('data', this.parser.parse.bind(this.parser));
  this.reader.on('end', function() { this.emit("end"); }.bind(this));
  this.reader.open(this.pipe[0]); // listen on the read fd
  this.reader.resume();
}

var Worker = exports.Worker = function() {
  this._init();
}

Worker.prototype._init = function() {
  this.pipeFDs = [];
  this.pipeFDs.push(netBinding.pipe());
  this.pipeFDs.push(netBinding.pipe());
  this.pid = posix.fork();

  if (this.pid == 0) {
    this.reader = new ReadChannel(this.pipeFDs[0]);
    this.writer = new WriteChannel(this.pipeFDs[1]);
  }
  else {
    this.reader = new ReadChannel(this.pipeFDs[1]);
    this.writer = new WriteChannel(this.pipeFDs[0]);
  }
  console.log("run:" + posix.getpid());
}

Worker.prototype.on = function(event, cb) { // unable to use event emitter FD is used
  this.reader.on(event, cb);
}

Worker.prototype.postMessage = function(message) {
  this.writer.send(message);
};
Worker.prototype.child = function() {
  return (this.pid == 0);
};
Worker.prototype.exit = function() {
  this.writer.close();
};
