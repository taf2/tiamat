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
