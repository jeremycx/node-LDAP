/*jshint globalstrict:true, node:true, trailing:true, mocha:true unused:true */

'use strict';

var LDAP = require('../');
var assert = require('assert');
var fs = require('fs');
var ldap;

describe('Issues', function() {
    it('Should fix Issue #80', function(done) {
        var ldapConfig = {
            schema: 'ldaps://',
            host: 'localhost:1235',
            binddn: 'cn=Babs,dc=sample,dc=com',
            password: 'secret'
        };
        var bind_options = {
            binddn: ldapConfig.binddn,
            password: ldapConfig.password
        };

        var uri = ldapConfig.schema + ldapConfig.host;
        console.log(uri);
        ldap = new LDAP({
            uri: uri,
            validatecert: LDAP.LDAP_OPT_X_TLS_NEVER
        }, function(err) {
            ldap.bind(bind_options, function (err) {
                assert.ifError(err);
                ldap.close();
                done();
            });
        });
    });
});
