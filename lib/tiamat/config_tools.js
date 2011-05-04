exports.oldbinQuit = function(config, pid, ppid, wid) {
  var path   = require("path"),
      oldbin = config.pidfile + ".oldbin",
      fs     = require("fs"),
      posix  = require(__dirname + "/../../build/default/posixtools.node");

  // have the last worker signal the old master process to shutdown
  if (wid == (config.workers-1) && path.existsSync(oldbin)) {
    var oldpid = parseInt(fs.readFileSync(oldbin, 'ascii'));
    if (oldpid > 1) {
      if (oldpid == posix.getppid()) {
        console.error("\tworker(%d) old master matches new master abort!", posix.getpid());
        return;
      }
      console.error("\tworker(%d) send master(%d) the kill sig", posix.getpid(), oldpid);
      process.kill(oldpid, "SIGQUIT");
    }
    else {
      console.error("\tworker(%d) nopid in oldbin: %s", posix.getpid(), oldpid);
    }
  }
};
