#include <nan.h>
#include "LDAPCnx.h"

void InitAll(v8::Local<v8::Object> exports) {
  LDAPCnx::Init(exports);
}

NODE_MODULE(LDAPCnx, InitAll)
