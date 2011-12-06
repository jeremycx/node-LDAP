#include <string.h>
#include <stdlib.h>

#include <v8.h>
#include <node.h>
#include <node_events.h>
#include <unistd.h>
#include <errno.h>

#include <ldap.h>

using namespace node;
using namespace v8;

static Persistent<String> symbol_connected;
static Persistent<String> symbol_disconnected;
static Persistent<String> symbol_search;
static Persistent<String> symbol_search_paged;
static Persistent<String> symbol_error;
static Persistent<String> symbol_result;
static Persistent<String> symbol_unknown;

static Persistent<ObjectTemplate> cookie_template;

struct timeval ldap_tv = { 0, 0 }; // static struct used to make ldap_result non-blocking

#define REQ_FUN_ARG(I, VAR)                                             \
  if (args.Length() <= (I) || !args[I]->IsFunction())                   \
    return ThrowException(Exception::TypeError(                         \
                  String::New("Argument " #I " must be a function")));  \
  Local<Function> VAR = Local<Function>::Cast(args[I]);

#define THROW(msg) \
  return ThrowException(Exception::Error(String::New(msg)));

#define GETOBJ(r) \
  LDAPConnection * c = ObjectWrap::Unwrap<LDAPConnection>(args.This());

#define ENFORCE_ARG_LENGTH(n, m)                   \
  if (args.Length() < n) THROW(m);
  
#define ENFORCE_ARG_STR(n)                      \
  if (!args[n]->IsString()) THROW("Argument must be string");

#define ENFORCE_ARG_ARRAY(n)                      \
  if (!args[n]->IsArray()) THROW("Argument must be string");

#define ENFORCE_ARG_NUMBER(n)                      \
  if (!args[n]->IsNumber()) THROW("Argument must be numeric");

#define ENFORCE_ARG_BOOL(n)                      \
  if (!args[n]->IsBoolean()) THROW("Argument must be boolean");

#define ENFORCE_ARG_FUNC(n)                      \
  if (!args[n]->IsFunction()) THROW("Argument must be a function");

#define ARG_STR(v,a) String::Utf8Value v(args[a]);

#define ARG_INT(v,a) int v = args[a]->Int32Value();

#define ARG_BOOL(v,a) int v = args[a]->BooleanValue();

#define ARG_ARRAY(v, a) Local<Array> v = Local<Array>::Cast(args[a]);
    
#define RETURN_INT(i) return scope.Close(Integer::New(i));

#define NODE_METHOD(n) static Handle<Value> n(const Arguments& args)

class LDAPConnection : public EventEmitter
{
private:
  LDAP  *ld;
  ev_io read_watcher_;
  ev_io write_watcher_;

public:
  static Persistent<FunctionTemplate> s_ct;

  static void Init(Handle<Object> target)
  {
    HandleScope scope;
    Local<FunctionTemplate> ft = FunctionTemplate::New(New);

    ft->Inherit(EventEmitter::constructor_template);

    s_ct = Persistent<FunctionTemplate>::New(ft);
    s_ct->InstanceTemplate()->SetInternalFieldCount(1);
    s_ct->SetClassName(String::NewSymbol("LDAPConnection"));

    NODE_SET_PROTOTYPE_METHOD(s_ct, "open",         Open);
    NODE_SET_PROTOTYPE_METHOD(s_ct, "close",        Close);
    NODE_SET_PROTOTYPE_METHOD(s_ct, "search",       Search);
    NODE_SET_PROTOTYPE_METHOD(s_ct, "modify",       Modify);
    NODE_SET_PROTOTYPE_METHOD(s_ct, "simpleBind",   SimpleBind);
    NODE_SET_PROTOTYPE_METHOD(s_ct, "rename",       Rename);
    NODE_SET_PROTOTYPE_METHOD(s_ct, "add",          Add);

    symbol_connected    = NODE_PSYMBOL("connected");
    symbol_disconnected = NODE_PSYMBOL("disconnected");
    symbol_search       = NODE_PSYMBOL("searchresult");
    symbol_search_paged = NODE_PSYMBOL("searchresultpaged");
    symbol_error        = NODE_PSYMBOL("error");
    symbol_result       = NODE_PSYMBOL("result");
    symbol_unknown      = NODE_PSYMBOL("unknown");

    cookie_template = Persistent<ObjectTemplate>::New( ObjectTemplate::New() );
    cookie_template->SetInternalFieldCount(1);

    target->Set(String::NewSymbol("LDAPConnection"), s_ct->GetFunction());
  }

  NODE_METHOD(New)
  {
    HandleScope scope;
    LDAPConnection * c = new LDAPConnection();
    c->Wrap(args.This());

    ev_init(&(c->read_watcher_), LDAPConnection::io_event);
    c->read_watcher_.data = c;
    c->read_watcher_.fd = -1;
    
    c->ld = NULL;

    return args.This();
  }

  NODE_METHOD(Open)
  {
    HandleScope scope;
    GETOBJ(c);
    int err;

    ENFORCE_ARG_LENGTH(2, "Invaid number of arguments to Open()");
    ENFORCE_ARG_STR(0);
    ENFORCE_ARG_NUMBER(1);
    ARG_STR(uri, 0);
    ARG_INT(ver, 1);

    if (c->ld != NULL) {
      c->Close(args);
    }

    if ((err = ldap_initialize(&(c->ld), *uri) != LDAP_SUCCESS)) {
      THROW("Error init LDAP");
    }

    if (c->ld == NULL) {
      THROW("Error init LDAP");
    }

    ldap_set_option(c->ld, LDAP_OPT_RESTART, LDAP_OPT_ON);
    ldap_set_option(c->ld, LDAP_OPT_PROTOCOL_VERSION, &ver);

    return scope.Close(Integer::New(0));
  }

  NODE_METHOD(Close) {
    HandleScope scope;
    GETOBJ(c);
    int res;

    if (c->ld) {
      res = ldap_unbind(c->ld);
    }
    c->ld = NULL;

    ev_io_stop(EV_DEFAULT_ &(c->read_watcher_));

    c->Emit(symbol_disconnected, 0, NULL);

    RETURN_INT(0);
  }

  NODE_METHOD(Search) {
    HandleScope scope;
    GETOBJ(c);
    int fd, msgid, rc;
    char * attrs[255];
    char ** ap;
    LDAPControl* serverCtrls[2] = { NULL, NULL };
    int page_size = 0;
    v8::Local<v8::Object> cookieObj;
    struct berval* cookie = NULL;

    //base scope filter attrs
    ENFORCE_ARG_LENGTH(4, "Invalid number of arguments to Search()");
    ENFORCE_ARG_STR(0);
    ENFORCE_ARG_NUMBER(1);
    ENFORCE_ARG_STR(2);
    ENFORCE_ARG_STR(3);

    ARG_STR(base,         0);
    ARG_INT(searchscope,  1);
    ARG_STR(filter,       2);
    ARG_STR(attrs_str,    3);

    if (args.Length() >= 5) {
      // process optional arguments: [, pageSize [, cookie] ]
      ENFORCE_ARG_NUMBER(4);
      page_size = args[4]->Int32Value();
      if (args.Length() >= 6 && !args[5]->IsUndefined()) {
        // we have the cookie, too
        if (!args[5]->IsObject()) {
          THROW("invalid cookie object for paged search");
        }
        cookieObj = args[5]->ToObject();
        if (cookieObj->InternalFieldCount() != 1) {
          THROW("invalid cookie object for paged search");
        }
        cookie = static_cast<berval*>(
            cookieObj->GetPointerFromInternalField(0));
        if (cookie == NULL) {
          THROW("invalid cookie object for paged search");
        }
        cookieObj->SetPointerInInternalField(0, NULL);
      }
    }

    if (c->ld == NULL) {
      c->Emit(symbol_disconnected, 0, NULL);
      if (cookie) {
        ber_bvfree(cookie);
        cookie = NULL;
      }
      RETURN_INT(LDAP_SERVER_DOWN);
    }

    char *bufhead = strdup(*attrs_str);
    char *buf = bufhead;

    for (ap = attrs; (*ap = strsep(&buf, " \t,")) != NULL;)
      if (**ap != '\0')
        if (++ap >= &attrs[255])
          break;

    if (page_size > 0) {
      rc = ldap_create_page_control(c->ld, page_size, cookie, 'F',
            &serverCtrls[0]);

      if (cookie) {
        ber_bvfree(cookie);
        cookie = NULL;
      }
      if (rc != LDAP_SUCCESS) {
        free(bufhead);
        RETURN_INT(-1);
      }

    } else if (cookie) {
      ber_bvfree(cookie);
      cookie = NULL;
    }

    rc = ldap_search_ext(c->ld, *base, searchscope, *filter, attrs, 0,
        serverCtrls, NULL, NULL, 0, &msgid);

    if (serverCtrls[0]) {
      ldap_control_free(serverCtrls[0]);
    }
    if (LDAP_API_ERROR(rc)) {
      msgid = -1;
    } else {
      ldap_get_option(c->ld, LDAP_OPT_DESC, &fd);
      if (c->read_watcher_.fd != fd) {
        if (ev_is_active(&c->read_watcher_)) {
          ev_io_stop(&c->read_watcher_);
        }
        ev_io_set(&(c->read_watcher_), fd, EV_READ);
        ev_io_start(EV_DEFAULT_ &(c->read_watcher_));
      }
    }

    free(bufhead);

    RETURN_INT(msgid);
  }

  NODE_METHOD(Modify) {
    HandleScope scope;
    GETOBJ(c);
    int msgid;

    // Validate args. God.
    ENFORCE_ARG_LENGTH(2, "Invaid number of arguments to Modify()");
    ENFORCE_ARG_STR(0);
    ENFORCE_ARG_ARRAY(1);

    ARG_STR(dn, 0);
    ARG_ARRAY(modsHandle, 1);

    if (c->ld == NULL) {
      c->Emit(symbol_disconnected, 0, NULL);
      RETURN_INT(-1);
    }

    int numOfMods = modsHandle->Length();
    for (int i = 0; i < numOfMods; i++) {
      // Hey this is so cumbersome.
      if (!modsHandle->Get(Integer::New(i))->IsObject()) {
        THROW("Each mod should be an object");
      }
    }

    // Now prepare the LDAPMod array.
    LDAPMod **ldapmods = (LDAPMod **) malloc(sizeof(LDAPMod *) * (numOfMods + 1));

    for (int i = 0; i < numOfMods; i++) {
      Local<Object> modHandle =
          Local<Object>::Cast(modsHandle->Get(Integer::New(i)));

      ldapmods[i] = (LDAPMod *) malloc(sizeof(LDAPMod));

      // Step 1: mod_op
      String::Utf8Value mod_op(modHandle->Get(String::New("op")));

      if (!strcmp(*mod_op, "add")) {
        ldapmods[i]->mod_op = LDAP_MOD_ADD;
      } else if (!strcmp(*mod_op, "delete")) {
        ldapmods[i]->mod_op = LDAP_MOD_DELETE;
      } else {
        ldapmods[i]->mod_op = LDAP_MOD_REPLACE;
      }

      // Step 2: mod_type
      String::Utf8Value mod_type(modHandle->Get(String::New("type")));
      ldapmods[i]->mod_type = strdup(*mod_type);

      // Step 3: mod_vals
      Local<Array> modValsHandle =
          Local<Array>::Cast(modHandle->Get(String::New("vals")));
      int modValsLength = modValsHandle->Length();
      ldapmods[i]->mod_values = (char **) malloc(sizeof(char *) *
          (modValsLength + 1));
      for (int j = 0; j < modValsLength; j++) {
        String::Utf8Value modValue(modValsHandle->Get(Integer::New(j)));
        ldapmods[i]->mod_values[j] = strdup(*modValue);
      }
      ldapmods[i]->mod_values[modValsLength] = NULL;
    }

    ldapmods[numOfMods] = NULL;

    msgid = ldap_modify(c->ld, *dn, ldapmods);

    if (msgid == LDAP_SERVER_DOWN) {
      c->Emit(symbol_disconnected, 0, NULL);
      RETURN_INT(-1);
    }

    RETURN_INT(msgid);
  }

  NODE_METHOD(Add)
  {
    HandleScope scope;
    GETOBJ(c);
    int msgid;
    int fd;

    // Validate args. God.
    ENFORCE_ARG_LENGTH(2, "Invalid number of arguments to Add()");
    ENFORCE_ARG_STR(0);
    ENFORCE_ARG_ARRAY(1);
    ARG_STR(dn, 0);
    ARG_ARRAY(attrsHandle, 1);

    if (c->ld == NULL) RETURN_INT(LDAP_SERVER_DOWN);
    
    int numOfAttrs = attrsHandle->Length();
    for (int i = 0; i < numOfAttrs; i++) {
      // Hey this is still so cumbersome.
      if (!attrsHandle->Get(Integer::New(i))->IsObject()) {
        THROW("Each attr should be an object");
      }
    }

    // Now prepare the LDAPMod array.
    LDAPMod **ldapmods = (LDAPMod **) malloc(sizeof(LDAPMod *) * (numOfAttrs + 1));

    for (int i = 0; i < numOfAttrs; i++) {
      Local<Object> attrHandle =
          Local<Object>::Cast(attrsHandle->Get(Integer::New(i)));

      ldapmods[i] = (LDAPMod *) malloc(sizeof(LDAPMod));

      // Step 1: mod_op
      ldapmods[i]->mod_op = 0;

      // Step 2: mod_type
      String::Utf8Value mod_type(attrHandle->Get(String::New("type")));
      ldapmods[i]->mod_type = strdup(*mod_type);

      // Step 3: mod_vals
      Local<Array> attrValsHandle =
          Local<Array>::Cast(attrHandle->Get(String::New("vals")));
      int attrValsLength = attrValsHandle->Length();
      ldapmods[i]->mod_values = (char **) malloc(sizeof(char *) *
          (attrValsLength + 1));
      for (int j = 0; j < attrValsLength; j++) {
        String::Utf8Value modValue(attrValsHandle->Get(Integer::New(j)));
        ldapmods[i]->mod_values[j] = strdup(*modValue);
      }
      ldapmods[i]->mod_values[attrValsLength] = NULL;
    }

    ldapmods[numOfAttrs] = NULL;

    msgid = ldap_add(c->ld, *dn, ldapmods);
    ldap_get_option(c->ld, LDAP_OPT_DESC, &fd);
    if (c->read_watcher_.fd != fd) {
      if (ev_is_active(&c->read_watcher_)) {
        ev_io_stop(&c->read_watcher_);
      }
      ev_io_set(&(c->read_watcher_), fd, EV_READ);
      ev_io_start(EV_DEFAULT_ &(c->read_watcher_));
    }

    if (msgid == LDAP_SERVER_DOWN) {
      c->Emit(symbol_disconnected, 0, NULL);
    }

    ldap_mods_free(ldapmods, 1);

    RETURN_INT(msgid);
  }

  NODE_METHOD(Rename)
  {
    HandleScope scope;
    GETOBJ(c);
    int msgid;
    int fd;

    // Validate args.
    ENFORCE_ARG_LENGTH(2, "Invalid number of arguments to Rename()");
    ENFORCE_ARG_STR(0);
    ENFORCE_ARG_STR(1);
    ENFORCE_ARG_STR(2);
    ENFORCE_ARG_BOOL(3);
    ARG_STR(dn, 0);
    ARG_STR(newrdn, 1);
    ARG_STR(newparent, 2);
    //    ARG_BOOL(deleteoldrdn, 3);

    if (c->ld == NULL) {
      c->Emit(symbol_disconnected, 0, NULL);
      RETURN_INT(LDAP_SERVER_DOWN);
    }

    if ((msgid = ldap_modrdn(c->ld, *dn, *newrdn) == LDAP_SERVER_DOWN)) {
      c->Emit(symbol_disconnected, 0, NULL);
      RETURN_INT(LDAP_SERVER_DOWN);
    }

    ldap_get_option(c->ld, LDAP_OPT_DESC, &fd);
    if (c->read_watcher_.fd != fd) {
      if (ev_is_active(&c->read_watcher_)) {
        ev_io_stop(&c->read_watcher_);
      }
      ev_io_set(&(c->read_watcher_), fd, EV_READ);
      ev_io_start(EV_DEFAULT_ &(c->read_watcher_));
    }

    RETURN_INT(msgid);

  }

  NODE_METHOD(SimpleBind)
  {
    HandleScope scope;
    GETOBJ(c);
    int fd;
    int msgid;
    char * binddn = NULL;
    char * password = NULL;

    if (c->ld == NULL) {
      RETURN_INT(LDAP_SERVER_DOWN);
    }

    if (args.Length() > 0) {
      // this is NOT an anonymous bind
      ENFORCE_ARG_LENGTH(2, "Invalid number of arguments to SimpleBind()");
      ENFORCE_ARG_STR(0);
      ENFORCE_ARG_STR(1);
      ARG_STR(j_binddn, 0);
      ARG_STR(j_password, 1);
      
      binddn = strdup(*j_binddn);
      password = strdup(*j_password);
    }
    
    if ((msgid = ldap_simple_bind(c->ld, binddn, password)) == LDAP_SERVER_DOWN) {
      c->Emit(symbol_disconnected, 0, NULL);
    } else {
      ldap_get_option(c->ld, LDAP_OPT_DESC, &fd);    
      if (c->read_watcher_.fd != fd) {
        if (ev_is_active(&c->read_watcher_)) {
          ev_io_stop(&c->read_watcher_);
        }
        ev_io_set(&(c->read_watcher_), fd, EV_READ);
        ev_io_start(EV_DEFAULT_ &(c->read_watcher_));
      }
    }
  
    free(binddn);
    free(password);

    RETURN_INT(msgid);
  }


  Local<Value> parseReply(LDAPConnection * c, LDAPMessage * res) 
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

    int entry_count = ldap_count_entries(c->ld, res);
    js_result_list = Array::New(entry_count);

    for (entry = ldap_first_entry(c->ld, res), j = 0 ; entry ;
         entry = ldap_next_entry(c->ld, entry), j++) {
      js_result = Object::New();
      js_result_list->Set(Integer::New(j), js_result);
      
      dn = ldap_get_dn(c->ld, entry);

      for (attrname = ldap_first_attribute(c->ld, entry, &berptr) ;
           attrname ; attrname = ldap_next_attribute(c->ld, entry, berptr)) {
        vals = ldap_get_values(c->ld, entry, attrname);
        int num_vals = ldap_count_values(vals);
        js_attr_vals = Array::New(num_vals);
        js_result->Set(String::New(attrname), js_attr_vals);
        for (int i = 0 ; i < num_vals && vals[i] ; i++) {
          js_attr_vals->Set(Integer::New(i), String::New(vals[i]));
        } // all values for this attr added.
        ldap_value_free(vals);
        ldap_memfree(attrname);
      } // attrs for this entry added. Next entry.
      js_result->Set(String::New("dn"), String::New(dn));
      ber_free(berptr,0);
      ldap_memfree(dn);
    } // all entries done.

    return scope.Close(js_result_list);
  }

  static void
  io_event (EV_P_ ev_io *w, int revents)
  {
    HandleScope scope;
    LDAPConnection *c = static_cast<LDAPConnection*>(w->data);
    LDAPMessage *ldap_res;  
    LDAPControl** srv_controls;
    Handle<Value> args[3];
    int op;
    int res;
    int msgid;
    int error;

    // not sure if this is neccesary...
    if (!(revents & EV_READ)) {
      return;
    }

    if (c->ld == NULL) {
      // disconnect event, or something arriving after
      // close(). Either way, ignore it.
      return;
    }

    res = ldap_result(c->ld, LDAP_RES_ANY, 1, &ldap_tv, &ldap_res);
    {
      // if ldap silently handled reconnect, fd may now be different
      int fd = -1;
      ldap_get_option(c->ld, LDAP_OPT_DESC, &fd);
      if (c->read_watcher_.fd != fd) {
        if (ev_is_active(&c->read_watcher_)) {
          ev_io_stop(&c->read_watcher_);
        }
        ev_io_set(&(c->read_watcher_), fd, EV_READ);
        ev_io_start(EV_DEFAULT_ &(c->read_watcher_));
      }
    }

    if (res == 0) {
      // No complete messages were available. In theory, this will happen when
      // reply consists of more packets, and not all have arrived yet.
      //
      // In practice, code ends here over 10 times per result packet, even for
      // searches where answer consists only of two packets. Not sure why,
      // might be worth investigating, hiting this case too often could harm
      // performance a bit.
      return;
    } else if (res < 0) {
      c->Emit(symbol_disconnected, 0, NULL);
      return;
    }
    op = res;

    msgid = ldap_msgid(ldap_res);
    res = ldap_parse_result(c->ld, ldap_res, &error, NULL, NULL, NULL,
        &srv_controls, 0);

    args[0] = Integer::New(msgid);
    args[1] = Local<Value>::New(Integer::New(res));

    if (res != LDAP_SUCCESS || error) {
      args[1] = Integer::New(error);
      args[2] = Local<Value>::New(String::New(ldap_err2string(error)));
      c->Emit(symbol_error, 3, args);
    } else {
      switch(op) {
      case LDAP_RES_BIND:
      case LDAP_RES_MODIFY:
      case LDAP_RES_MODDN:
      case LDAP_RES_ADD:
        c->Emit(symbol_result, 2, args);
        break;

      case  LDAP_RES_SEARCH_RESULT:
        args[2] = c->parseReply(c, ldap_res);
        if (!srv_controls) {
          c->Emit(symbol_search, 3, args);
          break;
        }
        {
          struct berval* cookie = NULL;
          ldap_parse_page_control(c->ld, srv_controls, NULL, &cookie);
          if (!cookie || cookie->bv_val == NULL || !*cookie->bv_val) {
            // no more paged results, signal end to user code
            if (cookie) {
              ber_bvfree(cookie);
            }
            args[3] = v8::Undefined();
          } else {
            Local<Object> cookieObj(cookie_template->NewInstance());
            cookieObj->SetPointerInInternalField(0, cookie);
            args[3] = cookieObj;
          }
          c->Emit(symbol_search_paged, 4, args);
        }
        break;

      default:
        c->Emit(symbol_unknown, 1, args);
        break;
      }
    }

    if (srv_controls) {
      ldap_controls_free(srv_controls);
    }
    ldap_msgfree(ldap_res);
  }

};

Persistent<FunctionTemplate> LDAPConnection::s_ct;

extern "C" void
init(Handle<Object> target) {
  LDAPConnection::Init(target);
}
