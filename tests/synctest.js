/*jshint globalstrict: true, node: true, trailing:true, unused:true, es5:true */

"use strict";

var LDAP = require('../LDAP');
var ldap;
var assert = require('assert');
var schema;
var spawn = require('child_process').spawn;
var slapd;

var tests = [
    {
        name: 'SEARCH AFTER RECONN2',
        description: 'Searching after a reconnect',
        fn: function() {
            setTimeout(process.exit, 60000);
        }
    },
    {
        name: 'COOKIECHECK',
        description: 'Pull cookie from binding',
        fn: function() {
            assert(ldap.getcookie(), 'No sync cookie found');
            assert(ldap.getcookie().indexOf('rid=') > -1, 'Cookie looks wonky');
            next();
        }
    },
    {
        name: 'SEARCH AFTER RECONN',
        description: 'Searching after a reconnect',
        fn: function() {
            ldap.search({
                base: 'cn=Jason,ou=Accounting,dc=sample,dc=com',
                attrs: 'cn sn',
                scope: ldap.BASE
            }, function(err, data) {
                assert(!err, err);
                assert(data && data[0] && data[0].cn && data[0].cn[0] == 'Jason', 'Search fail');
                next();
            });
        }
    },
    {
        name: 'SYNCREPL UPDATE',
        description: 'Get update after server bounce',
        fn: function() {
            ldap.add('cn=Jason,ou=Accounting,dc=sample,dc=com',
                     [
                         { attr: 'objectClass',  vals: [ 'organizationalPerson', 'person', 'top' ] },
                         { attr: 'sn',           vals: [ 'Jones' ] },
                         { attr: 'cn',           vals: [ 'Jason' ] },
                         { attr: 'userPassword', vals: [ 'foobarbaz' ] }
                     ], function(err) {
                         if (err) {
                             assert(!err, err.toString());
                         }
                         next();
                     });
        }
    },
    {
        name: 'SYNCREPL DISCONNECT',
        description: 'Disconnect while syncrepl running',
        fn: function() {
            restartserver();
            setTimeout(next, 5000); // lots of time to reconnect...
        }
    },
    {
        name: 'SYNCREPL',
        description: 'Syncrepl',
        fn: function() {
            ldap.sync({
                base: 'dc=sample,dc=com',
                scope: ldap.SUBTREE,
                filter: '(objectClass=*)',
                attrs: '*',
                rid: '767',
                syncentry: function(data) {
                    console.log('--------------------------');
                    console.log(data);
                    console.log('--------------------------');
                    if (data[0] && data[0].cn && data[0].cn[0] == 'Hank') {
                        console.log('Next for Hank');
                        next();
                    }
                    if (data[0] && data[0].cn && data[0].cn[0] == 'Ian') {
                        // this one will get SYNCREPL RESTART to continue.
                        printOK('External ADD');
                    }
                },
                syncresult: function(data) {
                    console.log('Syncresult: ' + data);

                },
                syncintermediate: function(cookie, phase) {
                    console.log('Cookie: ' + cookie);
                    console.log('Phase: ' + phase);
                }
            });
        }
    },
    {
        name: 'SYNCREPL BIND',
        description: 'Bind in prep for ADD',
        fn: function() {
            ldap.simpleBind({
                binddn: 'cn=Manager,dc=sample,dc=com',
                password: 'secret'
            }, function(err) {
                assert(!err);
                next();
            });
        }
    },
    {
        name: 'SEARCH BEFORE RECONN',
        description: 'Searching before a reconnect',
        fn: function() {
            ldap.search({
                base: 'cn=Hank,ou=Accounting,dc=sample,dc=com',
                attrs: 'cn sn',
                scope: ldap.BASE
            }, function(err, data) {
                assert(!err, err);
                assert(data && data[0] && data[0].cn && data[0].cn[0] == 'Hank', 'Search fail');
                next();
            });
        }
    },
    {
        name: 'OPEN',
        fn: function() {
            ldap.open(function(err) {
                if (err) {
                    assert(!err, err.toString());
                }
                next();
            });
            ldap.on('disconnect', function() {
                console.log('Got disconnect event');
            })
                .on('connect', function() {
                    console.log('Got connected event');
                });

        }
    },
    {
        name: 'INST',
        fn: function() {
            try {
                ldap = new LDAP({ uri: 'ldap://localhost:1234', version: 3 });
            } catch (e) {
                assert(false, 'Error in instantiation: ' + e.toString());
            }
            next();
        }
    },
    {
        name: 'INST - FAIL',
        fn: function() {
            try {
                ldap = new LDAP();
            } catch (e) {
                next(); // should fail
                return;
            }
            assert(false, 'Instantiate hould have failed');
        }
    },
    {
        name: 'KILL SERVER',
        fn: function() {
            try {
                restartserver();
            } catch (e) {
                assert(false, 'Error in spawn of slapd');
            }
            setTimeout(next, 1000);
        }
    },
    {
        name: 'LAUNCH SERVER',
        fn: function() {
            try {
                launchserver();
            } catch (e) {
                assert(false, 'Error in spawn of slapd');
            }
            setTimeout(next, 1000);
        }
    }
];

var currenttest = {
    name: 'INIT',
    fn: next
}

function launchserver() {
    slapd = spawn('/usr/local/libexec/slapd', ['-d0', '-f', './slapd.conf', '-hldap://localhost:1234']);
}

function restartserver() {
    var oldpid = slapd.pid;

    slapd.kill('SIGKILL');
    launchserver();
    assert(oldpid !== slapd.pid, 'Server did not restart');
}

function printOK(name) {
    console.log(name +
                "                                  ".substr(0, 32 - name.length)  +
                ' [OK]');
}

function next() {
    printOK(currenttest.name);
    currenttest = tests.pop();
    if (currenttest) {
        process.nextTick(currenttest.fn);
    } else {
        ldap.close();
    }
}

console.log('');
next();