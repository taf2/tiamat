# fork.node

Add fork to node.js

## Install

  npm install fork

## Fork away

    var fork = require('fork');

    var pid = fork.fork();

    if (pid ==0) {
      console.log("child:"  + fork.getpid());
    }
    else {
      console.log("parent:" + fork.getpid());
    }

Okay that's kinda neat now you have two processes, but how do you make them talk?  How about a pipe!

    var net = require("net");
    var netBinding = process.binding('net');

    var pipeFDs = netBinding.pipe();
    var pid = fork.fork();

    if (pid == 0) {
      netBinding.close(pipeFDs[1]); // close the write fd
      console.log("child:"  + fork.getpid());
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
      console.log("parent:" + fork.getpid());
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
