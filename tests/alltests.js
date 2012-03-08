var LDAP = require('../LDAP');
var ldap = new LDAP({ uri: 'ldap://localhost:1234', version: 3 });
var assert = require('assert');

var tests = [
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
                filter: '(cn=Oooo*)'
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
        success: false,
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
        success: true,
        fn: function() {
            ldap.open(function(err) {
                assert(!err);
                next();
            });
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

console.log('');
next();