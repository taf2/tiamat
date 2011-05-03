exports.oldbinQuit = function(config, pid, ppid, wid) {
  var path   = require("path"),
      oldbin = config.pidfile + ".oldbin",
      fs     = require("fs"),
      posix  = require(__dirname + "/build/default/posixtools.node");

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
};
