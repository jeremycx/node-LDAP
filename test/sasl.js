/*jshint globalstrict:true, node:true, trailing:true, mocha:true unused:true */

'use strict';

var LDAP = require('../');

var assert = require('assert');

var ldap;

// Does not need to support GSSAPI
var uri = process.env.TEST_SASL_URI || 'ldap://localhost:1234';

describe('SASL PLAIN bind', function() {
    connect(uri);
    it('Should bind with user', function(done) {
        ldap.saslbind({ 
            mechanism: 'PLAIN', 
            user: 'test_user', 
            password: 'secret',
            securityproperties: 'none'
        }, function(err) {
                assert.ifError(err);
                done();
        });
    });
    search();
    after(cleanup);
});

describe('LDAP SASL Proxy User', function() {
    connect(uri);
    it('Should bind with proxy user', function(done) {
        ldap.saslbind({ 
            mechanism: 'PLAIN', 
            user: 'test_user', 
            password: 'secret',
            proxyuser: 'u:test_admin',
            securityproperties: 'none'
        }, function(err) {
            assert.ifError(err);
            done();
        });
    });
    search();
    after(cleanup);
});

describe('SASL Error Handling', function() {

    connect(uri);

    it('Should fail to bind invalid password', function(done) {
        ldap.saslbind({ 
            mechanism: 'PLAIN', 
            user: 'test_user', 
            password: 'bad password',
            securityproperties: 'none'
        }, function(err) {
            assert.ifError(!err);
            done();
        });
    });

    it('Should fail to bind invalid proxy user', function(done) {
        ldap.saslbind({ 
            mechanism: 'PLAIN', 
            user: 'test_user', 
            password: 'secret',
            proxyuser: 'no_user',
            securityproperties: 'none'
       }, function(err) {
            assert.ifError(!err);
            done();
       });
    });

    it('Should throw on invalid mechanism', function(done) {
        try {
            ldap.saslbind({ mechanism: 'INVALID' }, function(err) {
                assert(false);
            });
        } 
        catch(err) {
        }
        done();
    })

    it('Should throw on invalid parameter', function(done) {
        try {
            ldap.saslbind({realm: 0}, function(err) {
                assert(false);
            });
        } 
        catch(err) {
        }
        done();
    });

    after(cleanup);
});

// Needs to be a server that supports SASL authentication with default 
// credentials (e.g. GSSAPI)
var gssapi_uri = process.env.TEST_SASL_GSSAPI_URI;
if(gssapi_uri) {
    describe('LDAP SASL GSSAPI', function() {
        connect(gssapi_uri);
        it('Should bind with default credentials', function(done) {
            this.timeout(10000);
            ldap.saslbind(function(err) {
                assert.ifError(err);
                done();
            });
        });
        search();
        after(cleanup);
    });
}

function connect(uri) {
    it('Should connect', function(done) {
        ldap = new LDAP({ uri: uri }, function(err) {
            assert.ifError(err);
            done();
        });
    });
}

function search() {
	var dc;
    it('Should be able to get root info', function(done) {
        ldap.search({
            base: '',
            scope:  LDAP.BASE,
			attrs: 'namingContexts'
        }, function(err, res) {
            assert.ifError(err);
            assert(res.length);
			var ctx = res[0].namingContexts.filter(function(c) {
				return c.indexOf('{') < 0; // Avoid AD config context
			});
			dc = ctx[0];
            done();
        });
    });
    it('Should be able to search', function(done) {
        ldap.search({
            filter: '(objectClass=*)',
            base: dc,
            scope:  LDAP.ONELEVEL,
			attrs: 'cn'
        }, function(err, res) {
            assert.ifError(err);
            assert(res.length);
            done();
        });
    });
}

function cleanup() {
    if(ldap) {
        ldap.close();
        ldap = undefined;
    }
}
