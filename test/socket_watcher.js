
var posix = require(__dirname + '/../build/default/posixtools.node');

if (posix.fork() == 0) {
var net = require('net'),
    EventEmitter = require("events").EventEmitter,
    inherits = require('sys').inherits;
function Connection(host, port, autoReconnect) {
  this.host = host;
  this.port = port;
  this.autoReconnect = autoReconnect;
  this.drained = true;
  // Reconnect buffer for messages
  this.messages = [];
  // Message sender
  var self = this;
  // Status messages
  this.sizeOfMessage = 0;
  this.bytesRead = 0;
  this.buffer = '';
  this.stubBuffer = '';
}
inherits(Connection, EventEmitter);

// Functions to open the connection
Connection.prototype.open = function() {
  // Assign variable to point to local scope object
  var self = this;
  // Create the associated connection
  this.connection = net.createConnection(this.port, this.host);    
  // Set up the net client
  this.connection.setEncoding("binary");
  // Add connnect listener
  this.connection.addListener("connect", function() {
    this.setEncoding("binary");
    this.setTimeout(0);
    this.setNoDelay();
    self.emit("connect");
  });
  
  this.connection.addListener("error", function(err) {
    self.emit("error", err);
  });
  
  this.connection.addListener("timeout", function(err) {
    self.emit("timeout", err);
  });
  
  // Add a close listener
  this.connection.addListener("close", function() {
    self.emit("close");
  });
  
  // Listener for receive data
  this.receiveListener = function(result) {
    // Check if we have an unfinished message
    if(self.bytesRead > 0 && self.sizeOfMessage > 0) {
      // Calculate remaing bytes to fetch
      var remainingBytes = self.sizeOfMessage - self.bytesRead;
      // Check if we have multiple packet messages and save the pieces otherwise emit the message
      if(remainingBytes > result.length) {
        self.buffer = self.buffer + result; self.bytesRead = self.bytesRead + result.length;
      } else {
        // Cut off the remaining message
        self.buffer = self.buffer + result.substr(0, remainingBytes);
        // Emit the message
        self.emit("data", self.buffer);
        // Reset the variables
        self.buffer = ''; self.bytesRead = 0; self.sizeOfMessage = 0;
        // If message is longer than the current one, keep parsing
        if(remainingBytes < result.length) {
          self.receiveListener(result.substr(remainingBytes, (result.length - remainingBytes)));
        }
      }
    } else {
      if(self.stubBuffer.length > 0) {
        result = self.stubBuffer + result;
        self.stubBuffer = '';
      }

      if(result.length > 4) {
        var sizeOfMessage = BinaryParser.toInt(result.substr(0, 4));
        // We got a partial message, store the result and wait for more
        if(sizeOfMessage > result.length) {
          self.buffer = self.buffer + result; self.bytesRead = result.length; self.sizeOfMessage = sizeOfMessage;
        } else if(sizeOfMessage == result.length) {
          self.emit("data", result);
        } else if(sizeOfMessage < result.length) {
          self.emit("data", result.substr(0, sizeOfMessage));
          self.receiveListener(result.substr(sizeOfMessage, (result.length - sizeOfMessage)));
        }
      } else {
        self.stubBuffer = result;
      }
    }
  };

  // Add a receieved data connection
  this.connection.addListener("data", this.receiveListener);
};

Connection.prototype.close = function() {
  if(this.connection) this.connection.end();
};

  var conn = new Connection("127.0.0.1", 27017);

  conn.on("connect", function() {
    console.error("connected");
    process.exit(0);
  });

  conn.open();
  conn.close();
}
