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


KILLSIGS = ["SIGINT","SIGQUIT","SIGILL","SIGTRAP",
            "SIGABRT","SIGEMT","SIGFPE","SIGKILL","SIGBUS","SIGSEGV","SIGSYS","SIGPIPE","SIGALRM","SIGTERM",
            "SIGURG","SIGSTOP","SIGTSTP","SIGCONT",,"SIGTTIN","SIGTTOU","SIGIO","SIGXCPU","SIGXFSZ",
            "SIGVTALRM","SIGPROF","SIGWINCH","SIGINFO","SIGUSR1","SIGUSR2"];


Daemon.daemonize(function() {

  var pidfile = null;
  var children = [];
  var server_socket = netBinding.socket('tcp4');
  netBinding.bind(server_socket, 1337, '127.0.0.1');

  function exitMasterListener() {
    process.exit(0);
  }
  function cleanupMasterListener() {
    console.error("Exiting(" + process.pid + ")");
    // signal all our child processes to exit also
    children.forEach(function(cpid) {
      process.kill(cpid);
    });
    fs.unlinkSync(pidfile);
  }

  function watchChildrenListener() {
    // reap children
    var update_pids = [];
    for (var index = 0, len = children.length; index < len; ++index) {
      var pid = children[index];
      var status = fork.isalive(pid);
      if (status) {
        console.error("pid: %d is alive", pid);
      }
      else {
        console.error("pid: %d is dead", pid);
        //remove.push(index);
        // respawn the child. Which one died?
        //if (forkChild(children, index)) {
        //  console.error("new child is ready: %d", process.pid);
        //  break;
       // }
        var pid = fork.fork();
        if (pid == 0) {
          resetWorker();
          if (process.platform != 'darwin') {
            process.title = "node worker[" + index + "]";
          }
          runWorker(server_socket, i);
          return;
        }
        else {
          update_pids.push([index, pid]);
        }
      }
    }
    update_pids.forEach(function(set) {
      children[set[0]] = set[1];
    });
  }

  function runWorker(fd,id) {
    //try { process.title = "node worker[" + id + "]"; } catch(e) { console.error(e); } // this might fail
    console.error("my parent is: %d", fork.getppid());
    // create the HTTP server
    var http = require('http');
    http.createServer(function (req, res) {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Hello World:' + process.pid + '\n');
    }).listenFD(fd);
  }

  // unregister events setup by master 
  function resetWorker() {
    KILLSIGS.forEach(function(sig) {
      process.removeListener(sig, exitMasterListener);
    });
    process.removeListener('exit', cleanupMasterListener);
    process.removeListener('SIGCHLD', watchChildrenListener);
  }

  function forkChild(children, i) {
    var pid = fork.fork();
    if (pid == 0) {
      runWorker(server_socket, i);
      return true;
    }
    else {
      console.error("save pid: %d, %d", pid, i);
      children[i] = pid;
      return false;
    }
  }

  function runMaster(children) {

    master_socket_path = "/tmp/geez_" + process.pid + '_master.sock';

    master_server = net.createServer(function(conn) {
      // communicate with children here? 
    }).listen(master_socket_path, function() {
      console.log("master is alive"); // just keeping the master alive
    });

    // regsiter the kill signals
    KILLSIGS.forEach(function(sig) { process.on(sig, exitMasterListener); });

    // clean up our pidfile on exit
    process.on('exit', cleanupMasterListener);

    // watch out for our children
    process.on('SIGCHLD', watchChildrenListener);

    if (!pidfile) { pidfile = "/tmp/server." + fork.getpid() + ".pid"; }

    // create the pidfile
    fs.open(pidfile,"w", 0666, function(err, fd) {
      fs.writeSync(fd, fork.getpid().toString());
      fs.close(fd);
    });
  }

  // start workers
  var parent = true;
  for (var i = 0; i < 2; ++i) {
    if (forkChild(children, i)) {
      process.title = "node worker[" + i + "]";
      parent = false;
      break;
    } // child breaks
  }

  if (parent) {
    process.title = "node master"
    netBinding.listen(server_socket, 128);
    pidfile = "pidfile.pid";
    runMaster(children);
  }

}, __dirname, "stdout.log", "stderr.log");
