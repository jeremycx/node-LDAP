/*jshint globalstrict:true, node:true, trailing:true, mocha:true unused:true */

'use strict';

var LDAP = require('../');
var assert = require('assert');
var ldap;

var dn_esc = LDAP.escapefn('dn', '#dc=%s,dc=%s');
var filter_esc  =LDAP.escapefn('filter', '(objectClass=%s)');

describe('Escaping', function() {
    it ('Should initialize OK', function() {
        ldap = new LDAP({
            uri: 'ldap://localhost:1234',
            base: 'dc=sample,dc=com',
            attrs: '*'
        });
    });
    it('Should escape a dn', function() {
        assert.equal(dn_esc('#foo', 'bar;baz'), '#dc=#foo,dc=bar\\;baz');
    });
    it('Should escape a filter', function() {
        assert.equal(filter_esc('StarCorp*'), '(objectClass=StarCorp\\2A)');
    });
    it('Should escape Parens', function() {
        var esc = LDAP.escapefn('filter', '(cn=%s)');
        assert.equal(filter_esc('weird_but_legal_username_with_parens()'),
                    '(objectClass=weird_but_legal_username_with_parens\\28\\29)');
    });
    it('Should escape Parens', function() {
        var esc = LDAP.escapefn('filter', '(cn=%s)');
        assert.equal(filter_esc('weird_but_legal_username_with_parens()'),
                    '(objectClass=weird_but_legal_username_with_parens\\28\\29)');
    });
    it('Should escape an obvious injection', function() {
        var esc = LDAP.escapefn('filter', '(cn=%s)');
        assert.equal(esc('*)|(password=*)'), '(cn=\\2A\\29|\\28password=\\2A\\29)');
    });
});
