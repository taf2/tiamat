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
#include <fcntl.h>
#include <errno.h>
#include <pwd.h>

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
    ev_default_fork();
/*    ev_loop_destroy (EV_DEFAULT);
  // Initialize the default ev loop.
#if defined(__MAC_OS_X_VERSION_MIN_REQUIRED) && __MAC_OS_X_VERSION_MIN_REQUIRED >= 1060
  ev_default_loop(EVBACKEND_KQUEUE);
#else
  ev_default_loop(EVFLAG_AUTO);
#endif*/

    return scope.Close(Number::New(pid));

  }
  ev_default_fork();

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
// Initialize this add-on
//
extern "C" void init(Handle<Object> target) {
  HandleScope scope;
  
  NODE_SET_METHOD(target, "fork", Fork);
  NODE_SET_METHOD(target, "getpid", GetPid);
}
