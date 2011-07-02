exports.load = function() {
  require.paths.unshift(__dirname + "/lib");
  var oldbinQuit = require("tiamat/config_tools").oldbinQuit;

  return {
    tcp: 'tcp4',
    backlog: 128,
    //listen_sock: "/tmp/tiamat.sock",
    listen_addr: "127.0.0.1",
    listen_port: 1337,
    workers: 2,
    timeout: 15,
    loglevel: 'info',
    worker_app: __dirname + "/test/worker1.js",
    daemonize: false,
    working_directory: __dirname,
    stderr_path: __dirname + "/stderr.log",
    stdout_path: __dirname + "/stdout.log",
    pidfile: __dirname + "/pidfile.pid",
    before_exec: function(config) {
      console.log("config, before exec");
    },
    before_fork: function(config, wid) {
      console.log("config, before fork");
    },
    after_fork: function(config, pid, ppid, wid) {
      console.log("config, after fork: %d", process.pid);
      oldbinQuit(config, pid, ppid, wid);
    }
  };

};
