// create a daemon using fork the parent process will go away after daemonize
var net        = require('net'),
    http       = require('http'),
    spawn      = require('child_process').spawn,
    fs         = require('fs'),
    netBinding = process.binding('net'),
    Daemon     = require(__dirname + "/../lib/daemon.js"),
    fork       = require(__dirname + '/../build/default/fork.node');

if (!Array.prototype.remove) {
// Array Remove - By John Resig (MIT Licensed)
Array.prototype.remove = function(from, to) {
  var rest = this.slice((to || from) + 1 || this.length);
  this.length = from < 0 ? this.length + from : from;
  return this.push.apply(this, rest);
};
}


/*KILLSIGS = ["SIGINT","SIGQUIT","SIGILL","SIGTRAP",
            "SIGABRT","SIGEMT","SIGFPE","SIGKILL","SIGBUS","SIGSEGV","SIGSYS","SIGPIPE","SIGALRM","SIGTERM",
            "SIGURG","SIGSTOP","SIGTSTP","SIGCONT",,"SIGTTIN","SIGTTOU","SIGIO","SIGXCPU","SIGXFSZ",
            "SIGVTALRM","SIGPROF","SIGWINCH","SIGINFO","SIGUSR1","SIGUSR2"];
*/
KILLSIGS = ["SIGINT","SIGTERM"];

function TCPServer() {
  this.socket = null;
}

TCPServer.prototype = {
}

function TCPWorker(socket) {
}

TCPWorker.prototype = {
}

/*
  Daemon.daemonize(function() {
    var server = new TCPServer();
    server.configure(config_path);
    server.preload();
    server.bind();
    server.execute();
  });
*/

