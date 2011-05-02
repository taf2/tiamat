exports.load = function() {
  var path  = require("path");
  var fs    = require("fs");
  var posix = require(__dirname + "/build/default/posixtools.node");

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
    before_exec: function(config) {
      console.error("before exec");
    },
    before_fork: function(config, wid) {
      console.error("before fork");
    },
    after_fork: function(config, pid, ppid, wid) {
      console.error("after fork: %d", process.pid);
      var oldbin = config.pidfile + ".oldbin";
      if (path.existsSync(oldbin)) {
        var oldpid = fs.readFileSync(oldbin, 'ascii');
        if (parseInt(oldpid) > 1) {
          console.error("send(%d) old master the kill sig: %s", posix.getpid(), oldpid);
          process.kill(parseInt(oldpid), "SIGQUIT");
        }
        else {
          console.error("nopid in oldbin: %s", oldpid);
        }
      }
      else {
        console.error("no oldbin");
      }
    }
  }
};
