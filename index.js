/*jshint globalstrict:true, node:true, trailing:true, unused:true */

'use strict';

var binding = require('bindings')('LDAPCnx');
var LDAPError = require('./LDAPError');
var _ = require('lodash');

function arg(val, def) {
    if (val !== undefined) {
        return val;
    }
    return def;
}

function Stats() {
    this.lateresponses = 0;
    this.reconnects    = 0;
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
    this.stats = new Stats();
    this.initialconnect = true;
    
    this.options = _.assign({
        base:         'dc=com',
        filter:       '(objectClass=*)',
        scope:        2,
        attrs:        '*',
        ntimeout:     1000,
        timeout:      2000,
        debug:        0,
        starttls:     false,
        validatecert: true,
        connect:      function() {},
        disconnect:   function() {},
        ready:    fn
    }, opt);


    if (typeof opt.uri !== 'string') {
        throw new LDAPError('Missing argument');
    }
    
    this.ld = new binding.LDAPCnx(this.onresult.bind(this),
                                  this.onconnect.bind(this),
                                  this.ondisconnect.bind(this));
    try {
        this.ld.initialize(this.options.uri, this.options.ntimeout, this.options.debug);
    } catch (e) {
        //TODO: does init still need to throw?
    }

    if (this.options.starttls) {
        this.enqueue(this.ld.starttls(this.options.validatecert), function(err) {
            if (err) return this.options.ready(err);
            if (err = this.ld.installtls() !== 0) return this.options.ready(new LDAPError(this.ld.errorstring()));
            if (err = this.ld.checktls() !== 1) return this.options.ready(new LDAPError('Expected TLS'));
            return this.enqueue(this.ld.bind(undefined, undefined), this.do_ready.bind(this));
        }.bind(this));
    } else {
        this.enqueue(this.ld.bind(undefined, undefined), this.do_ready.bind(this));
    }

    return this;
}

LDAP.prototype.do_ready = function(err) {
    this.initialconnect = false;
    if (typeof this.options.ready === 'function') this.options.ready(err);
};

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

LDAP.prototype.onconnect = function() {
    this.stats.reconnects++;
    if (this.initialconnect) return; // suppress initial connect event
    this.options.connect();
};

LDAP.prototype.ondisconnect = function() {
    this.stats.disconnects++;
    this.options.disconnect();
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
    return this.enqueue(this.ld.search(arg(opt.base   , this.options.base),
                                       arg(opt.filter , this.options.filter),
                                       arg(opt.attrs  , this.options.attrs),
                                       arg(opt.scope  , this.options.scope)), fn);
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
            this.auth_connection = new LDAP(this.options);
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
    this.ld.close();
    this.ld = undefined;
};

LDAP.prototype.enqueue = function(msgid, fn) {
    if (msgid == -1 || this.ld === undefined) {
        if (this.ld.errorstring() === 'Can\'t contact LDAP server') {
            Object.keys(this.callbacks).forEach(function(msgid) {
                this.callbacks[msgid](new LDAPError('Timeout'));
                delete this.callbacks[msgid];
                this.ld.abandon(msgid);
            }.bind(this));
        } 
        process.nextTick(function() {
            fn(new LDAPError(this.ld.errorstring()));
        }.bind(this));
        this.stats.errors++;
        return this;
    }
    fn.timer = setTimeout(function searchTimeout() {
        this.ld.abandon(msgid);
        delete this.callbacks[msgid];
        fn(new LDAPError('Timeout'));
        this.stats.timeouts++;
    }.bind(this), this.options.timeout);
    this.callbacks[msgid] = fn;
    this.stats.requests++;
    return this;
};

LDAP.BASE = 0;
LDAP.ONELEVEL = 1;
LDAP.SUBTREE = 2;
LDAP.SUBORDINATE = 3;
LDAP.DEFAULT = 4;

module.exports = LDAP;
