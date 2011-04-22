var fork = require(__dirname + '/../build/default/fork.node');

var pid = fork.fork();

if (pid > 0) {
  console.log("parent:" + fork.getpid());
}
else {
  console.log("child:"  + fork.getpid());
}
