#include <string.h>
#include <stdlib.h>

#include <v8.h>
#include <node.h>
#include <node_events.h>
#include <unistd.h>
#include <errno.h>

#include <ldap.h>

using namespace v8; //NOLINT
using namespace node; //NOLINT

static Persistent<String> search_symbol;
static Persistent<String> init_symbol;
static Persistent<String> bind_symbol;
static Persistent<String> unknown_symbol;
static Persistent<String> serverdown;

#define V8STR(str) String::New(str)
#define THROW(message) ThrowException(Exception::TypeError(String::New(message)))

class Connection : EventEmitter {
 public:
  Connection () : EventEmitter () 
  {
    ev_init(&read_watcher_, io_event);
    read_watcher_.data = this;
    
    ldap = NULL;
  }

  static void
  Initialize(v8::Handle<v8::Object> target) 
  {
    HandleScope scope;

    Local<FunctionTemplate> t = FunctionTemplate::New(New);
    
    t->Inherit(EventEmitter::constructor_template);
    t->InstanceTemplate()->SetInternalFieldCount(1);

    NODE_SET_PROTOTYPE_METHOD(t, "open",         Open);
    NODE_SET_PROTOTYPE_METHOD(t, "close",        Close);
    NODE_SET_PROTOTYPE_METHOD(t, "authenticate", Authenticate);
    NODE_SET_PROTOTYPE_METHOD(t, "search",       Search);

    search_symbol  = NODE_PSYMBOL("search");
    init_symbol    = NODE_PSYMBOL("init");
    bind_symbol    = NODE_PSYMBOL("bind");
    unknown_symbol = NODE_PSYMBOL("unknown");
    serverdown     = NODE_PSYMBOL("serverdown");

    target->Set(String::NewSymbol("Connection"), t->GetFunction());
  }

protected:
  LDAP * ldap;
  ev_io read_watcher_;
  ev_io write_watcher_;

  static Handle<Value> New(const Arguments &args) 
  {
    HandleScope scope;
    Connection *c = new Connection();
    c->Wrap(args.This());
    return args.This();
  }

  int Close(void) {
    HandleScope scope;
    int res;

    res = ldap_unbind(ldap);
    ldap = NULL;

    return res;
  }


  int Open(const char * uri) 
  {
    HandleScope scope;
    LDAPURLDesc *ludpp;
    int fd; //TODO: LDAP protocol version should be a parameter to open

    ldap_url_parse(uri, &ludpp); // TODO: errcheck

    char * host = ludpp->lud_host;
    int    port = ludpp->lud_port;
    int    ver = 3;

    ldap = ldap_open(host, port); // TODO: errcheck

    // TODO: set default base if present in uri.

    ldap_free_urldesc(ludpp);

    if (ldap == NULL) {
      return errno;
    }

    ldap_set_option(ldap, LDAP_OPT_RESTART, LDAP_OPT_ON);
    ldap_set_option(ldap, LDAP_OPT_PROTOCOL_VERSION, &ver);
    ldap_get_option(ldap, LDAP_OPT_DESC, &fd);
    ev_io_set(&read_watcher_, fd, EV_READ);
    ev_io_start(EV_DEFAULT_ &read_watcher_);
    // TODO: see if re-adding the fd on each search has any ill 
    //       effects. LDAP libs may switch fds at any time, and
    //       we need to handle this.

    return 0;
  }

  int Search(const char * base, const char * filter, char ** attrs) 
  {
    HandleScope scope;
    int msgid;
 
    if (ldap == NULL) {
      return LDAP_SERVER_DOWN;
    }

    msgid = ldap_search(ldap, base, LDAP_SCOPE_SUBTREE, filter, attrs, 0);

    if (msgid == LDAP_SERVER_DOWN) {
      // emit a disconnect
      Emit(serverdown, 0, NULL);
    }

    return msgid;
  }

  int Authenticate(const char *username, const char *password) 
  {
    HandleScope scope;
    int msgid;
    int fd;

    if (ldap == NULL) {
      return LDAP_SERVER_DOWN;
    }

    msgid = ldap_simple_bind(ldap, username, password);

    ldap_get_option(ldap, LDAP_OPT_DESC, &fd);    
    ev_io_set(&read_watcher_, fd, EV_READ);
    ev_io_start(EV_DEFAULT_ &read_watcher_);

    return msgid;
  }

  int Event(int whatisthis) 
  {
    HandleScope scope;
    LDAPMessage *ldap_res;  
    Handle<Value> args[3];
    int msgid;
    int res;

    if (ldap == NULL) {
      // disconnect event, or something arriving after
      // close(). Either way, ignore it.
      return 0;
    }

    if ((res = ldap_result(ldap, LDAP_RES_ANY, 1, NULL, &ldap_res)) < 1) {
      // let's assume this is because the server has fled.
      Emit(serverdown, 0, NULL);
      return 0;
    }

    msgid = ldap_msgid(ldap_res);

    switch(res) {
    case  LDAP_RES_BIND:
      args[0] = Integer::New(msgid);
      if (ldap_result2error(ldap, ldap_res, 0) != LDAP_SUCCESS) {
        args[1] = Local<Value>::New(Integer::New(0));
      } else {
        args[1] = Local<Value>::New(Integer::New(1));
      }
      Emit(bind_symbol, 2, args);
      break;

    case  LDAP_RES_SEARCH_RESULT:
      args[0] = Local<Value>::New(Integer::New(msgid));
      args[1] = parseReply(ldap_res);
      Emit(search_symbol, 2, args);
      break;

    default:
      args[0] = Local<Value>::New(String::New(ldap_err2string(res)));
      args[1] = Local<Value>::New(Integer::New(msgid));
      args[2] = Local<Value>::New(Integer::New(res));
      Emit(unknown_symbol, 3, args);
      break;
    }

    ldap_msgfree(ldap_res);
    return 0;
  }

