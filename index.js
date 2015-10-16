var binding = require('bindings')('LDAPCnx');
var util = require('util');
var events = require('events');

"use strict";

function LDAP() {
    this.callbacks = {};
    this.lateresponses = 0;
    this.timeout = 2000;
    
    this.ld = new binding.LDAPCnx(0, function ResultCallback(err, msgid, data) {
        if (this.callbacks[msgid]) {
            clearTimeout(this.callbacks[msgid].timer);
            this.callbacks[msgid](err, msgid, data);
            delete this.callbacks[msgid];
        } else {
            this.lateresponses++;
        }
    }.bind(this));
    return this;
};

LDAP.prototype.initialize = function(url) {
    this.ld.initialize(url);
    return this;
};

LDAP.prototype.remove = LDAP.prototype.delete  = function(dn, fn) {
    return this.enqueue(this.ld.delete(dn), fn);
};

LDAP.prototype.bind = function(dn, pw, fn) {
    return this.enqueue(this.ld.bind(dn, pw), fn);
};

LDAP.prototype.add = function(dn, attrs, fn) {
    return this.enqueue(this.ld.add(dn, attrs), fn);
};

LDAP.prototype.search = function(base, filter, attrs, fn) {
    return this.enqueue(this.ld.search(base, filter, attrs), fn);
};

LDAP.prototype.enqueue = function(msgid, fn) {
    if (typeof fn !== 'function') {
        throw new Error('Callback is not a function');
    }
    if (msgid == -1) {
        process.nextTick(function() {
            fn(new Error(this.ld.errorstring()));
            return;
        }.bind(this));
    }        
    fn.timer = setTimeout(function searchTimeout() {
        delete this.callbacks[msgid];
        fn(new Error('Timeout'), msgid);
    }.bind(this), this.timeout);
    this.callbacks[msgid] = fn;
    return this;
};

module.exports = LDAP;
