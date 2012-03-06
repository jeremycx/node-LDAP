#include <string.h>
#include <stdlib.h>

#include <v8.h>
#include <node.h>
#include <node_object_wrap.h>
#include <unistd.h>
#include <errno.h>

#include <ldap.h>
#include <uuid.h>

using namespace node;
using namespace v8;

static Persistent<String> symbol_connected; 
static Persistent<String> symbol_disconnected; 
static Persistent<String> symbol_search;
static Persistent<String> symbol_search_paged;
static Persistent<String> symbol_error;
static Persistent<String> symbol_result;
static Persistent<String> symbol_syncresult;
static Persistent<String> symbol_syncentry;
static Persistent<String> symbol_syncintermediate;
static Persistent<String> symbol_syncidset;
static Persistent<String> symbol_syncnewcookie;
static Persistent<String> symbol_unknown;
static Persistent<String> emit_symbol;

static Persistent<ObjectTemplate> cookie_template;

static Persistent<Function> ldapConstructor;

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

#define EMIT(c, num, args) {                              \
      Local<Value> emit_v = c->handle_->Get(emit_symbol); \
      assert(emit_v->IsFunction()); \
      Local<Function> emit = Local<Function>::Cast(emit_v); \
      TryCatch tc; \
      emit->Call(c->handle_, num, args); \
      if (tc.HasCaught()) { \
        FatalException(tc); \
      }  \
  }

#define EMITDISCONNECT(c) { \
    Handle<Value> args[1]; \
    args[0] = symbol_disconnected; \
    EMIT(c, 1, args); \
  }

class LDAPConnection : public ObjectWrap
{
private:
  LDAP  *ld;
  unsigned int sync_id;
  ldap_sync_refresh_t refreshPhase;
  ev_io read_watcher_;
  ev_io write_watcher_;

public:
  
  LDAPConnection() : ObjectWrap(){ }

  static void Initialize(Handle<Object> target)
  {
    HandleScope scope;
	
	cookie_template = Persistent<ObjectTemplate>::New( ObjectTemplate::New() );
    cookie_template->SetInternalFieldCount(1);
   
	// default the symbols used for emitting the events
    symbol_connected = NODE_PSYMBOL("connected");
    symbol_disconnected = NODE_PSYMBOL("disconnected");
    symbol_search = NODE_PSYMBOL("searchresult");
    symbol_search_paged = NODE_PSYMBOL("searchresultpaged");
    symbol_error = NODE_PSYMBOL("error");
    symbol_result = NODE_PSYMBOL("result");
    symbol_syncresult = NODE_PSYMBOL("syncresult");
    symbol_syncentry = NODE_PSYMBOL("syncentry");
    symbol_syncintermediate = NODE_PSYMBOL("syncintermediate");
    symbol_syncidset = NODE_PSYMBOL("syncidset");
    symbol_syncnewcookie = NODE_PSYMBOL("newcookie");
    symbol_unknown = NODE_PSYMBOL("unknown");
    emit_symbol = NODE_PSYMBOL("emit");//define the event symbol

    Local<FunctionTemplate> t = FunctionTemplate::New(New);//constructor template
    t->InstanceTemplate()->SetInternalFieldCount(1);
    t->SetClassName(String::NewSymbol("LDAPConnection"));
    //removed the EventEmitter inheritance from the C++ file. added to the LDAP.js file
    NODE_SET_PROTOTYPE_METHOD(t, "open", Open);
    NODE_SET_PROTOTYPE_METHOD(t, "close", Close);
    NODE_SET_PROTOTYPE_METHOD(t, "search", Search);
    NODE_SET_PROTOTYPE_METHOD(t, "sync", Sync);
    NODE_SET_PROTOTYPE_METHOD(t, "modify", Modify);
    NODE_SET_PROTOTYPE_METHOD(t, "simpleBind", SimpleBind);
    NODE_SET_PROTOTYPE_METHOD(t, "rename", Rename);
    NODE_SET_PROTOTYPE_METHOD(t, "add", Add);
    ldapConstructor = Persistent<Function>::New(t->GetFunction());
    target->Set(String::NewSymbol("LDAPConnection"), ldapConstructor);
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
    c->sync_id = 0;

    return args.This();
  }

