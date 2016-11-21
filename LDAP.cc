#include <nan.h>
#include "LDAPCnx.h"
#include "LDAPCookie.h"

void InitAll(v8::Local<v8::Object> exports) {
  LDAPCnx::Init(exports);
  LDAPCookie::Init(exports);
}

NODE_MODULE(LDAPCnx, InitAll)
