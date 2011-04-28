import Options
from os import unlink, symlink
from os.path import exists 

srcdir = "."
blddir = "build"
VERSION = "0.1.0"

def set_options(opt):
  opt.tool_options("compiler_cxx")

def configure(conf):
  conf.check_tool("compiler_cxx")
  conf.check_tool("node_addon")
  code = """
    #include <stdlib.h>
    int main(void) {
      sranddev();
      return 0;
    }
  """
  have_sranddev = conf.check_cxx(lib="c", msg="Checking for sranddev", fragment=code)
  if have_sranddev:
    conf.env.append_value('CPPFLAGS', '-DHAVE_SRANDDEV=1')
  else:
    conf.env.append_value('CPPFLAGS', '-DHAVE_SRANDDEV=0')

def build(bld):
  obj = bld.new_task_gen("cxx", "shlib", "node_addon")
  obj.target = "fork"
  obj.source = bld.glob("src/fork.cc")
