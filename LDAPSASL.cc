#include <sasl/sasl.h>
#include "LDAPCnx.h"
#include "SASLDefaults.h"

using namespace v8;

void LDAPCnx::SASLBind(const Nan::FunctionCallbackInfo<Value>& info) {

  LDAPCnx* ld = ObjectWrap::Unwrap<LDAPCnx>(info.Holder());

  if (ld->ld == NULL) {
    Nan::ThrowError("LDAP connection has not been established");
  }

  Nan::Utf8String mechanism(SASLDefaults::Get(info[0]));
  SASLDefaults defaults(info[1], info[2], info[3], info[4]);
  Nan::Utf8String sec_props(SASLDefaults::Get(info[5]));

  if(*sec_props) {
    int res = ldap_set_option(ld->ld, LDAP_OPT_X_SASL_SECPROPS, *sec_props);
    if(res != LDAP_SUCCESS) {
      Nan::ThrowError(ldap_err2string(res));
    }
  }

  int msgid;
  LDAPControl** sctrlsp = NULL;
  LDAPMessage* message = NULL;
  ld->sasl_mechanism = NULL;

  int res = ldap_sasl_interactive_bind(ld->ld, NULL, *mechanism,
    sctrlsp, NULL, LDAP_SASL_QUIET, &SASLDefaults::Callback, &defaults, 
    message, &ld->sasl_mechanism, &msgid);
  if(res != LDAP_SASL_BIND_IN_PROGRESS && res != LDAP_SUCCESS) {
    Nan::ThrowError(ldap_err2string(res));
  }

  info.GetReturnValue().Set(msgid);
}

int LDAPCnx::SASLBindNext(LDAPMessage** message) {
  LDAPControl** sctrlsp = NULL;
  int res; 
  int msgid;
  while(true) {
    res = ldap_sasl_interactive_bind(ld, NULL, NULL,
      sctrlsp, NULL, LDAP_SASL_QUIET, NULL, NULL,
      *message, &sasl_mechanism, &msgid);

    if(res != LDAP_SASL_BIND_IN_PROGRESS) {
      break;
    }

    ldap_msgfree(*message);

    if(ldap_result(ld, msgid, LDAP_MSG_ALL, NULL, message) == -1) { 
      ldap_get_option(ld, LDAP_OPT_RESULT_CODE, &res);
      break;
    }
  }

  return res;
}

