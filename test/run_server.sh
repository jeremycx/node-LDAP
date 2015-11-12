#!/bin/sh

SLAPD=/usr/local/libexec/slapd
SLAPADD=/usr/local/sbin/slapadd
MKDIR=/bin/mkdir
RM=/bin/rm
KILL=/bin/kill

$RM -rf openldap-data
$MKDIR openldap-data

$SLAPADD -f slapd.conf < startup.ldif
$SLAPD -d999 -f slapd.conf -h "ldap://:1234 ldapi://%2ftmp%2fslapd.sock ldaps://localhost:1235"
SLAPD_PID=$!
# slapd should be running now

