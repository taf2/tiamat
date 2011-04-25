var fork = require('../build/default/fork.node'),
inherits = require('sys').inherits,
EventEmitter = require('events').EventEmitter;

// parse messages passed over the pipe scan for \\STAR\n and emit 'message' when \\END\n is parsed
var PipeParser = exports.PipeParser = function() {
  this.reset();
}
inherits(PipeParser, EventEmitter);
PipeParser.prototype.reset = function() {
  this.buffered = null;
  this.stack = new Array();
  this.start_token = false;
  this.stack.push(PipeParser.START_TOKEN[0]);
}
PipeParser.START_TOKEN = [0xFE, 0xFD, 0xFC, 0xFB, 0xFA];
PipeParser.startToken  = function() {
  var buffer = new Buffer(PipeParser.START_TOKEN.length);
  PipeParser.START_TOKEN.forEach(function(i,c) { buffer[c] = i; });
  return buffer;
}
PipeParser.start_lexer = function(c) {
  if (c >= 0xFA) { return c-1; }
  return c;
}
PipeParser.END_TOKEN = [0x04, 0x03, 0x02, 0x01, 0x00];
PipeParser.endToken  = function() {
  var buffer = new Buffer(PipeParser.END_TOKEN.length);
  PipeParser.END_TOKEN.forEach(function(i,c) { buffer[c] = i; });
  return buffer;
}
PipeParser.end_lexer = function(c) {
  if (c > 0x04) { return c; }
  return c - 1;
}

PipeParser.prototype.parse = function(data) {
  if (this.start_token) {
    //console.log("is buffer? " + Buffer.isBuffer(data) + ", length: " + data.length + ", " + fork.getpid());
    var end = data.length;

    for (var i = 0, len = data.length; i < len; ++i) {
      var chr = data[i];
      var next = PipeParser.end_lexer(chr);
      var expected = this.stack[this.stack.length-1];
      //console.log("byte: " + String.fromCharCode(chr).charCodeAt(0) + ", next: " + String.fromCharCode(next).charCodeAt(0) + ", " + String.fromCharCode(expected).charCodeAt(0) + ", " + this.stack.length);

      if (chr == 0x00 && this.stack.length == PipeParser.END_TOKEN.length) {

        //console.log("found end");
        //console.log(this.buffered);
        var buffer = null;
        if (this.buffered.length > 0) {
          this.buffered.push(data.slice(0, i - (PipeParser.END_TOKEN.length-1)));
          // compute final buffer size
          var size = 0;
          this.buffered.forEach(function(buf) { size += buf.length; });
          buffer = new Buffer(size);
          var offset = 0;
          // copy bytes into 1 array... node.js needs a buffer.join...
          this.buffered.forEach(function(buf) {
            buf.copy(buffer, offset, 0, buf.length);
            offset += buf.length;
          });
          //console.log(fork.getpid() + ", multiple buffer");
        }
        else {
          buffer = data.slice(0, i - (PipeParser.END_TOKEN.length-1));
          //console.error(fork.getpid() + "buffer length: %d, %s, %d, %d", buffer.length, buffer, i, data.length);
          //buffer = buffer.slice(0, buffer.length - (PipeParser.END_TOKEN.length-1));
        }
        //this.buffer += data.slice(0, i);
        //this.buffer = this.buffer.slice(0, this.buffer.length - (PipeParser.END_TOKEN.length-1));
        try {
          //console.error(this.stack.join(",") + " => " + buffer.length + ", " + fork.getpid() + ", " + i + ", " + data.length);
          this.emit("message", buffer);
        } catch(e) {
          this.reset();
          throw e;
        }
        this.reset();
        this.parse(data.slice(i+1, data.length));
        return;
      }
      else if (chr == expected) {
        //console.log("grow: '" + chr + "', '" + next + "'");
        this.stack.push(next);
        end--;
      }
      else if (this.stack.length > 1) {
        end = data.length; // reset

        this.stack = new Array();
        this.stack.push(PipeParser.END_TOKEN[0]);
      }
    }
    //this.buffer += data;
    this.buffered.push(data.slice(0, end));
  }
  else {
    //console.log(data);
    for (var i = 0, len = data.length; i < len; ++i) {
      var byte = data[i];
      var next = PipeParser.start_lexer(byte);
      var expected = this.stack[this.stack.length-1];
      //console.log("byte: " + String.fromCharCode(byte).charCodeAt(0) + ", next: " + String.fromCharCode(next).charCodeAt(0) + ", " + String.fromCharCode(expected).charCodeAt(0));
      if (byte == 0xFA && this.stack.length == PipeParser.START_TOKEN.length) {
        //console.log("found start");
        this.start_token = true;
        this.stack = new Array();
        this.stack.push(PipeParser.END_TOKEN[0]);
        this.buffer = new String();
        this.buffered = new Array();
        this.parse(data.slice(i+1, data.length)); // continue parsing with new parser state
        break;
      }
      else if (byte != expected) {
        // error
        this.emit("error", "\tprotocol parse error: expected token: '" +
                              JSON.stringify(expected.toString()) + "', found: '" +
                              JSON.stringify(byte.toString()) + "'\n" +
                              JSON.stringify(this.stack) + ", from: " + data);
        //this.reset();
      }
      else {
        //console.log("parse: " + byte + ", next: " + next);
        this.stack.push(next);
      }
    }
  }
}

// run test cases
if (__filename == process.argv[1]) {
  var start = PipeParser.startToken();
  var end = PipeParser.endToken();
  var pend1 = end.slice(0, 1);
  var pend2 = end.slice(1, end.length);

  var s1 = [start, new Buffer("{\"hel")];
  var s2 = [new Buffer("lo\":\"no",'utf8'),
            new Buffer("de.js\", \"foobar\":\"",'utf8'),
            new Buffer("\"}", 'utf8'),
            pend1, pend2];
  var s3 = [start, new Buffer(JSON.stringify({a: ['b','c','d','e','f'], z:[1,2,3,4]})), end];

  var parser = new PipeParser();
  parser.on("message", function(data) {
    //console.log("data: '%s'\n", data);
    JSON.parse(data);
  });

  s1.forEach(function(buf) { parser.parse(buf); });
  s2.forEach(function(buf) { parser.parse(buf); });
  s3.forEach(function(buf) { parser.parse(buf); });
  s3.forEach(function(buf) { parser.parse(buf); });
  parser.parse(start);
  parser.parse(new Buffer(JSON.stringify("hello"),'utf8'));
  parser.parse(end);

  var size = 0;
  s3.forEach(function(buf) { size += buf.length; });
  var s4 = new Buffer(size);
  var offset = 0;
  // copy bytes into 1 array... node.js needs a buffer.join...
  s3.forEach(function(buf) {
    buf.copy(s4, offset, 0, buf.length);
    offset += buf.length;
  });
  parser.parse(s4);

}
