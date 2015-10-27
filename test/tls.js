/*jshint globalstrict:true, node:true, trailing:true, mocha:true unused:true */

'use strict';

var LDAP = require('../');
var assert = require('assert');
var fs = require('fs');
var ldap;

describe('LDAP TLS', function() {
    it ('Should NOT initialize OK', function(done) {
        ldap = new LDAP({
            uri: 'ldap://localhost:1234',
            base: 'dc=sample,dc=com',
            attrs: '*',
            starttls: true
        }, function(err) {
            assert.ifError(!err);
            done();
        });
    });
    it ('Should initialize OK', function(done) {
        ldap = new LDAP({
            uri: 'ldap://localhost:1234',
            base: 'dc=sample,dc=com',
            attrs: '*',
            starttls: true,
            validatecert: false
        }, function(err) {
            assert.ifError(err);
            done();
        });
    });
    it ('Should search via TLS', function(done) {
        ldap.search({
            filter: '(cn=babs)',
            scope:  LDAP.SUBTREE
        }, function(err, res) {
            assert.ifError(err);
            assert.equal(res.length, 1);
            assert.equal(res[0].sn[0], 'Jensen');
            assert.equal(res[0].dn, 'cn=Babs,dc=sample,dc=com');
            done();
        });
    });
});
