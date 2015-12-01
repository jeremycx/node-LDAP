#include "LDAPCnx.h"

static struct timeval ldap_tv = { 0, 0 };

using namespace v8;

Nan::Persistent<Function> LDAPCnx::constructor;

LDAPCnx::LDAPCnx() {
}

LDAPCnx::~LDAPCnx() {
  free(this->ldap_callback);
  delete this->callback;
  delete this->reconnect_callback;
}

void LDAPCnx::Init(Local<Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  Local<FunctionTemplate> tpl = Nan::New<FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("LDAPCnx").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  // Prototype
  Nan::SetPrototypeMethod(tpl, "search", Search);
  Nan::SetPrototypeMethod(tpl, "delete", Delete);
  Nan::SetPrototypeMethod(tpl, "bind", Bind);
  Nan::SetPrototypeMethod(tpl, "add", Add);
  Nan::SetPrototypeMethod(tpl, "modify", Modify);
  Nan::SetPrototypeMethod(tpl, "rename", Rename);
  Nan::SetPrototypeMethod(tpl, "abandon", Abandon);
  Nan::SetPrototypeMethod(tpl, "errorstring", GetErr);
  Nan::SetPrototypeMethod(tpl, "close", Close);
  Nan::SetPrototypeMethod(tpl, "errno", GetErrNo);
  Nan::SetPrototypeMethod(tpl, "fd", GetFD);
  Nan::SetPrototypeMethod(tpl, "installtls", InstallTLS);
  Nan::SetPrototypeMethod(tpl, "starttls", StartTLS);
  Nan::SetPrototypeMethod(tpl, "checktls", CheckTLS);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("LDAPCnx").ToLocalChecked(), tpl->GetFunction());
}

void LDAPCnx::New(const Nan::FunctionCallbackInfo<Value>& info) {
  if (info.IsConstructCall()) {
    // Invoked as constructor: `new LDAPCnx(...)`
    LDAPCnx* ld = new LDAPCnx();
    ld->Wrap(info.Holder());

    ld->callback = new Nan::Callback(info[0].As<Function>());
    ld->reconnect_callback = new Nan::Callback(info[1].As<Function>());
    ld->disconnect_callback = new Nan::Callback(info[2].As<Function>());
    ld->handle = NULL;

    Nan::Utf8String       url(info[3]);  
    int ver             = LDAP_VERSION3;
    int timeout         = info[4]->NumberValue();
    int debug           = info[5]->NumberValue();
    int verifycert      = info[6]->NumberValue();
    int referrals       = info[7]->NumberValue();
    int zero            = 0;

    ld->ldap_callback = (ldap_conncb *)malloc(sizeof(ldap_conncb));
    ld->ldap_callback->lc_add = OnConnect;
    ld->ldap_callback->lc_del = OnDisconnect;
    ld->ldap_callback->lc_arg = ld;

    if (ldap_initialize(&(ld->ld), *url) != LDAP_SUCCESS) {
      Nan::ThrowError("Error init");
      return;
    }

    struct timeval ntimeout = { timeout/1000, (timeout%1000) * 1000 };

    ldap_set_option(ld->ld, LDAP_OPT_PROTOCOL_VERSION,   &ver);
    ldap_set_option(NULL,   LDAP_OPT_DEBUG_LEVEL,        &debug);
    ldap_set_option(ld->ld, LDAP_OPT_CONNECT_CB,         ld->ldap_callback);
    ldap_set_option(ld->ld, LDAP_OPT_NETWORK_TIMEOUT,    &ntimeout);
    ldap_set_option(ld->ld, LDAP_OPT_X_TLS_REQUIRE_CERT, &verifycert);
    ldap_set_option(ld->ld, LDAP_OPT_X_TLS_NEWCTX,       &zero);

    ldap_set_option(ld->ld, LDAP_OPT_REFERRALS,          &referrals);
    if (referrals) {
      ldap_set_rebind_proc(ld->ld, OnRebind, ld);
    }
    
    info.GetReturnValue().Set(info.Holder());
    return;
  }
  Nan::ThrowError("Must instantiate with new");
}