  Local<Value> parseReply(LDAPMessage * res) 
  {
    HandleScope scope;
    LDAPMessage * entry = NULL;
    BerElement * berptr = NULL;
    char * attrname     = NULL;
    char ** vals;
    Local<Array>  js_result_list;
    Local<Object> js_result;
    Local<Array>  js_attr_vals;
    int j;
    char * dn;

    int entry_count = ldap_count_entries(ldap, res);
    js_result_list = Array::New(entry_count);

    for (entry = ldap_first_entry(ldap, res), j = 0 ; entry ;
         entry = ldap_next_entry(ldap, entry), j++) {
      js_result = Object::New();
      js_result_list->Set(Integer::New(j), js_result);
      
      dn = ldap_get_dn(ldap, entry);

      for (attrname = ldap_first_attribute(ldap, entry, &berptr) ;
           attrname ; attrname = ldap_next_attribute(ldap, entry, berptr)) {
        vals = ldap_get_values(ldap, entry, attrname);
        int num_vals = ldap_count_values(vals);
        js_attr_vals = Array::New(num_vals);
        js_result->Set(V8STR(attrname), js_attr_vals);
        for (int i = 0 ; i < num_vals && vals[i] ; i++) {
          js_attr_vals->Set(Integer::New(i), String::New(vals[i]));
        } // all values for this attr added.
        ldap_value_free(vals);
        ldap_memfree(attrname);
      } // attrs for this entry added. Next entry.
      js_result->Set(V8STR("dn"), V8STR(dn));
      ber_free(berptr,0);
      ldap_memfree(dn);
    } // all entries done.

    return scope.Close(js_result_list);
  }
  
  static Handle<Value> Open(const Arguments &args) 
  {
    HandleScope scope;
    Connection *c = ObjectWrap::Unwrap<Connection>(args.This());
    int res;

    String::Utf8Value uri(args[0]->ToString());

    if ((res = c->Open(*uri)) != 0) {
      return Local<Value>::New(Integer::New(res));
    }

    c->Emit(init_symbol, 0, NULL);

    c->Ref();

    return Undefined(); 
  }
  
  static Handle<Value> Close(const Arguments &args) 
  {
    HandleScope scope;
    Connection *c = ObjectWrap::Unwrap<Connection>(args.This());

    c->Close();

    return Undefined();
  }


  static Handle<Value> Search(const Arguments &args) 
  {
    HandleScope scope;

    Connection *c = ObjectWrap::Unwrap<Connection>(args.This());
    int sres;

    // Validate args.
    if (args.Length() < 3)       return THROW("Required arguments: base, filter, attrs");
    if (!args[0]->IsString())    return THROW("base should be a string");
    if (!args[1]->IsString())    return THROW("filter should be a string");
    if (!args[2]->IsString() &&
        !args[2]->IsArray())     return THROW("attrs should be string or array");

    // Input params.
    String::Utf8Value base(args[0]);
    String::Utf8Value filter(args[1]);

    String::Utf8Value tlist(args[2]->ToString());

    char *bufhead = strdup(*tlist);
    char *buf = bufhead;
    char **ap, *attrs[255];

    for (ap = attrs; (*ap = strsep(&buf, " \t,")) != NULL;)
      if (**ap != '\0')
        if (++ap >= &attrs[255])
          break;

    if ((sres = c->Search(*base, *filter, attrs)) < 0) {
      c->Emit(serverdown, 0, NULL);
    }

    free(bufhead);

    return scope.Close(Local<Value>::New(Integer::New(sres)));
  }

  static Handle<Value> Authenticate(const Arguments &args) 
  {
    HandleScope scope;

    Connection *c = ObjectWrap::Unwrap<Connection>(args.This());
    int sres;

    // Validate args.
    if (args.Length() < 2)      return THROW("Required arguments: username, password");
    if (!args[0]->IsString())   return THROW("username should be a string");
    if (!args[1]->IsString())   return THROW("password should be a string");

  // Input params.
    String::Utf8Value username(args[0]);
    String::Utf8Value password(args[1]);

    if ((sres = c->Authenticate(*username, *password)) < 0) {
      return THROW(ldap_err2string(sres));
    }

    return scope.Close(Local<Value>::New(Integer::New(sres)));
  }

  static void
  io_event (EV_P_ ev_io *w, int revents)
  {
    HandleScope scope;

    Connection *c = static_cast<Connection*>(w->data);

    c->Event(revents);
  }
};

extern "C" void
init(Handle<Object> target) {
  Connection::Initialize(target);
}
