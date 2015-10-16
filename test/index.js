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
            ldap.initialize('ldapi:///tmp/foo');
        });
    });
    it ('Should initialize OK', function() {
        ldap.initialize('ldap://localhost:1234');
    });
    it ('Should search', function(done) {
        ldap.search('dc=sample,dc=com', '(cn=albert)', '*', function(err, msgid, res) {
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
        ldap.search('dc=sample,dc=com', '(cn=albert)', 'sn', function(err, msgid, res) {
            assert.equal(res[0].sn[0], 'Root');
            assert.equal(res[0].cn, undefined);
            done();
        });
    });
    it ('Should handle a null result', function(done) {
        ldap.search('dc=sample,dc=com', '(cn=wontfindthis)', '*', function(err, msgid, res) {
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
        ldap.bind('cn=Manager,dc=sample,dc=com', 'xsecret', function(err, msgid) {
            assert.notEqual(err, undefined);
            done();
        });
    });
    it ('Should bind', function(done) {
        ldap.bind('cn=Manager,dc=sample,dc=com', 'secret', function(err, msgid) {
            assert.equal(err, undefined);
            done();
        });
    });
    it ('Should delete', function(done) {
        ldap.delete('cn=Albert,ou=Accounting,dc=sample,dc=com', function(err, msgid) {
            assert.equal(err, undefined);
            ldap.search('dc=sample,dc=com', '(cn=albert)', '*', function(err, msgid, res) {
                assert(res.length == 0);
                done();
            });
        });
    });
    it ('Should Add', function(done) {
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
    it ('Should Fail to Add', function(done) {
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
    
});