void LDAPCnx::Event(uv_poll_t* handle, int status, int events) {
  Nan::HandleScope scope;
  LDAPCnx *ld = (LDAPCnx *)handle->data;
  LDAPMessage * message = NULL;
  LDAPMessage * entry = NULL;
  Local<Value> errparam;

  int msgtype;
  
  switch(ldap_result(ld->ld, LDAP_RES_ANY, LDAP_MSG_ALL, &ldap_tv, &message)) {
  case 0:
    // timeout occurred, which I don't think happens in async mode
  case -1:
      // We can't really do much; we don't have a msgid to callback to
      break;
  default:
    {
      int err = ldap_result2error(ld->ld, message, 0);
      if (err) {
        errparam = Nan::Error(ldap_err2string(err));
      } else {
        errparam = Nan::Undefined();
      }
      switch ( msgtype = ldap_msgtype( message ) ) {
      case LDAP_RES_SEARCH_REFERENCE:
        break;
      case LDAP_RES_SEARCH_ENTRY:
      case LDAP_RES_SEARCH_RESULT:
        {
          Local<Array> js_result_list = Nan::New<Array>(ldap_count_entries(ld->ld, message));

          int j;
  
          for (entry = ldap_first_entry(ld->ld, message), j = 0 ; entry ;
               entry = ldap_next_entry(ld->ld, entry), j++) {
            Local<Object> js_result = Nan::New<Object>();

            js_result_list->Set(Nan::New(j), js_result);
    
            char * dn = ldap_get_dn(ld->ld, entry);
            BerElement * berptr = NULL;
            for (char * attrname = ldap_first_attribute(ld->ld, entry, &berptr) ;
                 attrname ; attrname = ldap_next_attribute(ld->ld, entry, berptr)) {
              berval ** vals = ldap_get_values_len(ld->ld, entry, attrname);
              int num_vals = ldap_count_values_len(vals);
              Local<Array> js_attr_vals = Nan::New<Array>(num_vals);
              js_result->Set(Nan::New(attrname).ToLocalChecked(), js_attr_vals);

              // TODO: check for binary settings
              int bin = isBinary(attrname);
              
              for (int i = 0 ; i < num_vals && vals[i] ; i++) {
                if (bin) {
                  js_attr_vals->Set(Nan::New(i), Nan::CopyBuffer(vals[i]->bv_val, vals[i]->bv_len).ToLocalChecked());
                } else {
                  js_attr_vals->Set(Nan::New(i), Nan::New(vals[i]->bv_val).ToLocalChecked());
                }
              } // all values for this attr added.
              ldap_value_free_len(vals);
              ldap_memfree(attrname);
            } // attrs for this entry added. Next entry.
            js_result->Set(Nan::New("dn").ToLocalChecked(), Nan::New(dn).ToLocalChecked());
            ber_free(berptr,0);
            ldap_memfree(dn);
          } // all entries done.
  
          Local<Value> argv[] = {
            errparam,
            Nan::New(ldap_msgid(message)),
            js_result_list
          };
          ld->callback->Call(3, argv);
          break;
        }
      case LDAP_RES_BIND:
      case LDAP_RES_MODIFY:
      case LDAP_RES_MODDN:
      case LDAP_RES_ADD:
      case LDAP_RES_DELETE:
      case LDAP_RES_EXTENDED:
        {
          Local<Value> argv[] = {
            errparam,
            Nan::New(ldap_msgid(message))
          };
          ld->callback->Call(2, argv);
          break;
        }
      default:
        {
          //emit an error
          // Nan::ThrowError("Unrecognized packet");
        }
      }
    }
  }
  ldap_msgfree(message);
  return;
}

int LDAPCnx::OnConnect(LDAP *ld, Sockbuf *sb,
                      LDAPURLDesc *srv, struct sockaddr *addr,
                      struct ldap_conncb *ctx) {
  int fd;
  LDAPCnx * lc = (LDAPCnx *)ctx->lc_arg;
  
  if (lc->handle == NULL) {
    lc->handle = new uv_poll_t;
    ldap_get_option(ld, LDAP_OPT_DESC, &fd);
    uv_poll_init(uv_default_loop(), lc->handle, fd);
    lc->handle->data = lc;
  } else {
    uv_poll_stop(lc->handle);
  }
  uv_poll_start(lc->handle, UV_READABLE, (uv_poll_cb)lc->Event);

  lc->reconnect_callback->Call(0, NULL);

  return LDAP_SUCCESS;
}

void LDAPCnx::OnDisconnect(LDAP *ld, Sockbuf *sb,
                      struct ldap_conncb *ctx) {
  // this fires when the connection closes
  LDAPCnx * lc = (LDAPCnx *)ctx->lc_arg;
  if (lc->handle) {
    uv_poll_stop(lc->handle);
  }
  lc->disconnect_callback->Call(0, NULL);
}

int LDAPCnx::OnRebind(LDAP *ld, LDAP_CONST char *url, ber_tag_t request,
                       ber_int_t msgid, void *params) {
  // this is a new *ld representing the new server connection
  // so our existing code won't work!
  
  return LDAP_SUCCESS;
}

