/*jshint globalstrict:true, node:true, trailing:true, mocha:true unused:true */

'use strict';

var LDAP = require('../');
var assert = require('assert');
var fs = require('fs');
var ldap;

var ldapConfig = {
    schema: 'ldaps://',
    host: 'localhost:1235'
};
var uri = ldapConfig.schema + ldapConfig.host;


describe('Issues', function() {
    it('Should fix Issue #80', function(done) {
        ldap = new LDAP({
            uri: uri,
            validatecert: LDAP.LDAP_OPT_X_TLS_NEVER
        }, function (err) {
            assert.ifError(err);
            done();
        });
    });
    it('Should search after Issue #80', function(done) {
        ldap.search({
            base: 'dc=sample,dc=com',
            filter: '(objectClass=*)'
        }, function(err, res) {
            assert.ifError(err);
            assert.equal(res.length, 6);
            done();
        });

    });
    it('Connect context should be ldap object - Issue #84', function(done) {
        ldap = new LDAP({
            uri: uri,
            validatecert: LDAP.LDAP_OPT_X_TLS_NEVER,
            connect: function() {
                assert(typeof this.bind === 'function');
                ldap.bind({binddn: 'cn=Manager,dc=sample,dc=com', password: 'secret'}, function(err) {
                    assert.ifError(err);
                    done();
                });
	    }
        }, function (err) {
            assert.ifError(err);
        });
    });
    it('Base scope should work - Issue #81', function(done) {
        assert.equal(ldap.DEFAULT, 4, 'ldap.DEFAULT const is not zero');
        assert.equal(LDAP.DEFAULT, 4, 'LDAP.DEFAULT const is not zero');
        assert.equal(LDAP.LDAP_OPT_X_TLS_TRY, 4);
        ldap.search({
            base: 'dc=sample,dc=com',
            scope: ldap.BASE,
            filter: '(objectClass=*)'
        }, function(err, res) {

            assert.equal(res.length, 1, 'Unexpected number of results');
            ldap.search({
                base: 'dc=sample,dc=com',
                scope: LDAP.SUBTREE,
                filter: '(objectClass=*)'
            }, function(err, res) {
                assert.ifError(err);
                assert.equal(res.length, 6, 'Unexpected number of results');
                ldap.search({
                base: 'dc=sample,dc=com',
                scope: LDAP.ONELEVEL,
                filter: '(objectClass=*)'
                }, function(err, res) {
                    assert.ifError(err);
                    assert.equal(res.length, 4, 'Unexpected number of results');
                    done();
                });
            });
        });
    });
});
