#!/bin/sh

SLAPD=`test -f /usr/local/libexec/slapd && echo /usr/local/libexec/slapd || echo slapd`
SLAPADD=`test -f /usr/local/sbin/slapadd && echo /usr/local/sbin/slapadd || echo slapadd`
MKDIR=/bin/mkdir
RM=/bin/rm
KILL=/bin/kill

$RM -rf openldap-data
$MKDIR openldap-data

if [ -d /usr/local/etc/openldap/ ]; then
    $SLAPADD -f slapd.conf < startup.ldif
    $SLAPD -d999 -f slapd.conf -h "ldap://:1234 ldapi://%2ftmp%2fslapd.sock ldaps://localhost:1235"
else
    $SLAPADD -f slapd.linux.conf < startup.ldif
    $SLAPD -d999 -f slapd.linux.conf -h "ldap://:1234 ldapi://%2ftmp%2fslapd.sock ldaps://localhost:1235"
fi

SLAPD_PID=$!
# slapd should be running now
