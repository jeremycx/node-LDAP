#!/bin/sh

SLAPD=/usr/local/libexec/slapd
SLAPADD=/usr/local/sbin/slapadd
MKDIR=/bin/mkdir
RM=/bin/rm
KILL=/bin/kill

killall -9 slapd

$RM -rf ./openldap-data
$MKDIR openldap-data

$SLAPADD -f slapd.conf < startup.ldif
$SLAPADD -f slapd.conf < add.ldif
# $SLAPD -d0 -f slapd.conf -hldap://localhost:1234 &

node synctest.js

# kill slapd
# $KILL -15 `cat slapd.pid`