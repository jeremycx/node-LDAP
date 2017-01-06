#include <sasl/sasl.h>
#include "SASLDefaults.h"

void SASLDefaults::Set(unsigned flags, sasl_interact_t *interact) {
  const char *dflt = interact->defresult;

  switch (interact->id) {
  case SASL_CB_AUTHNAME:
    dflt = *user;
    break;
  case SASL_CB_PASS:
    dflt = *password;
    break;
  case SASL_CB_GETREALM:
    dflt = *realm;
    break;
  case SASL_CB_USER:
    dflt = *proxy_user;
    break;
  }

  interact->result = (dflt && *dflt) ? dflt : "";
  interact->len = strlen((const char*)interact->result);
}

int SASLDefaults::Callback(LDAP *ld, unsigned flags, void *defaults, void *in) {
  SASLDefaults* self = (SASLDefaults*)defaults;
  sasl_interact_t *interact = (sasl_interact_t*)in;
  while(interact->id != SASL_CB_LIST_END) {
    self->Set(flags, interact);
    ++interact;
  }

  return LDAP_SUCCESS;
}

