#include <string.h>
#include <stdlib.h>

#include <v8.h>
#include <node.h>
#include <node_events.h>
#include <unistd.h>

#include <ldap.h>

using namespace v8; //NOLINT
using namespace node; //NOLINT

static Persistent<String> search_symbol;
static Persistent<String> init_symbol;
static Persistent<String> bind_symbol;
static Persistent<String> unknown_symbol;

#define V8STR(str) String::New(str)
#define THROW(message) ThrowException(Exception::TypeError(String::New(message)))

class Connection : EventEmitter {
 public:
  Connection () : EventEmitter () 
  {
    ev_init(&read_watcher_, io_event);
    read_watcher_.data = this;
    
    ldap = NULL;
    uri=NULL;
  }

  static void
  Initialize(Handle<Object> target) 
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

    target->Set(String::NewSymbol("Connection"), t->GetFunction());
  }

protected:
  LDAP * ldap;
  const char * uri;
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
    int res;

    res = ldap_unbind(ldap);
    ldap = NULL;

    return res;
  }


  int Open(const char * nuri) 
  {
    if (nuri == NULL) {
      // reconnect
      if (uri == NULL) {
        return -1;
      }
    }

    if (uri == NULL) {
      uri = strdup(nuri);
    }

    int res = ldap_initialize(&ldap, uri);

    ldap_set_option(ldap, LDAP_OPT_RESTART, LDAP_OPT_ON);

    Ref();

    return res;
  }

  int Search(const char * base, const char * filter, char ** attrs) 
  {
    int fd;
    int msgid;
 
    if (ldap == NULL) {
      return LDAP_SERVER_DOWN;
    }
        
    if ((msgid = ldap_search(ldap, base, LDAP_SCOPE_SUBTREE, filter, attrs, 0)) < 0) {
      Open(NULL);
      msgid = ldap_search(ldap, base, LDAP_SCOPE_SUBTREE, filter, attrs, 0);
    }

    if (msgid > -1) {
      ldap_get_option(ldap, LDAP_OPT_DESC, &fd);
      ev_io_set(&read_watcher_, fd, EV_READ);
      ev_io_start(EV_DEFAULT_ &read_watcher_);
    }
    
    return msgid;
  }

  int Authenticate(const char *username, const char *password) 
  {
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

  int Event(int whatsthis) 
  {
    LDAPMessage *ldap_res;  
    Local<Array> js_result;
    Handle<Value> args[2];
    int msgid;
    int res;
    
    if (ldap == NULL) {
      // disconnect event, or something arriving after
      // close(). Either way, ignore it.
      return 0;
    }

    if ((res = ldap_result(ldap, LDAP_RES_ANY, 1, NULL, &ldap_res)) < -1) {
      return 0;
    }

    msgid = ldap_msgid(ldap_res);

    switch(res) {
    case  LDAP_RES_BIND:
      args[0] = Integer::New(msgid);
      if (ldap_result2error(ldap, ldap_res, 0) != LDAP_SUCCESS) {
        args[1] = Integer::New(0);
      } else {
        args[1] = Integer::New(1);
      }
      Emit(bind_symbol, 2, args);
      break;

    case  LDAP_RES_SEARCH_RESULT:
      js_result = parseReply(ldap_res);
      args[0] = Integer::New(msgid);
      args[1] = js_result;
      Emit(search_symbol, 2, args);      
      break;

    default:
      Emit(unknown_symbol, 0, NULL);
      break;
    }

    ldap_msgfree(ldap_res);
    return 0;
  }

  Local<Array> parseReply(LDAPMessage * res) 
  {
    LDAPMessage * entry;
    BerElement * berptr;
    char * attrname;
    char ** vals;
    Local<Array> js_res_arr = Array::New();
    Local<Object> js_result;
    Local<Array> js_arr;
    int j;
    char * dn;

    for (entry = ldap_first_entry(ldap, res), j = 0 ; entry ;
         entry = ldap_next_entry(ldap, entry), j++) {
      js_result = Object::New();
      dn = ldap_get_dn(ldap, entry);
      for (attrname = ldap_first_attribute(ldap, entry, &berptr) ;
           attrname ; attrname = ldap_next_attribute(ldap, entry, berptr)) {
        vals = ldap_get_values(ldap, entry, attrname);
        for (int i = 0 ; vals[i] ; i++) {
          if (i == 0) {
            js_arr = Array::New();
          }
          js_arr->Set(Integer::New(i), String::New(vals[i]));
        }
        js_result->Set(V8STR(attrname), js_arr);
        ldap_value_free(vals);
      }
      js_result->Set(V8STR("dn"), V8STR(dn));
      ldap_memfree(dn);
      js_res_arr->Set(Integer::New(j), js_result);
    }

    return js_res_arr;
  }
  
  static Handle<Value> Open(const Arguments &args) 
  {
    HandleScope scope;
    Connection *c = ObjectWrap::Unwrap<Connection>(args.This());
    int res;

    String::Utf8Value uri(args[0]->ToString());

    if ((res = c->Open(*uri)) < 0) {
      return THROW(ldap_err2string(res));
    }

    c->Emit(init_symbol, 0, NULL);

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

    char * buf = strdup(*tlist);
    char **ap, *attrs[255];

    for (ap = attrs; (*ap = strsep(&buf, " \t,")) != NULL;)
      if (**ap != '\0')
        if (++ap >= &attrs[255])
          break;

    if ((sres = c->Search(*base, *filter, attrs)) < 0) {
      free(buf);
      return THROW(ldap_err2string(sres));
    }

    free(buf);

    return Local<Value>::New(Integer::New(sres));
  }

  static Handle<Value> Authenticate(const Arguments &args) 
  {
    HandleScope scope;

    Connection *c = ObjectWrap::Unwrap<Connection>(args.This());
    int sres;

    // Validate args.
    if (args.Length() < 2)      return THROW("Required arguments: base, filter");
    if (!args[0]->IsString())   return THROW("username should be a string");
    if (!args[1]->IsString())   return THROW("password should be a string");

  // Input params.
    String::Utf8Value username(args[0]);
    String::Utf8Value password(args[1]);

    if ((sres = c->Authenticate(*username, *password)) < 0) {
      return THROW(ldap_err2string(sres));
    }

    return Local<Value>::New(Integer::New(sres));
  }

  static void
  io_event (EV_P_ ev_io *w, int revents)
  {
    Connection *c = static_cast<Connection*>(w->data);

    c->Event(revents);
  }
};

extern "C" void
init(Handle<Object> target) {
  Connection::Initialize(target);
}
