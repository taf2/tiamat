// create a daemon process
var posix = require('../build/default/posixtools.node'),
    fs   = require('fs');

KILLSIGS = ["SIGINT","SIGQUIT","SIGILL","SIGTRAP",
            "SIGABRT","SIGEMT","SIGFPE","SIGKILL","SIGBUS","SIGSEGV","SIGSYS","SIGPIPE","SIGALRM","SIGTERM",
            "SIGURG","SIGSTOP","SIGTSTP","SIGCONT","SIGCHLD","SIGTTIN","SIGTTOU","SIGIO","SIGXCPU","SIGXFSZ",
            "SIGVTALRM","SIGPROF","SIGWINCH","SIGINFO","SIGUSR1","SIGUSR2"];

exports.daemonize = function(runcb, rundir, stdout_log, stderr_log) {
  if (!stdout_log) stdout_log = "/dev/null";
  if (!stderr_log) stderr_log = "/dev/null";
  if (!rundir) rundir = "/";

  var pid = posix.fork();

  if (pid == 0) {
    // child
    posix.setsid();
    cpid = posix.fork();
    if (cpid == 0) {
      posix.setsid();
      process.chdir(rundir);
      posix.umask(0);
      posix.reopen_stdio(stdout_log, stderr_log);

      process.pid = posix.getpid(); // update process.pid

      // run once through the process loop to ensure all IO handles are setup correctly after fork
      process.nextTick(runcb); // run user code
 
    }
    else {
      process.exit(0);
    }
  }
  else {
    process.exit(0);
  }
}
