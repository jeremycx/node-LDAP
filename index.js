/*jshint globalstrict:true, node:true, trailing:true, unused:true */

'use strict';

var binding = require('bindings')('LDAPCnx');
var LDAPError = require('./LDAPError');

function arg(val, def) {
    if (val !== undefined) {
        return val;
    }
    return def;
}


function LDAP(opt) {
    this.callbacks = {};
    this.lateresponses = 0;
    this.timeout = 2000;
    if (typeof opt.reconnect === 'function') {
        this.onreconnect = opt.reconnect;
    }

    if (typeof opt.uri !== 'string') {
        throw new LDAPError('Missing argument');
    }
    this.uri = opt.uri;
    
    this.ld = new binding.LDAPCnx(this.onresult.bind(this),
                                  this.onreconnect.bind(this));
    try {
        this.ld.initialize(this.uri);
    } catch (e) {
        
    }
    return this;
}

LDAP.prototype.onresult = function(err, msgid, data) {
    if (this.callbacks[msgid]) {
        clearTimeout(this.callbacks[msgid].timer);
        this.callbacks[msgid](err, msgid, data);
        delete this.callbacks[msgid];
    } else {
        this.lateresponses++;
    }
};

LDAP.prototype.onreconnect = function() {
    // default reconnect callback does nothing
};

LDAP.prototype.remove = LDAP.prototype.delete  = function(dn, fn) {
    if (typeof dn !== 'string' ||
        typeof fn !== 'function') {
        throw new LDAPError('Missing argument');
    }
    return this.enqueue(this.ld.delete(dn), fn);
};

LDAP.prototype.bind = LDAP.prototype.simplebind = function(opt, fn) {
    if (typeof opt          === 'undefined' ||
        typeof opt.binddn   !== 'string' ||
        typeof opt.password !== 'string' ||
        typeof fn           !== 'function') {
        throw new LDAPError('Missing argument');
    }
    return this.enqueue(this.ld.bind(opt.binddn, opt.password), fn);
};

LDAP.prototype.add = function(dn, attrs, fn) {
    if (typeof dn    !== 'string' ||
        typeof attrs !== 'object') {
        throw new LDAPError('Missing argument');
    }
    return this.enqueue(this.ld.add(dn, attrs), fn);
};

LDAP.prototype.search = function(opt, fn) {
    return this.enqueue(this.ld.search(arg(opt.base   ,'dc=com'),
                                       arg(opt.filter ,'(objectClass=*)'),
                                       arg(opt.attrs  ,'*'),
                                       arg(opt.scope  , this.SUBTREE)), fn);
};

LDAP.prototype.rename = function(dn, newrdn, fn) {
    if (typeof dn     !== 'string' ||
        typeof newrdn !== 'string' ||
        typeof fn     !== 'function') {
        throw new LDAPError('Missing argument');
       }
    return this.enqueue(this.ld.rename(dn, newrdn), fn);
};

LDAP.prototype.modify = function(dn, ops, fn) {
    if (typeof dn  !== 'string' ||
        typeof ops !== 'object' ||
        typeof fn  !== 'function') {
        throw new LDAPError('Missing argument');
    }
    return this.enqueue(this.ld.modify(dn, ops), fn);
};

LDAP.prototype.enqueue = function(msgid, fn) {
    if (msgid == -1) {
        process.nextTick(function() {
            fn(new LDAPError(this.ld.errorstring()));
            return;
        }.bind(this));
        return this;
    }        
    fn.timer = setTimeout(function searchTimeout() {
        delete this.callbacks[msgid];
        fn(new LDAPError('Timeout'), msgid);
    }.bind(this), this.timeout);
    this.callbacks[msgid] = fn;
    return this;
};

LDAP.prototype.BASE = 0;
LDAP.prototype.ONELEVEL = 1;
LDAP.prototype.SUBTREE = 2;
LDAP.prototype.SUBORDINATE = 3;
LDAP.prototype.DEFAULT = 4;

module.exports = LDAP;
