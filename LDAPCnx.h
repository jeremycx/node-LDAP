#ifndef LDAPCNX_H
#define LDAPCNX_H

#include <nan.h>
#include <ldap.h>

class LDAPCnx : public Nan::ObjectWrap {
 public:
  static void Init(v8::Local<v8::Object> exports);
  Nan::Callback * callback;

 private:
  explicit LDAPCnx(double value = 0);
  ~LDAPCnx();

  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Initialize(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Search(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Delete(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Bind(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Add(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Modify(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Rename(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void GetErr(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Event(uv_poll_t* handle, int status, int events);
  static Nan::Persistent<v8::Function> constructor;
  LDAP * ld;
};

#endif