// similar to ruby unicorn
Daemon.daemonize(function() {

  var pidfile = null;
  var workers = [];
  var mastersigs = ['SIGINT', 'SIGTERM', 'SIGCHLD', 'SIGHUP', 'SIGQUIT', 'SIGTTIN', 'SIGTTIN', 'SIGWINCH'];
  var sigqueue = [];
  var server_socket = netBinding.socket('tcp4');
  var pipeFDs = null;
  var reader = null;
  var writer = null;
  var workerProcesses = 2;

  function exitMaster() {
    process.exit(0);
  }

  function wakeupMaster() {
    console.error("wake :" + fork.getpid());
    writer.write("."); // wake up
  }
  function sigQueue() {
    console.error("queue: " + this);
    sigqueue.push(this);
    wakeupMaster();
  }

  function tearDownMaster() {
    console.error("Exiting(" + process.pid + ")");
    // signal all our child processes to exit also
    signalWorkers('SIGTERM');
    fs.unlinkSync(pidfile);
  }

  function killWorker(pid, sig) {
    console.error("send(%d): %d, %s", fork.getpid(), pid, sig);
    try { process.kill(pid, sig); } catch(e) { console.error("error"); console.error(e); }
  }

  function signalWorkers(sig) {
    workers.forEach(function(cpid) {
      killWorker(cpid, sig);
    });
  }

  function reapWorkers() {
    // reap workers
    var update_pids = [];
    var pid;

    for (var index = 0, len = workers.length; index < len; ++index) {
      var pid = workers[index];
      var status = fork.isalive(pid);
      if (!status) {
        console.error("pid: %d is dead", pid);
        if ((pid=forkWorker(index)) == 0) {
          return true;  // child's done
        }
        update_pids.push([index, pid]);
      }
    }
    update_pids.forEach(function(set) {
      workers[set[0]] = set[1];
    });
    console.error("reaped");
    console.error(workers);
    return false;
  }

  function runWorker(fd,id) {
    try {
      if (process.platform != 'darwin') { // setting the process title on Mac is not really safe...
        process.title = "node worker[" + id + "]";
      }
      console.error(fork.getpid() + ", parent is: %d", fork.getppid());

      // create the HTTP server
      var http = require('http');
      http.createServer(function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hello World:' + fork.getpid() + '\n');
      }).listenFD(fd);

    } catch(e) {
      console.error("run worker error: %s", e.message);
      console.error(e);
    }
  }

  // unregister events setup by master 
  function resetWorker() {
    sigqueue = [];
    mastersigs.forEach(process.removeAllListeners.bind(process));
    process.removeAllListeners('exit');
  }

  function workerSignals() {
    KILLSIGS.forEach(function(sig) {
      process.on(sig, function() { process.exit(0); });
    });
    process.on("SIGQUIT", function() {
      process.exit(0); // do we need to ensure we've finished any in progress requests?
    });
  }

  function forkWorker(i) {
    var pid = fork.fork();
    if (pid == 0) {
      fork.setsid();
      resetWorker();
      workerSignals();
      runWorker(server_socket, i);
      return 0;
    }
    console.error("save pid: %d, %d", pid, i);
    return pid;
  }

  function reloadConfig() {
    // reload config
    // restart workers
    signalWorkers('SIGQUIT'); // send them the quit signal and master will later reboot them
  }
  
  function shutdownGraceful() {
  }

  function runMaster(workers) {

    pipeFDs = netBinding.pipe();
    reader = new net.Stream();
    writer = new net.Stream();

    KILLSIGS.forEach(function(sig) { process.on(sig, exitMaster); });
    process.on('exit', tearDownMaster);
    process.on('SIGCHLD', wakeupMaster);

    process.on('SIGHUP',   sigQueue.bind({sig:'SIGHUP'}));
    process.on('SIGQUIT',  sigQueue.bind({sig:'SIGQUIT'}));
    process.on('SIGTTIN',  sigQueue.bind({sig:'SIGTTIN'}));
    process.on('SIGTTOU',  sigQueue.bind({sig:'SIGTTOU'}));
    process.on('SIGWINCH', sigQueue.bind({sig:'SIGWINCH'}));

    if (!pidfile) { pidfile = "/tmp/server." + fork.getpid() + ".pid"; }

    // create the pidfile
    fs.open(pidfile,"w", 0666, function(err, fd) {
      fs.writeSync(fd, fork.getpid().toString());
      fs.close(fd);
    });

    // control signals and reapworkers
    reader.on("data", function() {
      var sig = null;
      if (reapWorkers()) { return; } // new child, exit
      while (sig=sigqueue.pop()) {
        console.log(sig);
        switch(sig.sig) {
        case 'SIGHUP':
          reloadConfig();
          break;
        case 'SIGQUIT':
          break;
        case 'SIGTTIN':
          ++workerProcesses;
          break;
        case 'SIGTTOU':
          if (workerProcesses > 0) { --workerProcesses; }
          break;
        case 'SIGWINCH':
          workerProcesses = 0; // bring the count down to 0
          break;
        default:
          break;
        }
      }
      maintainWorkerCount();
    });

    reader.open(pipeFDs[0]);
    writer.open(pipeFDs[1]);
    reader.resume();
  }

  function maintainWorkerCount() {
    var off = workers.length - workerProcesses;
    console.error("worker count difference: %d", off);
    if (!off) { return; }
    if (off < 0) { return startMissingWorkers(); }
    workers = workers.filter(function(pid, i) {
      if (i >= workerProcesses) {
        killWorker(pid, 'SIGQUIT');
        return false;
      }
      return true;
    });
    console.log(workers);
  }

  function startMissingWorkers() {
    console.error("start missing workers");
    var pid;
    for (var i = 0; i < workerProcesses; ++i) {
      if (workers[i]) { continue; }
      if ((pid=forkWorker(i)) == 0) {
        return true;  // child's done
      }
      workers[i] = pid;
    }
    return false;
  }


  // start workers
  var pid;

  netBinding.bind(server_socket, 1337, '127.0.0.1');

  // boot up the workers
  if (maintainWorkerCount()) { return; } // child exits

  process.title = "node master"
  netBinding.listen(server_socket, 128);
  pidfile = "pidfile.pid";
  runMaster(workers);

}, __dirname, "stdout.log", "stderr.log");
