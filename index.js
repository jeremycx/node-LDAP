/*jshint globalstrict:true, node:true, trailing:true, unused:true */

'use strict';

var binding = require('bindings')('LDAPCnx');
var LDAPError = require('./LDAPError');
var assert = require('assert');
var util = require('util');
var _ = require('lodash');

function arg(val, def) {
    if (val !== undefined) {
        return val;
    }
    return def;
}

var escapes = {
    filter: {
        regex: new RegExp(/\0|\(|\)|\*|\\/g),
        replacements: {
            "\0": "\\00",
            "(": "\\28",
            ")": "\\29",
            "*": "\\2A",
            "\\": "\\5C"
        }
    },
    dn: {
        regex: new RegExp(/\0|\"|\+|\,|;|<|>|=|\\/g),
        replacements: {
            "\0": "\\00",
            " ":  "\\ ",
            "\"": "\\\"",
            "#": "\\#",
            "+": "\\+",
            ",": "\\,",
            ";": "\\;",
            "<": "\\<",
            ">": "\\>",
            "=": "\\=",
            "\\": "\\5C"
        }
    }
};

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
    this.queue = {};
    this.stats = new Stats();

    this.options = _.assign({
        base:         'dc=com',
        filter:       '(objectClass=*)',
        scope:        2,
        attrs:        '*',
        ntimeout:     1000,
        timeout:      2000,
        debug:        0,
        validatecert: LDAP.LDAP_OPT_X_TLS_HARD,
        referrals:    0,
        connect:      function() {},
        disconnect:   function() {}
    }, opt);

    if (typeof this.options.uri === 'string') {
        this.options.uri = [ this.options.uri ];
    }

    this.ld = new binding.LDAPCnx(this.dequeue.bind(this),
                                  this.onconnect.bind(this),
                                  this.ondisconnect.bind(this),
                                  this.options.uri.join(' '),
                                  this.options.ntimeout,
                                  this.options.debug,
                                  this.options.validatecert,
                                  this.options.referrals);
                                  
    if (typeof fn !== 'function') {
        fn = function() {};
    }

    return this.enqueue(this.ld.bind(undefined, undefined), fn);
}

LDAP.prototype.onconnect = function() {
    this.stats.reconnects++;
    return this.options.connect.call(this);
};

LDAP.prototype.ondisconnect = function() {
    this.stats.disconnects++;
    this.options.disconnect();
};

LDAP.prototype.starttls = function(fn) {
    return this.enqueue(this.ld.starttls(), fn);
};

LDAP.prototype.installtls = function() {
    return this.ld.installtls();
};

LDAP.prototype.tlsactive = function() {
    return this.ld.checktls();
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

    this.search(opt, function findandbindFind(err, data) {
        if (err) return fn(err);

        if (data === undefined || data.length != 1) {
            return fn(new LDAPError('Search returned ' + data.length + ' results, expected 1'));
        }
        if (this.auth_connection === undefined) {
            this.auth_connection = new LDAP(this.options, function newAuthConnection(err) {
                if (err) return fn(err);
                return this.authbind(data[0].dn, opt.password, function authbindResult(err) {
                    fn(err, data[0]);
                });
            }.bind(this));
        } else {
            this.authbind(data[0].dn, opt.password, function authbindResult(err) {
                fn(err, data[0]);
            });
        }
        return undefined;
    }.bind(this));
};

LDAP.prototype.authbind = function(dn, password, fn) {
    this.auth_connection.bind({ binddn: dn, password: password }, fn.bind(this));
};
   
LDAP.prototype.close = function() {
    if (this.auth_connection !== undefined) {
        this.auth_connection.close();
    }
    this.ld.close();
    this.ld = undefined;
};

LDAP.prototype.dequeue = function(err, msgid, data) {
    this.stats.results++;
    if (this.queue[msgid]) {
        clearTimeout(this.queue[msgid].timer);
        this.queue[msgid](err, data);
        delete this.queue[msgid];
    } else {
        this.stats.lateresponses++;
    }
};

LDAP.prototype.enqueue = function(msgid, fn) {
    if (msgid == -1 || this.ld === undefined) {
        if (this.ld.errorstring() === 'Can\'t contact LDAP server') {
            // this means we have had a disconnect event, but since there
            // are still requests outstanding from libldap's perspective,
            // the connection isn't "closed" and the disconnect event has
            // not yet fired. To get libldap to actually call the disconnect
            // handler, we need to dump all outstanding requests, and hope
            // we're not missing one for some reason. Only once we've
            // abandoned everything does the handle properly close.
            Object.keys(this.queue).forEach(function fireTimeout(msgid) {
                this.queue[msgid](new LDAPError('Timeout'));
                delete this.queue[msgid];
                this.ld.abandon(msgid);
            }.bind(this));
        } 
        process.nextTick(function emitError() {
            fn(new LDAPError(this.ld.errorstring()));
        }.bind(this));
        this.stats.errors++;
        return this;
    }
    fn.timer = setTimeout(function searchTimeout() {
        this.ld.abandon(msgid);
        delete this.queue[msgid];
        fn(new LDAPError('Timeout'));
        this.stats.timeouts++;
    }.bind(this), this.options.timeout);
    this.queue[msgid] = fn;
    this.stats.requests++;
    return this;
};

function stringescape(escapes_obj, str) {
    return str.replace(escapes_obj.regex, function (match) {
        return escapes_obj.replacements[match];
    });
}

LDAP.escapefn = function(type, template) {
    var escapes_obj = escapes[type];
    return function() {
        var args = [ template ], i;
        for (i = 0 ; i < arguments.length ; i++) { // optimizer-friendly
            args.push(stringescape(escapes_obj, arguments[i]));
        }
        return util.format.apply(this,args);
    };
};

LDAP.stringEscapeFilter = LDAP.escapefn('filter', '%s');

function setConst(target, name, val) {
    target.prototype[name] = target[name] = val;
}

setConst(LDAP, 'BASE',        0);
setConst(LDAP, 'ONELEVEL',    1);
setConst(LDAP, 'SUBTREE',     2);
setConst(LDAP, 'SUBORDINATE', 3);
setConst(LDAP, 'DEFAULT',     4);

setConst(LDAP, 'LDAP_OPT_X_TLS_NEVER',  0);
setConst(LDAP, 'LDAP_OPT_X_TLS_HARD',   1);
setConst(LDAP, 'LDAP_OPT_X_TLS_DEMAND', 2);
setConst(LDAP, 'LDAP_OPT_X_TLS_ALLOW',  3);
setConst(LDAP, 'LDAP_OPT_X_TLS_TRY',    4);

module.exports = LDAP;
