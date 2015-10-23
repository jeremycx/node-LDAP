/*jshint globalstrict:true, node:true, trailing:true, mocha:true unused:true */

'use strict';

var LDAP = require('../');
var assert = require('assert');
var fs = require('fs');
var ldap;

describe('LDAP TLS', function() {
    it ('Should fail TLS on cert validation', function(done) {
        this.timeout(5000);
        ldap = new LDAP({
            uri: 'ldap://localhost:1234',
            base: 'dc=sample,dc=com',
            attrs: '*',
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
        ldap = new LDAP({
            uri: 'ldap://localhost:1234',
            base: 'dc=sample,dc=com',
            attrs: '*',
            starttls: true,
            validate: false,
            timeout: 10000
        }, function(err) {
            assert(!err);
            done();
        });
    });
    it ('Should search via TLS', function(done) {
        ldap.search({
            filter: '(cn=babs)',
            scope:  LDAP.SUBTREE
        }, function(err, data) {
            assert(data);
            assert(data.length > 0);
            done();
        });
    });
});
