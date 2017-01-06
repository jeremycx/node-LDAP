#!/bin/sh

if [[ -z $SLAPD ]] ; then
  SLAPD=/usr/local/libexec/slapd
fi

if [[ -z $SLAPADD ]] ; then
  SLAPADD=/usr/local/sbin/slapadd
fi

if [[ -z $SLAPD_CONF ]] ; then
  SLAPD_CONF=sasl.conf
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
