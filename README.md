# Tiamat

A forking server for node.js - think multi process non blocking server

## Install

    npm install tiamat


## Running with Tiamat

Tiamat loads a worker.js script that should export a run method.  The run method should return your server.

The server can be an HTTP Server or any other kind of TCP server.

Tiamat simply passes the listening file descriptor down to each worker. Inside of each worker process Tiamat, will require the worker.js script
invoke run and call listenFD on the returned server object.

## The Config File

In the configuration file you tell Tiamat where you want things like stdout and stderr to be redirected.  How many worker processes to start, what port to listen on etc...

    exports.load = function() {
      return {
        tcp: 'tcp4',
        backlog: 128,
        listen_addr: "127.0.0.1",
        listen_port: 1337,
        workers: 2,
        timeout: 45,
        worker_app: __dirname + "/test/worker1.js",
        daemonize: true,
        working_directory: __dirname,
        stderr_path: __dirname + "/stderr.log",
        stdout_path: __dirname + "/stdout.log",
        pidfile: __dirname + "/pidfile.pid",
        before_exec: function() {
          console.error("before exec");
        },
        before_fork: function() {
          console.error("before fork");
        },
        after_fork: function() {
          console.error("after fork");
        }
      }
    };

## Define your application as an export

    exports.run = function() {
      // create the HTTP server
      var http = require('http');
      var server = http.createServer(function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hello World:' + process.pid + '\n');
      });
      return server;
    }

## Run your application

    tiamat.js -s your_app.js -p 3000


## How It Works?

Tiamat adds a few native functions fork, execve, etc... to make the whole process of managing multiple worker processes simple

For example, to access Tiamat's posix layer you can simply require posixtools and call fork.

    var posix = require('posixtools');

    var pid = posix.fork();

    if (pid ==0) {
      console.log("child:"  + posix.getpid());
    }
    else {
      console.log("parent:" + posix.getpid());
    }

Okay that's kinda neat now you have two processes, but how do you make them talk?  How about a pipe!

    var net = require("net");
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
      pipeReadStream.addListener('data', function(data) {
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
      pipeWriteStream.write("\nhello unix\r\n");
      netBinding.close(pipeFDs[1]); // close the read fd 
    }

Okay that's nice but pipes are tricky and ensuring a complete message is even harder, how about this:

    var worker = new Worker();

    if (worker.child()) {
      worker.on("message", function(data) {
        console.log("message from parent: " + data);
        worker.postMessage("hello parent");
      });

      worker.postMessage("hello parent");
    }
    else {

      worker.on("message", function(data) {
        console.log("message from child: " + data);
      });

      worker.postMessage("hello child");

      worker.exit(); // tell the worker to exit once it's finished
    }
