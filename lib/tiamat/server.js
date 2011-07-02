var net        = require('net'),
    http       = require('http'),
    spawn      = require('child_process').spawn,
    path       = require('path'),
    fs         = require('fs'),
    netBinding = process.binding('net'),
    posix      = require(__dirname + '/../../build/default/posixtools.node'),
    Config     = require("tiamat/config_loader.js").ConfigLoader;

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
  var sigchld = false;
  var teardown = false;

  function exitMaster() {
    if (sigchld) return;
    teardown = true;
    console.log("master(%d) received: the kill", posix.getpid());
    // signal all our child processes to exit also
    signalWorkers('SIGTERM'); // kill our children
    process.exit(0);
  }

  function wakeupMaster() {
    sigchld = true;
    console.log("master(%d), wake", posix.getpid());
    writer.write("."); // wake up
  }
  function sigQueue() {
    sigqueue.push(this);
    wakeupMaster();
  }

  function tearDownMaster() {
    console.log("master(%d) exiting with %s", posix.getpid(), pidfile);
    if (path.existsSync(pidfile)) { fs.unlinkSync(pidfile); }
  }

  function killWorker(pid, sig) {
    //console.log("send(%d): %d, %s", posix.getpid(), pid, sig);
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
    console.log("reaping: %d", workers.length);

    for (var index = 0, len = workers.length; index < len; ++index) {
      var pid = workers[index];
      var status = posix.isalive(pid);
      if (!status) {
        console.log("pid: %d is dead with: %d", pid, status);
        if ((pid=forkWorker(index)) == 0) {
          return true;  // child's done
        }
        update_pids.push([index, pid]);
      }
    }
    update_pids.forEach(function(set) {
      workers[set[0]] = set[1];
    });
    console.log(workers);
    return false;
  }

  function rotateLogFiles() {
    posix.reopen_stdio(config.stdout_path, config.stderr_path);
    signalWorkers("SIGUSR1");
    //signalWorkers('SIGQUIT'); // send them the quit signal and master will later reboot them
  }

  function runWorker(fd,id) {
    try {
      var ppid = posix.getppid();

      // start polling our parent pid and die if our parent changes
      setInterval(function() {
        // verify our parent process is still the same
        if (ppid != posix.getppid()) {
          console.log("\tworker(%d) parent(%d) changed to, die", posix.getpid(), ppid, posix.getppid());
          process.exit(1); // parent changed die
          return;
        }
      }, 1000);

      console.log("\tworker(%d) alive with parent(%d) at %s", posix.getpid(), posix.getppid(), config.worker_app);

      if (process.platform != 'darwin') { // setting the process title on Mac is not really safe...
        process.title = "node w[" + id + "]";
      }

      // load application
      require(config.worker_app).run(config, function(server) {
        console.log("\tworker(%d) got sigquit with %d connections", posix.getpid(), server.connections);

        process.on("SIGQUIT", function() {
          // stop accepting
          server.watcher.stop();

          if (server.connections) {
            // start polling until all connections are exhausted
            setInterval(function() { server.connections || process.exit(0); }, 1500);
            // set a timeout if we live past this point kill
            setTimeout(function() { process.exit(1); }, config.timeout);
          }
          else {
            process.exit(0);
          }
          
        });

        process.on("SIGUSR1", function() {
          posix.reopen_stdio(config.stdout_path, config.stderr_path);
        });

        server.listenFD(fd);

        // once application is loaded call the after fork helper
        if (config.after_fork) { try { config.after_fork(config, posix.getpid(), posix.getppid(), id); } catch(e) { console.error(e); } }
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
      console.log("\tworker(%d) register (%s)", posix.getpid(), sig);
      process.on(sig, function() { console.log("\tworker(%d) received (%s)", posix.getpid(), this.sig); process.exit(0); }.bind({sig:sig}));
    });
  }

  function forkWorker(id) {
    if (config.before_fork) { try { config.before_fork(config, id); } catch(e) { console.error(e); } }
    var pid = posix.fork();
    if (pid == 0) {
      console.log("\tworker(%d) alive for master(%d)", posix.getpid(), posix.getppid());
      posix.setsid();
      resetWorker();
      workerSignals();
      runWorker(server_socket, id);
      return 0;
    }
    console.log("master(%d) save pid: %d, %d", posix.getpid(), pid, id);
    return pid;
  }

  function reloadConfig() {
    // reload config
    if (config.config_path) {
      var configLoader = new Config();
      configLoader.on("loaded", function(cfg) {
        cfg = configLoader.defaults(cfg);
        if (configLoader.verify(cfg)) {
          // update masters configuration
          config = cfg;
          // restart workers
          signalWorkers('SIGQUIT'); // reboot workers
        }
      });
      configLoader.load(config.config_path);
    }
  }
  
  function shutdownGraceful() {
    console.log("master(%d) received shutdown", posix.getpid());
    try {
      teardown = true; // mark the process for teardown
      workerProcesses = 0; // bring the count down to 0, this way we don't try to revive these workers
      process.removeAllListeners("SIGCHLD"); // don't try to restart workers
      //signalWorkers('SIGQUIT'); // send them the quit signal

      // start master shutdown cycle...
      netBinding.close(server_socket); // stop receiving on the socket
    } catch(e) {
      console.error("master(%d) error during shutdown", posix.getpid());
    }
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
    console.log("master(%d) call reexecuteMaster", posix.getpid());
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

    reexec_pid = posix.fork(false); // don't clear the event loop since we'll be execv soon

    if (reexec_pid == 0) {
      posix.fd_open_on_exec(server_socket); // keep the server socket alive
      posix.execve(binary, argv, envp);
    }

    // update current master as old a new one is starting up
    process.title = "node m (old)";
  }

  function runMaster(workers) {

    pipeFDs = netBinding.pipe();
    reader = new net.Stream();
    writer = new net.Stream();


    process.on('SIGHUP',   sigQueue.bind({sig:'SIGHUP'}));
    process.on('SIGQUIT',  sigQueue.bind({sig:'SIGQUIT'}));
    process.on('SIGTTIN',  sigQueue.bind({sig:'SIGTTIN'}));
    process.on('SIGTTOU',  sigQueue.bind({sig:'SIGTTOU'}));
    process.on('SIGWINCH', sigQueue.bind({sig:'SIGWINCH'}));
    process.on('SIGUSR2',  sigQueue.bind({sig:'SIGUSR2'}));
    process.on('SIGUSR1',  sigQueue.bind({sig:'SIGUSR1'}));
    process.on('SIGCHLD',  wakeupMaster);
    process.on('exit',     tearDownMaster);

    KILLSIGS.forEach(function(sig) { process.on(sig, exitMaster); });

    if (!pidfile) { pidfile = "/tmp/server." + posix.getpid() + ".pid"; }

    // create the pidfile
    fs.writeFileSync(pidfile, posix.getpid().toString());

    // control signals and reapworkers
    reader.on("data", function() {
      var sig = null;
      if (!reexec_pid) {
        if (teardown || reapWorkers()) { return; } // new child, exit or we're exiting master
      }
      while (sig=sigqueue.pop()) {
        //console.log(sig);
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
        case 'SIGUSR1':
          rotateLogFiles();
          break;
        case 'SIGUSR2':
          // reexecute the running binary.  A QUIT or TERM signal can be sent to the current process to have the new process take its place.
          reexecuteMaster();
          return;
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
    console.log("master(%d) worker count difference: %d", posix.getpid(), off);
    if (!off) { return; }
    if (off < 0) { return startMissingWorkers(); }
    workers = workers.filter(function(pid, i) {
      if (i >= workerProcesses) {
        killWorker(pid, 'SIGQUIT');
        return false;
      }
      return true;
    });
    console.log("master(%d) workers(%d): %s", posix.getpid(), workers.length, workers.toString());
    if (workers.length == 0 && teardown) {
      process.exit(0);
    }
  }

  function startMissingWorkers() {
    console.log("master(%d) start missing workers", posix.getpid());
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
    delete process.env.__NIX_FD;
    console.log("new master is up: %d from %d with socket:%d\n", process.pid, posix.getppid(), server_socket);
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

  console.log("master(%d) launching: %d workers", posix.getpid(), workerProcesses);

  // boot up the workers
  if (maintainWorkerCount()) { return; } // child exits

  console.log("master(%d) initializing", posix.getpid());
  process.title = "node m"

  runMaster(workers);

}

exports.Tiamat = launchServer;
