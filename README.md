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

It now should be possible to wrap all this into a nicer Worker interface e.g. http://dev.w3.org/html5/workers/
The one issue with the Worker interface when using fork is after forking we can't allow the child/worker process
to continue through the main execution path... so we'll probably need somthing slightly different
e.g.

  var worker = new Worker('worker.js'); // forks
  if (worker.child()) { // the child process loads and either evals worker.js or runs worker.js in a sandbox...
    return; // prevent child process from further execution
  }
  worker.on("message", function(msg) {
    console.log(msg);
  });
  worker.post({msg:"hello"});

The one component of this that is possibly not as nice is that we use a pipe to communicate between the parent and child process.
The result is we need to use a protocol to parse the messages from the parent to the child and from the child to the parent. (2 pipes)
If we had threads we could avoid the protocol parsing and just use a queue data strucutre, that might make the message passing faster,
but the advantage of separate processes and sandboxing is security and robustness a worker might die but the parent can live on and recover...

Again, this is all just a work in progress and the goal here is allow synchronous code to run in a separate worker process while the main process
handles incoming HTTP requests.  Feedback on this approach would be awesome.
