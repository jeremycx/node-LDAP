/*jshint globalstrict:true, node:true, trailing:true, mocha:true unused:true */

'use strict';

var LDAP = require('../');
var assert = require('assert');
var fs = require('fs');
var ldap;

describe('LDAP TLS', function() {
<<<<<<< HEAD
    it ('Should NOT initialize OK', function(done) {
=======
    it ('Should fail TLS on cert validation', function(done) {
        this.timeout(5000);
>>>>>>> master
        ldap = new LDAP({
            uri: 'ldap://localhost:1234',
            base: 'dc=sample,dc=com',
            attrs: '*',
<<<<<<< HEAD
            starttls: true
        }, function(err) {
            assert.ifError(!err);
            done();
        });
    });
    it ('Should initialize OK', function(done) {
=======
            starttls: true,
            validate: true,
            timeout: 10000
        }, function(err) {
            assert(err);
            ldap.close();
            done();
        });
    });
    it ('Should connect', function(done) {
        this.timeout(10000);
>>>>>>> master
        ldap = new LDAP({
            uri: 'ldap://localhost:1234',
            base: 'dc=sample,dc=com',
            attrs: '*',
            starttls: true,
<<<<<<< HEAD
            validatecert: false
        }, function(err) {
            assert.ifError(err);
=======
            validate: false,
            timeout: 10000
        }, function(err) {
            assert(!err);
>>>>>>> master
            done();
        });
    });
    it ('Should search via TLS', function(done) {
        ldap.search({
            filter: '(cn=babs)',
            scope:  LDAP.SUBTREE
<<<<<<< HEAD
        }, function(err, res) {
            assert.ifError(err);
            assert.equal(res.length, 1);
            assert.equal(res[0].sn[0], 'Jensen');
            assert.equal(res[0].dn, 'cn=Babs,dc=sample,dc=com');
=======
        }, function(err, data) {
            assert(data);
            assert(data.length > 0);
>>>>>>> master
            done();
        });
    });
});
