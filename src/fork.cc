/*
* Fork.node: A node.JS addon to add process.fork for *nix
* dervied from daemon.node
*
* Copyright 2011 (c) <todd>
*
* Under MIT License. See LICENSE file.
*
*/

#include <v8.h>
#include <node.h>
#include <unistd.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <fcntl.h>
#include <errno.h>
#include <pwd.h>
#include <errno.h>
#include <string.h>

#define PID_MAXLEN 10

using namespace v8;
using namespace node;

//
// Add fork method to allow forking node.js process
//
static Handle<Value> Fork(const Arguments& args) {
  HandleScope scope;

  pid_t sid, pid = fork();
  int i, new_fd;

  if (pid < 0)      exit(1);

  if (pid == 0) {
    // Child process: We need to tell libev that we are forking because
    // kqueue can't deal with this gracefully.
    //
    // See: http://pod.tst.eu/http://cvs.schmorp.de/libev/ev.pod#code_ev_fork_code_the_audacity_to_re
    //printf("eio req: %d, threads: %d, pending: %d, ready: %d\n", eio_nreqs(), eio_nthreads(), eio_npending(), eio_nready());
    ev_default_fork();

    return scope.Close(Number::New(pid));

  }

  return scope.Close(Number::New(pid));
}

//
// Add getpid at least until process.pid returns the actual pid via getpid call this is necessary work around
//
static Handle<Value> GetPid(const Arguments& args) {
  HandleScope scope;
  return scope.Close(Number::New(getpid()));
}

//
// Add getppid get our parent process id
//
static Handle<Value> GetPPid(const Arguments& args) {
  HandleScope scope;
  return scope.Close(Number::New(getppid()));
}

static Handle<Value> SetSid(const Arguments& args) {
  HandleScope scope;
  return scope.Close(Number::New(setsid()));
}

static Handle<Value> Umask(const Arguments& args) {
  HandleScope scope;
  if (!args[0]->IsNumber()) {
    return ThrowException(Exception::Error(String::New("When setting a umask it must be an integer")));
  }
  int mask = args[0]->ToInteger()->Value();
  return scope.Close(Number::New(umask(mask)));
}

static Handle<Value> IsAlive(const Arguments& args) {
  HandleScope scope;
  int status;
  int pid = args[0]->ToInteger()->Value();
  int r = waitpid(pid, &status, WNOHANG | WUNTRACED);
//  fprintf(stderr, "%d, %d:%s\n", r, errno, strerror(errno));
//  fflush(stderr);
  if (r == -1) { return scope.Close(Boolean::New(false)); }
  return scope.Close(Boolean::New(true));
}

//
// reopen stdout, stdin, stderr
// stdout and stderr may be reopened to a path or /dev/null
// stdin is always reopened to /dev/null
//
//   fork.reopen_stdio("/path/to/stdout", "/path/to/stderr");
//
static Handle<Value> ReOpenStdIO(const Arguments& args) {
  HandleScope scope;
  if (!args[0]->IsString() || !args[1]->IsString()) {
    return ThrowException(Exception::Error(String::New("Must provide a path to reopen STDOUT and STDERR")));
  }
  String::Utf8Value stdout_path(args[0]->ToString());
  String::Utf8Value stderr_path(args[1]->ToString());

  stdin  = freopen("/dev/null", "a", stdin);
  stdout = freopen(*stdout_path, "a", stdout);
  stderr = freopen(*stderr_path, "a", stderr);

  if (stdout && stderr) {
    return scope.Close(Number::New(1));
  }
  else {
    return ThrowException(Exception::Error(String::New("Error unable to reopen stdout and stderr")));
  }
}

//
// Initialize this add-on
//
extern "C" void init(Handle<Object> target) {
  HandleScope scope;
  
  NODE_SET_METHOD(target, "fork", Fork);
  NODE_SET_METHOD(target, "getpid", GetPid);
  NODE_SET_METHOD(target, "setsid", SetSid);
  NODE_SET_METHOD(target, "reopen_stdio", ReOpenStdIO);
  NODE_SET_METHOD(target, "umask", Umask);
  NODE_SET_METHOD(target, "isalive", IsAlive);
  NODE_SET_METHOD(target, "getppid", GetPPid);
}
