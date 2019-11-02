#!/bin/sh

if [[ -z $SLAPD ]] ; then
  if [ -f /usr/local/libexec/slapd ] ; then
    SLAPD=/usr/local/libexec/slapd
  else
    SLAPD=slapd
  fi
fi

if [[ -z $SLAPADD ]] ; then
  if [ -f /usr/local/sbin/slapadd ] ; then
    SLAPADD=/usr/local/sbin/slapadd
  else
    SLAPADD=slapadd
  fi
fi

if [[ -z $SLAPD_CONF ]] ; then
  if [ -d /usr/local/etc/openldap/ ]; then
    SLAPD_CONF=sasl.conf
  else
    SLAPD_CONF=sasl.linux.conf
  fi
fi

MKDIR=/bin/mkdir
RM=/bin/rm

$RM -rf openldap-data
$MKDIR openldap-data

if [[ -f slapd.pid ]] ; then
  $RM slapd.pid
fi

$SLAPADD -f $SLAPD_CONF < startup.ldif
$SLAPADD -f $SLAPD_CONF < sasl.ldif
$SLAPD -d999 -f $SLAPD_CONF -hldap://localhost:1234 > sasl.log 2>&1 &

if [[ ! -f slapd.pid ]] ; then
  sleep 1
fi

# Make sure SASL is enabled
if ldapsearch -H ldap://localhost:1234 -x -b "" -s base -LLL \
    supportedSASLMechanisms | grep -q SASL ; then
    :
else
    echo slapd started but SASL not supported
fi
