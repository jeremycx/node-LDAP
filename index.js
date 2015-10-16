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
            this.callbacks[msgid](err, msgid, data);
            clearTimeout(this.callbacks[msgid].timer);
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

LDAP.prototype.delete = function(dn, fn) {
    var msgid = this.ld.delete(dn);
    this.callbacks[msgid] = fn;
};

LDAP.prototype.enqueue = function(msgid, fn) {
    this.callbacks[msgid] = fn;
    fn.timer = setTimeout(function searchTimeout() {
        delete this.callbacks[msgid];
        fn(new Error('Timeout'), msgid);
    }.bind(this), this.timeout);
    return this;
};

LDAP.prototype.search = function(base, filter, attrs, fn) {
    if (typeof fn !== 'function') {
        throw new Error('Callback is not a function');
    }
    return this.enqueue(this.ld.search(base, filter, attrs), fn);
};

module.exports = LDAP;
