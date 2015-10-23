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

function Stats() {
    this.lateresponses = 0;
    this.connects    = 0;
    this.timeouts      = 0;
    this.requests      = 0;
    this.searches      = 0;
    this.binds         = 0;
    this.errors        = 0;
    this.modifies      = 0;
    this.adds          = 0;
    this.removes       = 0;
    this.renames       = 0;
    this.disconnects   = 0;
    this.results       = 0;
    return this;
}

function LDAP(opt, fn) {
    this.callbacks = {};
    this.defaults = {
        base:        'dc=com',
        filter:      '(objectClass=*)',
        scope:       this.SUBTREE,
        attrs:       '*',
        starttls:    false,
        validate:    true,
        ntimeout:    5000,
        timeout:     2000,
        ready:       function() {},
        disconnect:  function() {}
    };

    this.stats = new Stats();

    if (typeof opt.uri !== 'string') {
        throw new LDAPError('Missing argument');
    }
    this.defaults.uri = opt.uri;
    if (opt.base)            this.defaults.base      = opt.base;
    if (opt.filter)          this.defaults.filter    = opt.filter;
    if (opt.scope)           this.defaults.scope     = opt.scope;
    if (opt.attrs)           this.defaults.attrs     = opt.attrs;
    if (opt.connecttimeout)  this.defaults.ntimeout  = opt.connecttimeout;
    if (opt.starttls !== undefined)        this.defaults.starttls   = opt.starttls;
    if (opt.validate !== undefined)        this.defaults.validate   = opt.validate;
    if (opt.ready !== undefined)           this.defaults.ready      = opt.ready;
    if (opt.disconnect !== undefined)      this.defaults.disconnect = opt.disconnect;
    
    this.ld = new binding.LDAPCnx();
    this.ld.initialize(this.onresult.bind(this),
                       this.ready.bind(this),
                       this.ondisconnect.bind(this),
                       this.defaults.uri,
                       this.defaults.ntimeout,
                       this.defaults.starttls?1:0,
                       this.defaults.validate?1:0);

    if (opt.starttls) {
        this.enqueue(this.ld.starttls(), function(err) {
            if (err) return fn(err);
            this.ld.installtls();
            return fn(this.ld.checktls()?undefined:new Error('TLS not active'));
        }.bind(this));
    } else {
        this.enqueue(this.ld.bind(null, null), function(err) {
            if (fn) fn(err);
        }.bind(this));
    }
    
    return this;
}

LDAP.prototype.onresult = function(err, msgid, data) {
    this.stats.results++;
    if (this.callbacks[msgid]) {
        clearTimeout(this.callbacks[msgid].timer);
        this.callbacks[msgid](err, data);
        delete this.callbacks[msgid];
    } else {
        this.stats.lateresponses++;
    }
};

LDAP.prototype.ready = function() {
    this.stats.connects++;
    this.defaults.ready();
};

LDAP.prototype.ondisconnect = function() {
    this.stats.disconnects++;
    if (this.defaults.disconnect) this.defaults.disconnect();
};

LDAP.prototype.remove = LDAP.prototype.delete  = function(dn, fn) {
    this.stats.removes++;
    if (typeof dn !== 'string' ||
        typeof fn !== 'function') {
        throw new LDAPError('Missing argument');
    }
    return this.enqueue(this.ld.delete(dn), fn);
};

LDAP.prototype.bind = LDAP.prototype.simplebind = function(opt, fn) {
    this.stats.binds++;
    if (typeof opt          === 'undefined' ||
        typeof opt.binddn   !== 'string' ||
        typeof opt.password !== 'string' ||
        typeof fn           !== 'function') {
        throw new LDAPError('Missing argument');
    }
    return this.enqueue(this.ld.bind(opt.binddn, opt.password), fn);
};

LDAP.prototype.add = function(dn, attrs, fn) {
    this.stats.adds++;
    if (typeof dn    !== 'string' ||
        typeof attrs !== 'object') {
        throw new LDAPError('Missing argument');
    }
    return this.enqueue(this.ld.add(dn, attrs), fn);
};

LDAP.prototype.search = function(opt, fn) {
    this.stats.searches++;
    return this.enqueue(this.ld.search(arg(opt.base   , this.defaults.base),
                                       arg(opt.filter , this.defaults.filter),
                                       arg(opt.attrs  , this.defaults.attrs),
                                       arg(opt.scope  , this.defaults.scope)), fn);
};

LDAP.prototype.rename = function(dn, newrdn, fn) {
    this.stats.renames++;
    if (typeof dn     !== 'string' ||
        typeof newrdn !== 'string' ||
        typeof fn     !== 'function') {
        throw new LDAPError('Missing argument');
       }
    return this.enqueue(this.ld.rename(dn, newrdn), fn);
};

LDAP.prototype.modify = function(dn, ops, fn) {
    this.stats.modifies++;
    if (typeof dn  !== 'string' ||
        typeof ops !== 'object' ||
        typeof fn  !== 'function') {
        throw new LDAPError('Missing argument');
    }
    return this.enqueue(this.ld.modify(dn, ops), fn);
};

LDAP.prototype.findandbind = function(opt, fn) {
    if (opt          === undefined ||
        opt.password === undefined)  {
            throw new Error('Missing argument');
        }

    this.search(opt, function(err, data) {
        if (err) {
            fn(err);
            return;
        }
        if (data === undefined || data.length != 1) {
            fn(new LDAPError('Search returned ' + data.length + ' results, expected 1'));
            return;
        }
        if (this.auth_connection === undefined) {
            this.auth_connection = new LDAP(this.defaults);
        }
        this.auth_connection.bind({ binddn: data[0].dn, password: opt.password }, function(err) {
            if (err) {
                fn(err);
                return;
            }
            fn(undefined, data[0]);
        }.bind(this));
    }.bind(this));
};

LDAP.prototype.close = function() {
    if (this.auth_connection !== undefined) {
        this.auth_connection.close();
    }
    return this.ld.close();
};

LDAP.prototype.enqueue = function(msgid, fn) {
    if (msgid == -1) {
        process.nextTick(function() {
            fn(new LDAPError(this.ld.errorstring()));
            return;
        }.bind(this));
        this.stats.errors++;
        return this;
    }
    fn.timer = setTimeout(function requestTimeout() {
        delete this.callbacks[msgid];
        fn(new LDAPError('Request Timeout'), msgid);
        this.stats.timeouts++;
    }.bind(this), this.defaults.timeout);
    this.callbacks[msgid] = fn;
    this.stats.requests++;
    return this;
};

LDAP.prototype.BASE = 0;
LDAP.prototype.ONELEVEL = 1;
LDAP.prototype.SUBTREE = 2;
LDAP.prototype.SUBORDINATE = 3;
LDAP.prototype.DEFAULT = 4;

module.exports = LDAP;
