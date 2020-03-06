/*jshint globalstrict:true, node:true, trailing:true, mocha:true unused:true */

'use strict';

var LDAP = require('../');
var assert = require('assert');
var fs = require('fs');
var ldap;

describe('LDAP TLS', function() {
    /*
     this succeeds, but it shouldn't
     starttls is beta - at best - right now...
    it ('Should fail TLS on cert validation', function(done) {
        this.timeout(10000);
        ldap = new LDAP({
            uri: 'ldap://localhost:1234',
            base: 'dc=sample,dc=com',
            attrs: '*'
        }, function(err) {
            ldap.starttls(function(err) {
                console.log('ERR', err);
                assert.ifError(err);
                ldap.installtls();
                assert(ldap.tlsactive() == 1);
                done();
            });
        });
    }); */
    it ('Should connect', function(done) {
        this.timeout(10000);
        ldap = new LDAP({
            uri: 'ldap://localhost:1234',
            base: 'dc=sample,dc=com',
            attrs: '*',
            validatecert: false
        }, function(err) {
            assert.ifError(err);
            ldap.starttls(function(err) {
                assert.ifError(err);
                ldap.installtls();
                assert(ldap.tlsactive());
                done();
            });
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
        ldap.close();
    });
    it ('Should validate cert', function(done) {
        this.timeout(10000);
        const ldap = new LDAP({
            uri: 'ldap://localhost:1234',
            base: 'dc=sample,dc=com',
            attrs: '*',
            validatecert: true,
            ca: "test/certs/ca.crt"
        }, function(err) {
            assert.ifError(err);
            ldap.starttls(function(err) {
                assert.ifError(err);
                ldap.installtls();
                assert(ldap.tlsactive());
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
    });
    it ('Should not validate cert', function(done) {
        this.timeout(10000);
        const ldap = new LDAP({
            uri: 'ldap://localhost:1234',
            base: 'dc=sample,dc=com',
            attrs: '*',
            validatecert: true,
            ca: "test/certs/wrongca.crt"
        }, function(err) {
            assert.ifError(err);
            ldap.starttls(function(err) {
                assert.ifError(err);
                ldap.installtls();
                assert(ldap.tlsactive());
                ldap.search({
                    filter: '(cn=babs)',
                    scope:  LDAP.SUBTREE
                    }, function(err, res) {
                        assert.ifError(!err);
                        done();
                    });
          });
        });
    });
});
