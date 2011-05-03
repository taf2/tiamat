/*
* posixtools.node: A node.JS addon to add useful tools for creating *nix servers
* dervied from daemon.node, unicorn
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
#include <time.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <fcntl.h>
#include <errno.h>
#include <pwd.h>
#include <errno.h>
#include <string.h>
#include <sys/socket.h>

#define PID_MAXLEN 10

using namespace v8;
using namespace node;

//static void node_fork_cb (EV_P_ ev_fork *fork_w, int revents) {
//  fprintf(stderr, "forked\n");
//}

//
// Add fork method to allow forking node.js process
//
static Handle<Value> Fork(const Arguments& args) {
  HandleScope scope;
  pid_t sid, pid;
  int i, new_fd;
//  ev_fork watcher;
//  memset(&watcher, 0, sizeof(ev_fork));

//  ev_fork_init(&watcher, node_fork_cb);
//  ev_fork_start(&watcher);

  pid = fork();
  // http://www.unixguide.net/unix/programming/1.1.2.shtml
  // vfork really isn't necessary... use fork

  if (pid < 0)      exit(1);

  if (pid == 0) {
    // Child process: We need to tell libev that we are forking because
    // kqueue can't deal with this gracefully.
    //
    // See: http://pod.tst.eu/http://cvs.schmorp.de/libev/ev.pod#code_ev_fork_code_the_audacity_to_re
    //printf("eio req: %d, threads: %d, pending: %d, ready: %d\n", eio_nreqs(), eio_nthreads(), eio_npending(), eio_nready());
    ev_loop_fork (EV_DEFAULT);
    ev_break (EV_A_ EVBREAK_ALL);
#if HAVE_SRANDDEV == 1
    sranddev();
#else
    srand(time(NULL));
#endif
    ev_run (EV_A_ 0);

    return scope.Close(Number::New(pid));

  }

  return scope.Close(Number::New(pid));
}
static Handle<Value> SetSocketOpts(const Arguments& args) {
  HandleScope scope;
  int flags = 1;
  int r;
  int fd = args[0]->ToInteger()->Value();

  if ((r=setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, (void *)&flags, sizeof(flags))) < 0) { 
    fprintf(stderr, "setsockopt(error): %d, %d:%s\n", r, errno, strerror(errno));
  }

  return scope.Close(Number::New(r));
}
static Handle<Value> Dup2(const Arguments& args) {
  HandleScope scope;
  int flags = 1;
  int r;
  int fd1 = args[0]->ToInteger()->Value();
  int fd2 = args[1]->ToInteger()->Value();

  if ((r=dup2(fd1, fd2)) < 0) { 
    fprintf(stderr, "dup2(error): %d, %d:%s\n", r, errno, strerror(errno));
    return ThrowException(Exception::Error(String::New("dup2 error")));
  }

  return scope.Close(Number::New(r));
}
//
//  execve(const char *path, char *const argv[], char *const envp[]);
//
// see: man 2 execve
//
// some of this implementation is borrowed by reference to node_child_process.cc
static Handle<Value> Execve(const Arguments& args) {
  HandleScope scope;

  if (args.Length() != 3 || 
      !args[0]->IsString() ||
      !args[1]->IsArray() ||
      !args[2]->IsArray()) {
    fprintf(stderr, "args.Length: %d, %d, %d, %d\n", args.Length(), args[0]->IsString(), args[1]->IsArray(), args[2]->IsArray());
    return ThrowException(Exception::Error(String::New("Bad Arguments, expected: path, argv[], envp[]")));
  }

  int i;
  String::Utf8Value file(args[0]->ToString());
  // Copy arguments args[1] and args[2] into a c-string array called argv.
  // The array must be null terminated, and the first element must be
  // the name of the executable -- hence the complication.
  Local<Array> argv_handle = Local<Array>::Cast(args[1]);
  Local<Array> envp_handle = Local<Array>::Cast(args[2]);

  // setup argv
  int argc = argv_handle->Length();
  int argv_length = argc + 1 + 1;
  char **argv = new char*[argv_length]; // heap allocated to detect errors
  argv[0] = strdup(*file); // + 1 for file
  argv[argv_length-1] = NULL;  // + 1 for NULL;
  for (i = 0; i < argc; ++i) {
    String::Utf8Value arg(argv_handle->Get(Integer::New(i))->ToString());
    argv[i+1] = strdup(*arg);
  }

  // setup env
  int envc = envp_handle->Length();
  char **envp = new char*[envc+1];
  envp[envc] = NULL; // + 1 for NULL;
  for (i = 0; i < envc; ++i) {
    String::Utf8Value env(envp_handle->Get(Integer::New(i))->ToString());
    envp[i] = strdup(*env);
  }
  fprintf(stderr, "execute file: %s\n", *file);

  int r = execve(*file, argv, envp);

  // return's only on error
  return ThrowException(Exception::Error(String::New("Execve failed!")));
}

// set the fd to close on a call to exec
static Handle<Value> FdCloseOnExec(const Arguments& args) {
  HandleScope scope;
  if (!args[0]->IsNumber()) {
    return ThrowException(Exception::Error(String::New("When setting a umask it must be an integer")));
  }
  int fd = args[0]->ToInteger()->Value();
  int flags = fcntl(fd, F_GETFD, 0);

  return scope.Close(Number::New(fcntl(fd, F_SETFD, flags | FD_CLOEXEC)));
}

// set the fd to stay open after an exec call
// see: http://www.gnu.org/s/hello/manual/libc/Descriptor-Flags.html
static Handle<Value> FdOpenOnExec(const Arguments& args) {
  HandleScope scope;
  if (!args[0]->IsNumber()) {
    return ThrowException(Exception::Error(String::New("When setting a umask it must be an integer")));
  }
  int fd = args[0]->ToInteger()->Value();
  int flags = fcntl(fd, F_GETFD, 0);

  
  return scope.Close(Number::New(fcntl(fd, F_SETFD, flags & ~FD_CLOEXEC)));
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

  stdin  = freopen("/dev/null", "r", stdin);
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

  // install post fork handler
  
  NODE_SET_METHOD(target, "fork", Fork);
  NODE_SET_METHOD(target, "getpid", GetPid);
  NODE_SET_METHOD(target, "setsid", SetSid);
  NODE_SET_METHOD(target, "reopen_stdio", ReOpenStdIO);
  NODE_SET_METHOD(target, "umask", Umask);
  NODE_SET_METHOD(target, "isalive", IsAlive);
  NODE_SET_METHOD(target, "getppid", GetPPid);
  NODE_SET_METHOD(target, "fd_close_on_exec", FdCloseOnExec);
  NODE_SET_METHOD(target, "fd_open_on_exec", FdOpenOnExec);
  NODE_SET_METHOD(target, "execve", Execve);
  NODE_SET_METHOD(target, "set_socket_opts", SetSocketOpts);
  NODE_SET_METHOD(target, "dup2", Dup2);
}
