#include "LDAPCnx.h"

void LDAPCnx::SASLBind(const Nan::FunctionCallbackInfo<v8::Value>& info) {
  Nan::ThrowError("LDAP module was not built with SASL support");
}

int LDAPCnx::SASLBindNext(LDAPMessage** result) {
  return -1;
}
