#include "LDAPCookie.h"

#include <ldap.h>

Nan::Persistent<v8::Function> LDAPCookie::constructor;

void LDAPCookie::New(const Nan::FunctionCallbackInfo<v8::Value>& info) {
  LDAPCookie* obj = new LDAPCookie();
  obj->Wrap(info.This());

  info.GetReturnValue().Set(info.This());
}

LDAPCookie::~LDAPCookie() {
  if (val_) {
    fprintf(stderr, "cookie cleanup");
    ber_bvfree(val_);
  }
}

void LDAPCookie::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;
  v8::Local<v8::Context> context = exports->CreationContext();
  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  // legal? No idea, just an attempt to prevent polluting javascript global namespace with
  // something that doesn't make sense to construct from JS side. Appears to work (doesn't
  // crash, paging works).
  // tpl->SetClassName(Nan::New("LDAPInternalCookie").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);
  constructor.Reset(tpl->GetFunction(context).ToLocalChecked());
}

v8::Local<v8::Object> LDAPCookie::NewInstance() {
  Nan::EscapableHandleScope scope;

  const unsigned argc = 1;
  v8::Local<v8::Value> argv[argc] = { Nan::Undefined() };
  v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
  v8::Local<v8::Object> instance = Nan::NewInstance(cons, argc, argv)
    .ToLocalChecked();

  return scope.Escape(instance);
}

