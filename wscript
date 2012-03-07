import Options, Utils
from os import unlink, symlink, chdir
from os.path import exists

srcdir = '.'
blddir = 'build'
VERSION = '0.0.2'

def set_options(opt):
  opt.tool_options('compiler_cxx')

def configure(conf):
  conf.check_tool('compiler_cxx')
  conf.check_tool('node_addon')

  conf.env.append_unique('CPPFLAGS', ["-I/usr/local/include"])
  conf.env.append_unique('CXXFLAGS', ["-Wall"])

  conf.env.append_unique('LINKFLAGS', ["-L/usr/local/lib", "-m32"])


def build(bld):
  obj = bld.new_task_gen('cxx', 'shlib', 'node_addon')
  obj.cxxflags = ['-DLDAP_DEPRECATED']
  obj.target = 'LDAP'
  obj.source = './src/LDAP.cc'
  obj.lib = ['ldap']
