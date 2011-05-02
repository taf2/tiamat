var net        = require('net'),
    http       = require('http'),
    spawn      = require('child_process').spawn,
    path       = require('path'),
    fs         = require('fs'),
    netBinding = process.binding('net'),
    posix      = require(__dirname + '/../../build/default/posixtools.node');

if (!Array.prototype.remove) {
  // Array Remove - By John Resig (MIT Licensed)
  Array.prototype.remove = function(from, to) {
    var rest = this.slice((to || from) + 1 || this.length);
    this.length = from < 0 ? this.length + from : from;
    return this.push.apply(this, rest);
  };
}

KILLSIGS = ["SIGINT","SIGTERM"];

function launchServer(config) {

  var pidfile = config.pidfile;
  var workers = [];
  var mastersigs = ['SIGINT', 'SIGTERM', 'SIGCHLD', 'SIGHUP', 'SIGQUIT', 'SIGTTIN', 'SIGTTIN', 'SIGWINCH'];
  var sigqueue = [];
  var server_socket = null;
  var pipeFDs = null;
  var reader = null;
  var writer = null;
  var workerProcesses = config.workers;
  var reexec_pid = null;
  var workerScript = config.worker_app;
  var sigchld = false;

  function exitMaster() {
    if (sigchld) return;
    console.error("master received: the kill");
    process.exit(0);
  }

  function wakeupMaster() {
    sigchld = true;
    console.error("SIGCHLD, wake :" + posix.getpid());
    writer.write("."); // wake up
  }
  function sigQueue() {
    console.error("queue: " + this);
    sigqueue.push(this);
    wakeupMaster();
  }

  function tearDownMaster() {
    console.error("Exiting(" + process.pid + "), " + pidfile);
    // signal all our child processes to exit also
    signalWorkers('SIGTERM');
    if (path.existsSync(pidfile)) { fs.unlinkSync(pidfile); }
  }

  function killWorker(pid, sig) {
    console.error("send(%d): %d, %s", posix.getpid(), pid, sig);
    try { process.kill(pid, sig); } catch(e) { console.error(e); }
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
    console.error("reaping: %d", workers.length);

    for (var index = 0, len = workers.length; index < len; ++index) {
      var pid = workers[index];
      var status = posix.isalive(pid);
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
    console.error(workers);
    return false;
  }

  function runWorker(fd,id) {
    try {
      if (process.platform != 'darwin') { // setting the process title on Mac is not really safe...
        process.title = "node worker[" + id + "]";
      }
      var ppid = posix.getppid();
      console.error(posix.getpid() + ", parent is: %d", posix.getppid());

      var app = require(workerScript);

      app.run(config, function(server) {

        setInterval(function() {
          // verify our parent process is still the same
          if (ppid != posix.getppid()) {
            console.error("parent changed die");
            if (path.existsSync(pidfile)) { fs.unlinkSync(pidfile); } // try to cleanup for master
            process.exit(1); // parent changed die
            return;
          }
        }, 1000);

        server.listenFD(fd);

        process.on("SIGQUIT", function() {
          console.error("%d, got sigquit", posix.getpid());
          server.close(); // stop listening for new connections
          setTimeout(function() {
            process.exit(1);
          }, 30000); // really quit in 30 seconds if we haven't already
        });

      });

    } catch(e) {
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
      process.on(sig, function() { console.error("worker: %d received the kill\n", posix.getpid()); process.exit(0); });
    });
  }

  function forkWorker(i) {
    if (config.before_fork) { try { config.before_fork(config, i); } catch(e) { console.error(e); } }
    var pid = posix.fork();
    if (pid == 0) {
      posix.setsid();
      resetWorker();
      workerSignals();
      runWorker(server_socket, i);
      if (config.after_fork) { try { config.after_fork(config, posix.getpid(), posix.getppid(), i); } catch(e) { console.error(e); } }
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
    workerProcesses = 0; // bring the count down to 0, this way we don't try to revive these workers
    signalWorkers('SIGQUIT'); // send them the quit signal
    // wait longer?
    //netBinding.close(server_socket);
    process.exit(0);
  }

  function pathSearch(binary) {
    if (binary.match(/^\//)) { return binary; } // already absolute
    var binpath = null;
    process.env['PATH'].split(':').some(function(p) {
      var bin = path.resolve(p, binary);
      if (path.existsSync(bin)) {
        binpath = bin;
        return true;
      }
      return false;
    });
    return binpath;
  }

  // used this resource: http://www.linuxforums.org/forum/programming-scripting/54613-how-access-open-file-descriptors-after-doing-exec.html
  // read this too: http://www.cim.mcgill.ca/~franco/OpSys-304-427/lecture-notes/node27.html
  // also read this: https://github.com/pgte/fugue/wiki/How-Fugue-Works
  // and read this: http://stackoverflow.com/questions/1643304/how-to-set-close-on-exec-by-default
  function reexecuteMaster() {
    var binary = pathSearch(process.argv[0]);
    var envp = [];
    var argv = process.argv.map(function(v) { return v; });

    for (var k in process.env) {
      envp.push(k + "=" + process.env[k]);
    }
    // set the original master pid in the new master's enviornment
    // this will also indicate to the new master process that it should not
    // try to rebind, but instead reuse the existing server socket
    envp.push("__NIX_FD=" + server_socket);

    argv.shift(); // shift the original node off execve expects argv[0] to be the js file
 
    if (config.before_exec) { try { config.before_exec(config); } catch(e) { console.error(e); } }

    if (!pidfile.match(/oldbin$/)) { pidfile += ".oldbin"; } // if we're oldbin already don't change...
    // create a new pidfile for our process
    fs.writeFileSync(pidfile, posix.getpid().toString());

    reexec_pid = posix.fork();

    if (reexec_pid == 0) {
      // tell all existing file descriptors to close on exec
      for (var i = 3; i < 1024; ++i) { // use getdtablesize?
        if (i != server_socket) {
          posix.fd_close_on_exec(i);
        }
      }
      posix.fd_open_on_exec(server_socket); // keep the server socket alive
      posix.execve(binary, argv, envp);
    }

    // update current master as old a new one is starting up
    process.title = "node master (old)";
  }

  function runMaster(workers) {

    pipeFDs = netBinding.pipe();
    reader = new net.Stream();
    writer = new net.Stream();

    process.on('exit', tearDownMaster);
    process.on('SIGCHLD', wakeupMaster);

    process.on('SIGHUP',   sigQueue.bind({sig:'SIGHUP'}));
    process.on('SIGQUIT',  sigQueue.bind({sig:'SIGQUIT'}));
    process.on('SIGTTIN',  sigQueue.bind({sig:'SIGTTIN'}));
    process.on('SIGTTOU',  sigQueue.bind({sig:'SIGTTOU'}));
    process.on('SIGWINCH', sigQueue.bind({sig:'SIGWINCH'}));
    process.on('SIGUSR2',  sigQueue.bind({sig:'SIGUSR2'}));

    KILLSIGS.forEach(function(sig) { process.on(sig, exitMaster); });

    if (!pidfile) { pidfile = "/tmp/server." + posix.getpid() + ".pid"; }

    // create the pidfile
    fs.writeFileSync(pidfile, posix.getpid().toString());

    // control signals and reapworkers
    reader.on("data", function() {
      var sig = null;
      if (reapWorkers()) { return; } // new child, exit
      while (sig=sigqueue.pop()) {
        console.log(sig);
        switch(sig.sig) {
        case 'SIGHUP':
          // reload the configuration and restart all the workers
          reloadConfig();
          break;
        case 'SIGQUIT':
          shutdownGraceful();
          break;
        case 'SIGTTIN':
          // increase the numner of worker processes by 1
          ++workerProcesses;
          break;
        case 'SIGTTOU':
          // decrease the numner of worker processes by 1
          if (workerProcesses > 0) { --workerProcesses; }
          break;
        case 'SIGWINCH':
          // tell all workers to quit
          workerProcesses = 0; // bring the count down to 0
          break;
        case 'SIGUSR2':
          // reexecute the running binary.  A QUIT or TERM signal can be sent to the current process to have the new process take it's place.
          reexecuteMaster();
          break;
        default:
          break;
        }
      }
      sigchld = false;
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
    console.error(workers);
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
  var newMaster = false;

  if (process.env['__NIX_FD']) { // reexec from old master
    newMaster = true;
    server_socket  = parseInt(process.env['__NIX_FD']);
    console.error("new master is up: %d from %d:%d\n", process.pid, posix.getppid(), server_socket);
  }
  else {
    // fresh process create a new socket
    server_socket = netBinding.socket(config.tcp);
    if (config.listen_port && config.listen_addr) {
      netBinding.bind(server_socket, config.listen_port, config.listen_addr);
    } /*else if (config.listen_sock) {
      netBinding.bind(server_socket, config.listen_sock);
    }*/
  }

  // start listening on server socket with backlog of 128
  netBinding.listen(server_socket, config.backlog);

  console.error("launching: %d workers\n", workerProcesses);

  // boot up the workers
  if (startMissingWorkers()) { return; } // child exits

  process.title = "node master"

  runMaster(workers);

}

exports.Tiamat = launchServer;
