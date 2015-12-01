/*jshint globalstrict:true, node:true, trailing:true, mocha:true unused:true */

'use strict';

var LDAP = require('../');
var assert = require('assert');
var fs = require('fs');
var ldap;

describe('LDAP TLS', function() {
    it ('Should fail TLS on cert validation', function(done) {
        this.timeout(10000);
        ldap = new LDAP({
            uri: 'ldaps://localhost:1235',
            base: 'dc=sample,dc=com',
            attrs: '*',
        }, function(err) {
            assert.ifError(!err);
            done();
        });
    });
    it ('Should connect', function(done) {
        this.timeout(10000);
        ldap = new LDAP({
            uri: 'ldaps://localhost:1235',
            base: 'dc=sample,dc=com',
            attrs: '*',
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
    it ('Should findandbind()', function(done) {
        ldap.findandbind({
            base:     'dc=sample,dc=com',
            filter:   '(cn=Charlie)',
            attrs:    '*',
            password: 'foobarbaz'
        }, function(err, data) {
            assert.ifError(err);
            done();
        });
    });
    it ('Should fail findandbind()', function(done) {
        ldap.findandbind({
            base:     'dc=sample,dc=com',
            filter:   '(cn=Charlie)',
            attrs:    'cn',
            password: 'foobarbax'
        }, function(err, data) {
            assert.ifError(!err);
            done();
        });
    });    
    it ('Should still have TLS', function() {
        assert(ldap.tlsactive());
    });
});
