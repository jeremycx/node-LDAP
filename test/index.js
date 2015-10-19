var LDAP = require('../');
var assert = require('assert');
var spawn = require('child_process').spawn;
var child;
var ldap;

describe('LDAP', function() {
    it('Should instantiate', function() {
        ldap = new LDAP();
    });
    it('Should not initialize', function() {
        assert.throws(function(){
            ldap.initialize({uri: 'ldapi:///tmp/foo'});
        });
    });
    it ('Should initialize OK', function() {
        ldap.initialize({uri: 'ldap://localhost:1234'});
    });
    it ('Should search', function(done) {
        ldap.search({
            base:   'dc=sample,dc=com',
            filter: '(cn=albert)',
            attrs:  '*',
            scope:  LDAP.SUBTREE
        }, function(err, msgid, res) {
            assert.equal(err, undefined);
            assert.equal(res.length, 1);
            assert.equal(res[0].sn[0], 'Root');
            assert.equal(res[0].dn, 'cn=Albert,ou=Accounting,dc=sample,dc=com');
            done();
        });
    });
    /*    it ('Should timeout', function(done) {
        ldap.timeout=1; // 1ms should do it
        ldap.search('dc=sample,dc=com', '(cn=albert)', '*', function(err, msgid, res) {
            // assert(err !== undefined);
            ldap.timeout=1000;
            done();
        });
    }); */
    it ('Should return specified attrs', function(done) {
        ldap.search({
            base: 'dc=sample,dc=com',
            filter: '(cn=albert)',
            attrs: 'sn'
        }, function(err, msgid, res) {
            assert.equal(res[0].sn[0], 'Root');
            assert.equal(res[0].cn, undefined);
            done();
        });
    });
    it ('Should handle a null result', function(done) {
        ldap.search({
            base:   'dc=sample,dc=com',
            filter: '(cn=wontfindthis)',
            attrs:  '*'
        }, function(err, msgid, res) {
            assert.equal(res.length, 0);
            done();
        });
    });
    it ('Should not delete', function(done) {
        ldap.delete('cn=Albert,ou=Accounting,dc=sample,dc=com', function(err, msgid) {
            assert.notEqual(err, undefined);
            done();
        });
    });
    it ('Should not bind', function(done) {
        ldap.bind({binddn: 'cn=Manager,dc=sample,dc=com', password: 'xsecret'}, function(err, msgid) {
            assert.notEqual(err, undefined);
            done();
        });
    });
    it ('Should bind', function(done) {
        ldap.bind({binddn: 'cn=Manager,dc=sample,dc=com', password: 'secret'}, function(err, msgid) {
            assert.equal(err, undefined);
            done();
        });
    });
    it ('Should delete', function(done) {
        ldap.delete('cn=Albert,ou=Accounting,dc=sample,dc=com', function(err, msgid) {
            assert.equal(err, undefined);
            ldap.search(
                {
                    base:   'dc=sample,dc=com',
                    filter: '(cn=albert)',
                    attrs:  '*'
                }, function(err, msgid, res) {
                assert(res.length == 0);
                done();
            });
        });
    });
    it ('Should add', function(done) {
        ldap.add('cn=Albert,ou=Accounting,dc=sample,dc=com', [
            {
                attr: 'cn',
                vals: [ 'Albert' ]
            },
            {
                attr: 'objectClass',
                vals: [ 'organizationalPerson', 'person' ]
            },
            {
                attr: 'sn',
                vals: [ 'Root' ]
            },
            {
                attr: 'userPassword',
                vals: [ 'e1NIQX01ZW42RzZNZXpScm9UM1hLcWtkUE9tWS9CZlE9' ]
            }
        ], function(err, msgid, res) {
            assert.equal(err, undefined);
            done();
        });

    });
    it ('Should fail to add', function(done) {
        ldap.add('cn=Albert,ou=Accounting,dc=sample,dc=com', [
            {
                attr: 'cn',
                vals: [ 'Albert' ]
            },
            {
                attr: 'objectClass',
                vals: [ 'organizationalPerson', 'person' ]
            },
            {
                attr: 'sn',
                vals: [ 'Root' ]
            },
            {
                attr: 'userPassword',
                vals: [ 'e1NIQX01ZW42RzZNZXpScm9UM1hLcWtkUE9tWS9CZlE9' ]
            }
        ], function(err, msgid, res) {
            assert.notEqual(err, undefined);
            done();
        });
    });
    it ('Should survive a slight beating', function(done) {
        var count = 0;
        for (var x = 0 ; x < 1000 ; x++) {
            ldap.search({
                base: 'dc=sample,dc=com',
                filter: '(cn=albert)',
                attrs: '*'
            }, function(err, msgid, res) {
                count++;
                if (count >= 1000) {
                    done();
                }
            });
        }
    });
    it ('Should rename', function(done) {
        ldap.rename('cn=Albert,ou=Accounting,dc=sample,dc=com', 'cn=Alberto', function(err, msgid) {
            assert.equal(err, undefined);
            ldap.rename('cn=Alberto,ou=Accounting,dc=sample,dc=com', 'cn=Albert', function(err, msgid) {
                assert.equal(err, undefined);
                done();
            });
        });
    });
    it ('Should fail to rename', function(done) {
        ldap.rename('cn=Alberto,ou=Accounting,dc=sample,dc=com', 'cn=Albert', function(err, msgid) {
            assert.notEqual(err, undefined);
            done();
        });
    });
    it ('Should modify a record', function(done) {
        ldap.modify('cn=Albert,ou=Accounting,dc=sample,dc=com', [
            {
                op: 'add',
                attr: 'title',
                vals: [ 'King of Callbacks' ]
            }
        ], function(err, msdid) {
            ldap.search(
                {
                    base: 'dc=sample,dc=com',
                    filter: '(cn=albert)',
                    attrs: '*'
                }, function(err, msgid, res) {
                    assert.equal(res[0].title[0], 'King of Callbacks');
                    done();
                });
        });
    });
    it ('Should fail to modify a record', function(done) {
        ldap.modify('cn=Albert,ou=Accounting,dc=sample,dc=com', [
            {
                op: 'add',
                attr: 'notInSchema',
                vals: [ 'King of Callbacks' ]
            }
        ], function(err, msdid) {
            assert.notEqual(err, undefined);
            done();
        });
    });
});