void LDAPCnx::GetErr(const Nan::FunctionCallbackInfo<Value>& info) {
  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());
  int err;
  ldap_get_option(ld->ld, LDAP_OPT_RESULT_CODE, &err);
  info.GetReturnValue().Set(Nan::New(ldap_err2string(err)).ToLocalChecked());
}

void LDAPCnx::Close(const Nan::FunctionCallbackInfo<Value>& info) {
  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());

  info.GetReturnValue().Set(ldap_unbind(ld->ld));
}

void LDAPCnx::StartTLS(const Nan::FunctionCallbackInfo<Value>& info) {
  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());
  int msgid;
  int res;
  
  res = ldap_start_tls(ld->ld, NULL, NULL, &msgid);
  
  info.GetReturnValue().Set(msgid);
}

void LDAPCnx::InstallTLS(const Nan::FunctionCallbackInfo<Value>& info) {
  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());

  info.GetReturnValue().Set(ldap_install_tls(ld->ld)); 
}

void LDAPCnx::CheckTLS(const Nan::FunctionCallbackInfo<Value>& info) {
  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());

  info.GetReturnValue().Set(ldap_tls_inplace(ld->ld));
}

void LDAPCnx::Abandon(const Nan::FunctionCallbackInfo<Value>& info) {
  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());

  info.GetReturnValue().Set(ldap_abandon(ld->ld, info[0]->NumberValue()));
}

void LDAPCnx::GetErrNo(const Nan::FunctionCallbackInfo<Value>& info) {
  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());
  int err;
  ldap_get_option(ld->ld, LDAP_OPT_RESULT_CODE, &err);
  info.GetReturnValue().Set(err);
}

void LDAPCnx::GetFD(const Nan::FunctionCallbackInfo<Value>& info) {
  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());
  int fd;
  ldap_get_option(ld->ld, LDAP_OPT_DESC, &fd);
  info.GetReturnValue().Set(fd);
}

void LDAPCnx::Delete(const Nan::FunctionCallbackInfo<Value>& info) {
  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());
  Nan::Utf8String dn(info[0]);

  info.GetReturnValue().Set(ldap_delete(ld->ld, *dn));
}

void LDAPCnx::Bind(const Nan::FunctionCallbackInfo<Value>& info) {
  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());
  Nan::Utf8String dn(info[0]);
  Nan::Utf8String pw(info[1]);

  info.GetReturnValue().Set(ldap_simple_bind(ld->ld,
                                             info[0]->IsUndefined()?NULL:*dn,
                                             info[1]->IsUndefined()?NULL:*pw));
}

void LDAPCnx::Rename(const Nan::FunctionCallbackInfo<Value>& info) {
  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());
  Nan::Utf8String dn(info[0]);
  Nan::Utf8String newrdn(info[1]);
  int res;

  ldap_rename(ld->ld, *dn, *newrdn, NULL, 1, NULL, NULL, &res);
    
  info.GetReturnValue().Set(res);
}

void LDAPCnx::Search(const Nan::FunctionCallbackInfo<Value>& info) {
  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());
  Nan::Utf8String base(info[0]);
  Nan::Utf8String filter(info[1]);
  Nan::Utf8String attrs(info[2]);
  int scope = info[3]->NumberValue();
  
  int msgid = 0;
  char * attrlist[255];

  char *bufhead = strdup(*attrs);
  char *buf = bufhead;
  char **ap;
  for (ap = attrlist; (*ap = strsep(&buf, " \t,")) != NULL;)
    if (**ap != '\0')
      if (++ap >= &attrlist[255])
        break;

  ldap_search_ext(ld->ld, *base, scope, *filter , (char **)attrlist, 0,
                         NULL, NULL, NULL, 0, &msgid);

  free(bufhead);
  
  info.GetReturnValue().Set(msgid);
}