  NODE_METHOD(Open)
  {
    HandleScope scope;
    GETOBJ(c);
    int err;
    ENFORCE_ARG_LENGTH(2, "Invalid number of arguments to Open()");
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
      EMITDISCONNECT(c);

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
          ev_io_stop(EV_DEFAULT_UC_(&c->read_watcher_));
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
      EMITDISCONNECT(c);
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
      EMITDISCONNECT(c);
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
        ev_io_stop(EV_DEFAULT_UC_ &(c->read_watcher_) );
      }
      ev_io_set(&(c->read_watcher_), fd, EV_READ);
      ev_io_start(EV_DEFAULT_ &(c->read_watcher_));
    }

    if (msgid == LDAP_SERVER_DOWN) {
      EMITDISCONNECT(c);
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
      EMITDISCONNECT(c);
      RETURN_INT(LDAP_SERVER_DOWN);
    }

    if ((msgid = ldap_modrdn(c->ld, *dn, *newrdn) == LDAP_SERVER_DOWN)) {
      EMITDISCONNECT(c);
      RETURN_INT(LDAP_SERVER_DOWN);
    }

    ldap_get_option(c->ld, LDAP_OPT_DESC, &fd);
    if (c->read_watcher_.fd != fd) {
      if (ev_is_active(&c->read_watcher_)) {
        ev_io_stop( EV_DEFAULT_UC_ & (c->read_watcher_) );
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
      EMITDISCONNECT(c);
    } else {
      LDAPConnection::SetIO(c);
    }
  
    free(binddn);
    free(password);

    RETURN_INT(msgid);
  }

  static void SetIO(LDAPConnection *c) {
    int fd;

    ldap_get_option(c->ld, LDAP_OPT_DESC, &fd);

    if (fd > 0) {
      if (ev_is_active(&c->read_watcher_)) {
        ev_io_stop(EV_DEFAULT_UC_(&c->read_watcher_));
      }
      ev_io_set(&(c->read_watcher_), fd, EV_READ);
      ev_io_start(EV_DEFAULT_ &(c->read_watcher_));
    }
  }

  
  Local<Value> parseReply(LDAPConnection * c, LDAPMessage * msg) 
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

    int entry_count = ldap_count_entries(c->ld, msg);

    js_result_list = Array::New(entry_count);

    for (entry = ldap_first_entry(c->ld, msg), j = 0 ; entry ;
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


      // we'll need this to extract the controls, etc.
      //          ldap_parse_result(c->ld, msg, &error, NULL, &errmsg, NULL,
      //                          &srv_controls, 0); //todo - check result


  static void
  io_event (EV_P_ ev_io *w, int revents)
  {
    HandleScope scope;
    LDAPConnection *c = static_cast<LDAPConnection*>(w->data);
    LDAPMessage	* msg = NULL;
    LDAPMessage * res = NULL;
    Handle<Value> args[4];
    int msgid = 0;

    // not sure if this is neccesary...
    if (!(revents & EV_READ)) {
      return;
    }

    if (c->ld == NULL) {
      // disconnect event, or something arriving after
      // close(). Either way, ignore it.
      return;
    }

    // is sync is active, check the sync msgid first.
    // this ldap_result call should deplete all the sync messages waiting.
    // we can then fall through to checking for regular results.
    if (c->sync_id) { 
      c->check_sync_results(c);
    }

    // now check for any other pending messages....
    switch(ldap_result(c->ld, LDAP_RES_ANY, 1, &ldap_tv, &res)) {
    case 0:
      return;
    case -1:
      EMITDISCONNECT(c);
      return;
    default:
      msg = res;

      msgid = ldap_msgid(msg);
          
      switch ( ldap_msgtype( msg ) ) {
      case LDAP_RES_SEARCH_REFERENCE:
        break;
      case LDAP_RES_SEARCH_ENTRY:
      case LDAP_RES_SEARCH_RESULT:
        args[0] = symbol_search;
        args[1] = Integer::New(msgid);
        args[2] = c->parseReply(c, res);
        EMIT(c, 3, args);
        break;

      case LDAP_RES_BIND:
      case LDAP_RES_MODIFY:
      case LDAP_RES_MODDN:
      case LDAP_RES_ADD:
        args[0] = symbol_result; 
        args[1] = Integer::New(msgid);
        EMIT(c, 2, args);
        break;
      default:
        args[0] = symbol_unknown;
        args[1] = Integer::New(msgid);
        EMIT(c, 2, args);
        break;
      }
      ldap_msgfree(res);
    }
  }

  /* *************************************************************************************
   * Sync Routines
   * These routines handle sync status
   *
   * ACKNOWLEDGEMENTS:
   * Adapted from software originally developed by Pierangelo Masarati
   * for inclusion in OpenLDAP.
   *
   * ************************************************************************************/

  NODE_METHOD(Sync) {
    HandleScope scope;
    GETOBJ(c);
    LDAPControl	ctrl = { 0 },
               *ctrls[ 2 ];
    BerElement	*ber = NULL;
    int rc;
    char ** attrs;
    char ** ap;
    int msgid;

    ARG_STR(base,         0);
    ARG_INT(searchscope,  1);
    ARG_STR(filter,       2);
    ARG_STR(attrs_str,    3);
    ARG_STR(cookie,       4);

    // TODO: parse and convert attrs
    char *bufhead = strdup(*attrs_str);
    char *buf = bufhead;

    for (ap = attrs; (*ap = strsep(&buf, " \t,")) != NULL;)
      if (**ap != '\0')
        if (++ap >= &attrs[255])
          break;

    ctrls[ 0 ] = &ctrl;
    ctrls[ 1 ] = NULL;
        
    ber = ber_alloc_t( LBER_USE_DER );

    c->refreshPhase = LDAP_SYNC_CAPI_NONE;

    if ( args[4]->IsUndefined()) {
      ber_printf( ber, "{eb}", LDAP_SYNC_REFRESH_AND_PERSIST, 0 );
    } else {
      ber_printf( ber, "{esb}", LDAP_SYNC_REFRESH_AND_PERSIST, *cookie, 1 );
    }

    rc = ber_flatten2( ber, &ctrl.ldctl_value, 0 );

    ctrl.ldctl_oid = (char *)LDAP_CONTROL_SYNC;
    ctrl.ldctl_iscritical = 1;

    rc = ldap_search_ext( c->ld, *base, searchscope, *filter, attrs, 0, ctrls, NULL, NULL, 0, &msgid);

    free(bufhead);

    if ( rc != LDAP_SUCCESS ) {
      msgid = -1;
    }

    if ( ber != NULL ) {
      ber_free( ber, 1 );
    }

    c->sync_id = msgid;

    RETURN_INT(msgid);
  }

  static void check_sync_results(LDAPConnection * c) {
    LDAPMessage * res = NULL;
    LDAPMessage * msg = NULL;
    unsigned int msgid;
    int refreshDone;


    for ( ; ; )
      switch(ldap_result(c->ld, c->sync_id, LDAP_MSG_RECEIVED, &ldap_tv, &res) > 0) {
      case 0:
        goto done;
        break;

      case -1:
        break;

      default:
        for ( msg = ldap_first_message( c->ld, res );
              msg != NULL;
              msg = ldap_next_message( c->ld, msg ) ) {

          msgid = ldap_msgid(msg);

          switch(ldap_msgtype(msg)) {
          case LDAP_RES_SEARCH_ENTRY:
            sync_search_entry(c, msg);
            break;

          case LDAP_RES_SEARCH_RESULT:
            sync_search_result(c, msg);
            break;

          case LDAP_RES_INTERMEDIATE:
            sync_search_intermediate(c, msg, &refreshDone);
            break;

          default:
            break;
            // ?? error or shutup?
          }
        }
        ldap_msgfree(res);
      }

  done:;

    
    return;
  }

  Local<Value> uuid2array (BerVarray syncUUIDs) {
    HandleScope scope;
    int i;
    Local<Array>  js_result_list;

    // is there a better way to count this?
    for ( i = 0; syncUUIDs[ i ].bv_val != NULL; i++ ); 

    js_result_list = Array::New(i);

    for ( i = 0; syncUUIDs[ i ].bv_val != NULL; i++ ) {
      uint32_t status;
      char * uuid;
      uuid_to_string((const uuid_t *)syncUUIDs[ i ].bv_val, &uuid, &status);
      js_result_list->Set(Integer::New(i), String::New(uuid));
      free(uuid);
    }

    return scope.Close(js_result_list);
  }


  static int sync_search_entry( LDAPConnection * c, LDAPMessage * res ) {
    LDAPControl **ctrls = NULL;
    int	rc = LDAP_OTHER;
    int i;
    BerElement *ber = NULL;
    struct berval entryUUID = { 0 }, cookie = { 0 };
    int	state = -1;
    ber_len_t len;
    
    assert( res != NULL );

    /* extract controls */
    ldap_get_entry_controls( c->ld, res, &ctrls );
    if ( ctrls == NULL ) {
      goto done;
    }

    /* lookup the sync state control */
    for ( i = 0; ctrls[ i ] != NULL; i++ ) {
      if ( strcmp( ctrls[ i ]->ldctl_oid, LDAP_CONTROL_SYNC_STATE ) == 0 ) {
        break;
      }
    }

    /* control must be present; there might be other... */
    if ( ctrls[ i ] == NULL ) {
      goto done;
    }

    /* extract data */
    ber = ber_init( &ctrls[ i ]->ldctl_value );
    if ( ber == NULL ) {
      goto done;
    }
    /* scan entryUUID in-place ("m") */
    if ( ber_scanf( ber, "{em" /*"}"*/, &state, &entryUUID ) == LBER_ERROR || entryUUID.bv_len == 0 ) {
      goto done;
    }

    if ( ber_peek_tag( ber, &len ) == LDAP_TAG_SYNC_COOKIE ) {
      /* scan cookie in-place ("m") */
      if ( ber_scanf( ber, /*"{"*/ "m}", &cookie ) == LBER_ERROR ) {
        goto done;
      }
    }

    switch ( state ) {
    case LDAP_SYNC_PRESENT:
    case LDAP_SYNC_DELETE:
    case LDAP_SYNC_ADD:
    case LDAP_SYNC_MODIFY:
      /* NOTE: ldap_sync_refresh_t is defined
       * as the corresponding LDAP_SYNC_*
       * for the 4 above cases */
      c->refreshPhase = (ldap_sync_refresh_t) state;
      break;
      
    default:
      goto done;
    }

    {
      Handle<Value> args[5];
      char * uuid = NULL;

      if (entryUUID.bv_len) {
        uint32_t status;
        uuid_to_string((const uuid_t *)entryUUID.bv_val, &uuid, &status);
      }

      args[0] = symbol_syncentry;
      args[1] = c->parseReply(c, res);
      args[2] = cookie.bv_len?String::New(cookie.bv_val):Undefined();;
      args[3] = entryUUID.bv_len?String::New(uuid):Undefined();
      args[4] = Integer::New(c->refreshPhase);
      EMIT(c, 5, args);
      
      args[0] = symbol_syncnewcookie;
      args[1] = cookie.bv_len?String::New(cookie.bv_val):Undefined();;
      EMIT(c, 2, args);

      if (uuid) free(uuid);
    }

  done:;
    if ( ber != NULL ) {
      ber_free( ber, 1 );
    }

    if ( ctrls != NULL ) {
      ldap_controls_free( ctrls );
    }
    
    return rc;
  }


  static int sync_search_result( LDAPConnection * c, LDAPMessage *res ) {
    int	err;
    char *matched = NULL, *msg = NULL;
    LDAPControl	**ctrls = NULL;
    int	rc;
    int	refreshDeletes = -1;
    struct berval	cookie = { 0 };

    /* should not happen in refreshAndPersist... */
    rc = ldap_parse_result( c->ld, res, &err, &matched, &msg, NULL, &ctrls, 0 );
    if ( rc == LDAP_SUCCESS ) {
      rc = err;
    }

    c->refreshPhase = LDAP_SYNC_CAPI_DONE;

    switch ( rc ) {
    case LDAP_SUCCESS: {
      int		i;
      BerElement	*ber = NULL;
      ber_len_t	len;

      rc = LDAP_OTHER;

      /* deal with control; then fallthru to handler */
      if ( ctrls == NULL ) {
        goto done;
      }

      /* lookup the sync state control */
      for ( i = 0; ctrls[ i ] != NULL; i++ ) {
        if ( strcmp( ctrls[ i ]->ldctl_oid, LDAP_CONTROL_SYNC_DONE ) == 0 )          {
            break;
        }
      }

      /* control must be present; there might be other... */
      if ( ctrls[ i ] == NULL ) {
        goto done;
      }

      /* extract data */
      ber = ber_init( &ctrls[ i ]->ldctl_value );
      if ( ber == NULL ) {
        goto done;
      }

      if ( ber_scanf( ber, "{" /*"}"*/) == LBER_ERROR ) {
        goto ber_done;
      }
      if ( ber_peek_tag( ber, &len ) == LDAP_TAG_SYNC_COOKIE ) {
        if ( ber_scanf( ber, "m", &cookie ) == LBER_ERROR ) {
          goto ber_done;
        }
      }

      refreshDeletes = 0;
      if ( ber_peek_tag( ber, &len ) == LDAP_TAG_REFRESHDELETES ) {
        if ( ber_scanf( ber, "b", &refreshDeletes ) == LBER_ERROR ) {
          goto ber_done;
        }
        if ( refreshDeletes ) {
          refreshDeletes = 1;
        }
      }

      if ( ber_scanf( ber, /*"{"*/ "}" ) != LBER_ERROR ) {
        rc = LDAP_SUCCESS;
      }

      ber_done:;
      ber_free( ber, 1 );
      if ( rc != LDAP_SUCCESS ) {
        break;
      }

      /* FIXME: what should we do with the refreshDelete? */
      switch ( refreshDeletes ) {
      case 0:
        c->refreshPhase = LDAP_SYNC_CAPI_PRESENTS;
        break;

      default:
        c->refreshPhase = LDAP_SYNC_CAPI_DELETES;
        break;
      }

    } /* fallthru */

    case LDAP_SYNC_REFRESH_REQUIRED:
      /* TODO: check for Sync Done Control */
      /* FIXME: perhaps the handler should be called
       * also in case of failure; we'll deal with this 
       * later when implementing refreshOnly */
      {
        Handle<Value> args[4];
        args[0] = symbol_syncresult;
        args[1] = c->parseReply(c, res);
        args[2] = cookie.bv_len?String::New(cookie.bv_val):Undefined();
        args[3] = Integer::New(c->refreshPhase);
        EMIT(c, 4, args);

        args[0] = symbol_syncnewcookie;
        args[1] = cookie.bv_len?String::New(cookie.bv_val):Undefined();;
        EMIT(c, 2, args);
      }
      break;
    }

  done:;
    if ( matched != NULL ) {
      ldap_memfree( matched );
    }

    if ( msg != NULL ) {
      ldap_memfree( msg );
    }

    if ( ctrls != NULL ) {
      ldap_controls_free( ctrls );
    }

    c->refreshPhase = LDAP_SYNC_CAPI_DONE;

    return rc;
  }

  static int sync_search_intermediate( LDAPConnection * c, LDAPMessage * res, int * refreshDone ) {
    int			rc;
    char			*retoid = NULL;
    struct berval		*retdata = NULL;
    BerElement		*ber = NULL;
    ber_len_t		len;
    ber_tag_t		syncinfo_tag;
    struct berval		cookie = { 0 };
    int			refreshDeletes = 0;
    BerVarray		syncUUIDs = NULL;
    ldap_sync_refresh_t	phase;

    *refreshDone = 0;

    rc = ldap_parse_intermediate( c->ld, res, &retoid, &retdata, NULL, 0 );
    /* parsing must be successful, and yield the OID
     * of the sync info intermediate response */
    if ( rc != LDAP_SUCCESS ) {
      goto done;
    }

    rc = LDAP_OTHER;

    if ( retoid == NULL || strcmp( retoid, LDAP_SYNC_INFO ) != 0 ) {
      goto done;
    }

    /* init ber using the value in the response */
    ber = ber_init( retdata );
    if ( ber == NULL ) {
      goto done;
    }

    syncinfo_tag = ber_peek_tag( ber, &len );
    switch ( syncinfo_tag ) {
    case LDAP_TAG_SYNC_NEW_COOKIE:
      if ( ber_scanf( ber, "m", &cookie ) == LBER_ERROR ) {
        goto done;
      }
      {
        Handle<Value> args[4];
        args[0] = symbol_syncintermediate;
        args[1] = Undefined();
        args[2] = cookie.bv_len?String::New(cookie.bv_val):Undefined();
        args[3] = Integer::New(c->refreshPhase);
        EMIT(c, 4, args);

        args[0] = symbol_syncnewcookie;
        args[1] = cookie.bv_len?String::New(cookie.bv_val):Undefined();;
        EMIT(c, 2, args);
      }
      break;

    case LDAP_TAG_SYNC_REFRESH_DELETE:
    case LDAP_TAG_SYNC_REFRESH_PRESENT:
      if ( syncinfo_tag == LDAP_TAG_SYNC_REFRESH_DELETE ) {
        switch ( c->refreshPhase ) {
        case LDAP_SYNC_CAPI_NONE:
        case LDAP_SYNC_CAPI_PRESENTS:
          c->refreshPhase = LDAP_SYNC_CAPI_DELETES;
          break;

        default:
          /* TODO: impossible; handle */
          goto done;
        }

      } else {
        switch ( c->refreshPhase ) {
        case LDAP_SYNC_CAPI_NONE:
          c->refreshPhase = LDAP_SYNC_CAPI_PRESENTS;
          break;

        default:
          /* TODO: impossible; handle */
          goto done;
        }
      }

      if ( ber_scanf( ber, "{" /*"}"*/ ) == LBER_ERROR ) {
        goto done;
      }
      if ( ber_peek_tag( ber, &len ) == LDAP_TAG_SYNC_COOKIE ) {
        if ( ber_scanf( ber, "m", &cookie ) == LBER_ERROR ) {
          goto done;
        }
      }

      *refreshDone = 1;
      if ( ber_peek_tag( ber, &len ) == LDAP_TAG_REFRESHDONE ) {
        if ( ber_scanf( ber, "b", refreshDone ) == LBER_ERROR ) {
          goto done;
        }
      }

      if ( ber_scanf( ber, /*"{"*/ "}" ) == LBER_ERROR ) {
        goto done;
      }

      if ( *refreshDone ) {
        c->refreshPhase = LDAP_SYNC_CAPI_DONE;
      }

      {
        fprintf(stderr, "Intermediate 2\n");

        Handle<Value> args[4];
        args[0] = symbol_syncintermediate;
        args[1] = c->parseReply(c, res);
        args[2] = cookie.bv_len?String::New(cookie.bv_val):Undefined();
        args[3] = Integer::New(c->refreshPhase);
        EMIT(c, 4, args);

        args[0] = symbol_syncnewcookie;
        args[1] = cookie.bv_len?String::New(cookie.bv_val):Undefined();;
        EMIT(c, 2, args);
      }
      break;

    case LDAP_TAG_SYNC_ID_SET:
      if ( ber_scanf( ber, "{" /*"}"*/ ) == LBER_ERROR ) {
        goto done;
      }
      if ( ber_peek_tag( ber, &len ) == LDAP_TAG_SYNC_COOKIE ) {
        if ( ber_scanf( ber, "m", &cookie ) == LBER_ERROR ) {
          goto done;
        }
      }

      if ( ber_peek_tag( ber, &len ) == LDAP_TAG_REFRESHDELETES ) {
        if ( ber_scanf( ber, "b", &refreshDeletes ) == LBER_ERROR ) {
          goto done;
        }
      }

      if ( ber_scanf( ber, /*"{"*/ "[W]}", &syncUUIDs ) == LBER_ERROR || syncUUIDs == NULL ) {
          goto done;
      }

      if ( refreshDeletes ) {
        phase = LDAP_SYNC_CAPI_DELETES_IDSET;
      } else {
        phase = LDAP_SYNC_CAPI_PRESENTS_IDSET;
      }

      {
        Handle<Value> args[5];
        args[0] = symbol_syncidset;
        args[1] = c->parseReply(c, res);
        args[2] = cookie.bv_val?String::New(cookie.bv_val):Undefined();
        args[3] = c->uuid2array(syncUUIDs);

        fprintf(stderr, "Phase: %u %s\n", phase, (phase == LDAP_SYNC_CAPI_PRESENTS_IDSET?"LDAP_SYNC_CAPI_PRESENTS_IDSET":"LDAP_SYNC_CAPI_DELETES_IDSET"));

        args[4] = Integer::New(phase);
        EMIT(c, 5, args);

        args[0] = symbol_syncnewcookie;
        args[1] = cookie.bv_len?String::New(cookie.bv_val):Undefined();;
        EMIT(c, 2, args);
      }

      ber_bvarray_free( syncUUIDs );
      break;

    default:
      goto done;

    } // switch( syncinfo_tag)

    rc = LDAP_SUCCESS;

  done:;
    if ( ber != NULL ) {
      ber_free( ber, 1 );
    }

    if ( retoid != NULL ) {
      ldap_memfree( retoid );
    }

    if ( retdata != NULL ) {
      ber_bvfree( retdata );
    }

    return rc;
  }





};

extern "C" void init(Handle<Object> target) {
  LDAPConnection::Initialize(target);
}
