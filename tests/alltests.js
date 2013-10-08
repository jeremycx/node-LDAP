/*jshint globalstrict: true, node: true, trailing:true, unused:true, es5:true */

"use strict";

var LDAP = require('../LDAP');
var ldap;
var assert = require('assert');
var schema;

var tests = [
    {
        name: 'FINDREMOVED - Notfound',
        description: 'Find a recently removed record',
        fn: function() {
            ldap.search({
                base: 'dc=sample,dc=com',
                filter: '(cn=Darren)'
            }, function(err, data) {
                assert(!err, 'Finding a removed record');
                assert(data.length == 0);
                next();
            });
        }
    },
    {
        name: 'REMOVE',
        description: 'Remove a record',
        fn: function() {
            ldap.remove('cn=Darren,ou=accounting,dc=sample,dc=com', function(err, data) {
                assert(!err, 'Remove failed');
                next();
             });
        }
    },
    {
        name: 'RECONNECT_SYNCREPL',
        description: 'Disconnect while syncrepl running',
        fn: function() {
            ldap.sync({
                base: 'dc=com',
                scope: ldap.SUBTREE,
                filter: '(objectClass=*)',
                attrs: '*',
                rid: '234',
                cookie: '',
                syncentry: function(data) {
                    console.log('------');
                    console.log(data);
                },
                newcookie: function(cookie) {
                    console.log('newcookie' + cookie);
                }
            });
            console.log('Sync configured.');
            setTimeout(function() {
                console.log('Proceeding');
                next();
            }, 20000);
        }
    },
    {
        name: 'SCHEMA',
        description: 'Schema Load',
        fn: function() {
            assert(schema, 'Schema not loaded');
            assert(schema.getObjectClass('person'), 'Objectclass "person" not present');
            assert(schema.getObjectClass('person').name[0] == 'person', 'Objectclass name not quite right (should be "person"): '+
                   schema.getObjectClass('person').name[0]);
            assert(typeof schema.getObjectClass('person').must == 'object', 'Objectclass "must" property not quite right (should be "object"): '+
                   typeof schema.getObjectClass('person').must);
            assert(schema.getObjectClass('person').newprop, 'Could not attach custom property to OC');
            ldap.search({
                base: 'cn=Babs,dc=sample,dc=com',
                attrs: '*',
                scope: ldap.BASE
            }, function(err, data) {
                assert(schema.getAttributesForRec(data[0]), 'Error getting attribute details for record');
                next();
            });
        }
    },
    {
        name: 'BINARY',
        description: 'Paged Search',
        fn: function() {
            ldap.search({
                base: 'cn=Babs,dc=sample,dc=com',
                attrs: 'jpegPhoto cn sn',
                scope: ldap.BASE
            }, function(err, data) {
                assert(!err, err);
                assert(Buffer.isBuffer(data[0].jpegPhoto[0]), 'Binary result is not a buffer');
                next();
            });
        }
    },
    {
        name: 'PAGEDSEARCH',
        description: 'Paged Search',
        fn: function() {
            ldap.search({
                base: 'dc=sample,dc=com',
                filter: '(objectClass=*)',
                attrs: 'dn',
                pagesize: 3
            }, function(err, data, cookie) {
                assert(!err, err);
                assert(cookie, 'No cookie returned');
                assert(data.length == 3, 'Result larger than page size: ' + data.length);
                var firstentry = data[0];
                ldap.search({
                    base: 'dc=sample,dc=com',
                    filter: '(objectClass=*)',
                    attrs: 'dn',
                    pagesize: 3,
                    cookie: cookie
                }, function(err, data, cookie) {
                    assert(!err, err);
                    assert(cookie);
                    assert(data.length == 3, 'Result larger than ' + data.length);
                    assert(data[0].dn != firstentry.dn, 'Same results on each page');
                    ldap.search({
                        base: 'dc=sample,dc=com',
                        filter: '(objectClass=*)',
                        attrs: 'dn',
                        pagesize: 3,
                        cookie: cookie
                    }, function(err, data, cookie) {
                        assert(!err, err);
                        assert(!cookie); // no cookie, out of results.
                        next();
                    });
                });
            });
        }
    },
    {
        name: 'PAGEDSEARCH - Badcookie',
        description: 'Paged Search with invalid cookie',
        fn: function() {
            ldap.search({
                base: 'dc=sample,dc=com',
                filter: '(objectClass=*)',
                pagesize: 2,
                cookie: ''
            }, function(err, data) {
                assert(err, 'Should have failed');
                next();
            });
        }
    },
    {
        name: 'MODIFY - DELETE SINGLE',
        description: 'DELETE single attributes',
        fn: function() {
            ldap.modify('cn=Oooooh Alberto,ou=Accounting,dc=sample,dc=com',
                        [
                            { op: 'delete',
                              attr: 'title',
                              vals: [ ]
                            }
                        ], function(err, data) {
                            assert(!err, err);
                            ldap.search({base: 'cn=Oooooh Alberto,ou=Accounting,dc=sample,dc=com',
                                         attrs: '*'
                                        }, function(err, data) {
                                            assert(!err);
                                            assert(data[0]);
                                            assert(!data[0].title);
                                            next();
                                        });
                        });
        }
    },
    {
        name: 'MODIFY - DELETE',
        description: 'DELETE attributes',
        fn: function() {
            ldap.modify('cn=Oooooh Alberto,ou=Accounting,dc=sample,dc=com',
                        [
                            { op: 'delete',
                              attr: 'telephoneNumber',
                              vals: [ ]
                            }
                        ], function(err, data) {
                            assert(!err, err);
                            ldap.search({base: 'cn=Oooooh Alberto,ou=Accounting,dc=sample,dc=com',
                                         attrs: '*'
                                        }, function(err, data) {
                                            assert(!err);
                                            assert(data[0]);
                                            assert(!data[0].telephoneNumber);
                                            next();
                                        });
                        });
        }
    },
    {
        name: 'MODIFY - ADD',
        description: 'Add attributes',
        fn: function() {
            ldap.modify('cn=Oooooh Alberto,ou=Accounting,dc=sample,dc=com',
                        [
                            { op: 'replace',
                              attr: 'telephoneNumber',
                              vals: [ '18005551212', '19005552222' ]
                            }
                        ], function(err, data) {
                            ldap.search({base: 'cn=Oooooh Alberto,ou=Accounting,dc=sample,dc=com',
                                         attrs: 'telephoneNumber'
                                        }, function(err, data) {
                                            assert(!err, 'Error in readback');
                                            assert(data[0], 'No data returned');
                                            assert(data.length == 1, 'Too many results returned, expected 1, got ' + data.length);
                                            assert(data[0].telephoneNumber[0] == '18005551212', 'Data readback incorrent');
                                            assert(data[0].telephoneNumber[1] == '19005552222', 'Data readback incorrect');
                                            next();
                                        });
                        });
        }
    },
    {
        name: 'MODIFY',
        description: 'Modify a record',
        fn: function() {
            ldap.modify('cn=Oooooh Alberto,ou=Accounting,dc=sample,dc=com',
                        [
                            { op: 'add',
                              attr: 'title',
                              vals: [ 'King of Callbacks' ]
                            }
                        ], function(err, data) {
                            assert(!err, err);
                            next();
                        });
        }
    },
    {
        name: 'MODIFY - Badattr',
        description: 'Modify a record',
        fn: function() {
            ldap.modify('cn=Oooooh Alberto,ou=Accounting,dc=sample,dc=com',
                        [
                            { op: 'add',
                              attr: 'nosuchattr',
                              vals: [ 'King of Callbacks' ]
                            }
                        ], function(err, data) {
                            assert(err, 'Should have failed');
                            next();
                        });
        }
    },
    {
        name: 'MODIFY - Notfound',
        description: 'Modify a record',
        fn: function() {
            ldap.modify('cn=Oooooh Alberto,ou=Beancounters,dc=sample,dc=com',
                        [
                            { op: 'add',
                              attr: 'title',
                              vals: [ 'King of Callbacks' ]
                            }
                        ], function(err, data) {
                            assert(err, 'Should have failed');
                            next();
                        });
        }
    },
    {
        name: 'SEARCH',
        description: 'Search for modified DN',
        fn: function() {
            ldap.search({
                base: 'dc=sample,dc=com',
                filter: '(cn=Oooo*)',
                attrs: '+',
            }, function(err, data) {
                assert(!err);
                assert(data.length == 1);
                next();
            });
        }
    },
    {
        name: 'RENAME',
        description: 'Rename',
        fn: function() {
            ldap.rename('cn=Albert,ou=Accounting,dc=sample,dc=com',
                        'cn=Oooooh Alberto',
                        function(err) {
                            assert(!err, 'Rename: ' + err);
                            next();
                        });
        }
    },
    {
        name: 'RENAME (Bad DN)',
        description: 'Rename',
        fn: function() {
            ldap.rename('cn=Albert,ou=acocunting,dc=sample,dc=com',
                        'cn=Albert,dc=sample,dc=com',
                        function(err) {
                            assert(err);
                            next();
                        });
        }
    },
    {
        name: 'SEARCH',
        description: 'Search after reopen',
        fn: function() {
            ldap.search({
                base: 'dc=sample,dc=com',
                filter: '(|(cn=Darren)(cn=Babs))'
            }, function(err, data) {
                assert(!err);
                assert(data.length == 2);
                next();
            });
        }
    },
    {
        name: 'CLOSE.REOPEN',
        description: 'Close the connection and reopen',
        fn: function() {
            ldap.close();
            ldap.open(function(err) {
                assert(!err);
                next();
            });
        }
    },
    {
        name: 'FINDNEW',
        description: 'Find a recently added record',
        fn: function() {
            ldap.search({
                base: 'dc=sample,dc=com',
                filter: '(cn=Darren)'
            }, function(err, data) {
                assert(!err, 'Finding a recent record');
                assert(data[0].cn[0] == 'Darren', 'Record corrupt');
                next();
            });
        }
    },
    {
        name: 'ADD',
        description: 'Add a record',
        fn: function() {
            ldap.add('cn=Darren,ou=accounting,dc=sample,dc=com',
                     [
                         { attr: 'objectClass',  vals: ['organizationalPerson', 'person', 'top' ] },
                         { attr: 'cn',           vals: [ 'Darren' ] },
                         { attr: 'sn',           vals: [ 'Smith' ] },
                         { attr: 'userPassword', vals: [ 'secret' ] }
                     ], function(err, data) {
                         assert(!err, 'Add failed');
                         next();
                     });
        }
    },
    {
        name: 'ADD - Invalid Syntax',
        description: 'Add a record, fail on schema',
        fn: function() {
            ldap.add('cn=Darren,ou=accounting,dc=sample,dc=com',
                     [
                         { attr: 'objectClass',  vals: [ 'notanobjectclass', 'organizationalPerson', 'person', 'top' ] },
                         { attr: 'sn',           vals: [ 'Smith' ] },
                         { attr: 'userPassword', vals: [ 'secret' ] }
                     ], function(err, data) {
                         assert(err, 'Add should have failed');
                         next();
                     });
        }
    },
    {
        name: 'ADD - Undefined Attribute',
        description: 'Add a record, fail on schema',
        fn: function() {
            ldap.add('cn=Darren,ou=accounting,dc=sample,dc=com',
                     [
                         { attr: 'objectClass',  vals: [ 'organizationalPerson', 'person', 'top' ] },
                         { attr: 'sn',           vals: [ 'Smith' ] },
                         { attr: 'badattr',      vals: [ 'Fried' ] },
                         { attr: 'userPassword', vals: [ 'secret' ] }
                     ], function(err, data) {
                         assert(err, 'Add should have failed');
                         next();
                     });
        }
    },
    {
        name: 'FINDANDBIND - Manager',
        description: 'Back to Manager',
        fn: function() {
            ldap.findandbind({
                base: 'dc=sample,dc=com',
                filter: '(cn=Manager)',
                password: 'secret'
            }, function(err, data) {
                assert(!err, 'Bind error');
                next();
            });
        }
    },
    {
        name: 'FINDANDBIND - Albert',
        description: 'Should find Albert and succeed',
        fn: function() {
            ldap.findandbind({
                base: 'dc=sample,dc=com',
                filter: '(cn=Albert)',
                password: 'secret'
            }, function(err, data) {
                assert(!err, 'Bind error');
                assert(data.cn == 'Albert', 'Bind data incorrect');
                next();
            });
        }
    },
    {
        name: 'FINDANDBIND - BadPass',
        description: 'Should fail due to bad password',
        fn: function() {
            ldap.findandbind({
                base: 'dc=sample,dc=com',
                filter: '(cn=Albert)',
                password: 'secretx'
            }, function(err, data) {
                assert(err, 'Bind succeeded when it should have failed.');
                next();
            });
        }
    },
    {
        name: 'FINDANDBIND - Toomany',
        description: 'Should fail with too many results',
        fn: function() {
            ldap.findandbind({
                base: 'dc=sample,dc=com',
                filter: '(objectclass=*)',
                password: 'secret'
            }, function(err, data) {
                assert(err, 'Bind succeeded when it should have failed.');
                next();
            });
        }
    },
    {
        name: 'SEARCH.1',
        fn: function() {
            ldap.search({
                base: 'dc=sample,dc=com',
                filter: '(objectClass=*)',
                attrs: '+ *'
            }, function(err, data) {
                assert(!err, 'Search error');
                assert(data.length == 6, 'Unexpected number of results, expected 6, got ' + data.length);
                assert(data[0].entryUUID, 'UUID not present');
                next();
            });
        }
    },
    {
        name: 'BIND',
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
        name: 'BIND (FAIL)',
        fn: function() {
            ldap.simpleBind({
                binddn: 'cn=Manager,dc=sample,dc=com',
                password: 'WRONGsecret'
            }, function(err) {
                assert(err);
                next();
            });
        }
    },
    {
        name: 'OPEN',
        fn: function() {
            ldap.open(function(err) {
                assert(!err);
                schema = new LDAP.Schema(ldap, {
                    init_attr: function(attr) {
                        // just a demo.. add the .sv property to single-
                        // valued attributes.
                        if (attr.single = 'yes') {
                            attr.sv = 1;
                        }
                        attr.friendly = 'A friendly name';
                    },
                    init_obj: function(obj) {
                        if (obj.name[0] == 'person') {
                            obj.newprop = 'A very special property';
                        }
                    },
                    ready: function() {
                        next();
                    }
                });
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
    }
]

var currenttest = {
    name: 'INIT',
    fn: next
}

function next() {
    console.log(currenttest.name +
                "                                  ".substr(0, 32 - currenttest.name.length)  +
                ' [OK]');

    currenttest = tests.pop();
    if (currenttest) {
        process.nextTick(currenttest.fn);
    } else {
        ldap.close();
    }
}

var slapd_pid = process.argv[2];

console.log('');
next();