void LDAPCnx::Modify(const Nan::FunctionCallbackInfo<Value>& info) {
  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());
  Nan::Utf8String dn(info[0]);
  
  Handle<Array> mods = Handle<Array>::Cast(info[1]);
  unsigned int nummods = mods->Length();

  LDAPMod **ldapmods = (LDAPMod **) malloc(sizeof(LDAPMod *) * (nummods + 1));

  for (unsigned int i = 0; i < nummods; i++) {
    Local<Object> modHandle =
      Local<Object>::Cast(mods->Get(Nan::New(i)));

    ldapmods[i] = (LDAPMod *) malloc(sizeof(LDAPMod));
      
    String::Utf8Value mod_op(modHandle->Get(Nan::New("op").ToLocalChecked()));

    if (!strcmp(*mod_op, "add")) {
      ldapmods[i]->mod_op = LDAP_MOD_ADD;
    } else if (!strcmp(*mod_op, "delete")) {
      ldapmods[i]->mod_op = LDAP_MOD_DELETE;
    } else {
      ldapmods[i]->mod_op = LDAP_MOD_REPLACE;
    }

    String::Utf8Value mod_type(modHandle->Get(Nan::New("attr").ToLocalChecked()));
    ldapmods[i]->mod_type = strdup(*mod_type);
    
    Local<Array> modValsHandle =
      Local<Array>::Cast(modHandle->Get(Nan::New("vals").ToLocalChecked())); 

    int modValsLength = modValsHandle->Length();
    ldapmods[i]->mod_values = (char **) malloc(sizeof(char *) *
                                               (modValsLength + 1));
    for (int j = 0; j < modValsLength; j++) {
      Nan::Utf8String modValue(modValsHandle->Get(Nan::New(j)));
      ldapmods[i]->mod_values[j] = strdup(*modValue);
    }
    ldapmods[i]->mod_values[modValsLength] = NULL;
  }
  ldapmods[nummods] = NULL;
  
  int msgid = ldap_modify(ld->ld, *dn, ldapmods);

  ldap_mods_free(ldapmods, 1);
                 
  info.GetReturnValue().Set(msgid);
}

void LDAPCnx::Add(const Nan::FunctionCallbackInfo<Value>& info) {
  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());
  Nan::Utf8String dn(info[0]);
  Handle<Array> attrs = Handle<Array>::Cast(info[1]);
  unsigned int numattrs = attrs->Length();

  LDAPMod **ldapmods = (LDAPMod **) malloc(sizeof(LDAPMod *) * (numattrs + 1));
  for (unsigned int i = 0; i < numattrs; i++) {
    Local<Object> attrHandle =
      Local<Object>::Cast(attrs->Get(Nan::New(i)));

    ldapmods[i] = (LDAPMod *) malloc(sizeof(LDAPMod));

    // Step 1: mod_op
    ldapmods[i]->mod_op = LDAP_MOD_ADD;

    // Step 2: mod_type
    String::Utf8Value mod_type(attrHandle->Get(Nan::New("attr").ToLocalChecked()));
    ldapmods[i]->mod_type = strdup(*mod_type);

    // Step 3: mod_vals
    Local<Array> attrValsHandle =
      Local<Array>::Cast(attrHandle->Get(Nan::New("vals").ToLocalChecked()));
    int attrValsLength = attrValsHandle->Length();
    ldapmods[i]->mod_values = (char **) malloc(sizeof(char *) *
                                               (attrValsLength + 1));
    for (int j = 0; j < attrValsLength; j++) {
      // TODO: handle Buffers here.
      Nan::Utf8String modValue(attrValsHandle->Get(Nan::New(j)));
      ldapmods[i]->mod_values[j] = strdup(*modValue);
    }
    ldapmods[i]->mod_values[attrValsLength] = NULL;
  }

  ldapmods[numattrs] = NULL;

  int msgid = ldap_add(ld->ld, *dn, ldapmods);
    
  info.GetReturnValue().Set(msgid);

  ldap_mods_free(ldapmods, 1);
}

// Attributes matching this list will be returned as Buffer()s

int LDAPCnx::isBinary(char * attrname) {
  if (!strcmp(attrname, "jpegPhoto") ||
      !strcmp(attrname, "photo") ||
      !strcmp(attrname, "personalSignature") ||
      !strcmp(attrname, "userCertificate") ||
      !strcmp(attrname, "cACertificate") ||
      !strcmp(attrname, "authorityRevocationList") ||
      !strcmp(attrname, "certificateRevocationList") ||
      !strcmp(attrname, "deltaRevocationList") ||
      !strcmp(attrname, "crossCertificatePair") ||
      !strcmp(attrname, "x500UniqueIdentifier") ||
      !strcmp(attrname, "audio") ||
      !strcmp(attrname, "javaSerializedObject") ||
      !strcmp(attrname, "thumbnailPhoto") ||
      !strcmp(attrname, "thumbnailLogo") ||
      !strcmp(attrname, "supportedAlgorithms") ||
      !strcmp(attrname, "protocolInformation") ||
      !strcmp(attrname, "objectGUID") ||
      !strcmp(attrname, "objectSid") ||
      strstr(attrname, ";binary")) {
    return 1;
  }
  return 0;
}
