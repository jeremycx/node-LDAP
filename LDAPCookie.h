#ifndef LDAPCOOKIE_H
#define LDAPCOOKIE_H

#include <nan.h>

class LDAPCookie : public Nan::ObjectWrap {
  public:
    static void Init(v8::Local<v8::Object> exports);
    static v8::Local<v8::Object> NewInstance();

    void SetCookie(struct berval* cookie) { val_ = cookie; }
    struct berval* GetCookie() const { return val_; }

  private:
    static Nan::Persistent<v8::Function> constructor;

    LDAPCookie() {};
    ~LDAPCookie();

    static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);

    struct berval* val_;
};

#endif
