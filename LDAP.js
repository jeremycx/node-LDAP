var events = require('events')
    , util = require('util')
    , LDAPConnection = require("./build/default/LDAP").LDAPConnection;

//have the LDAPConnection class inherit properties like 'emit' from the EventEmitter class
LDAPConnection.prototype.__proto__ = events.EventEmitter.prototype;

function LDAPError(message, msgid) {  
    this.name = "LDAPError";  
    this.message = message || "Default Message";  
    this.msgid = msgid;
}  
LDAPError.prototype = new Error();
LDAPError.prototype.constructor = LDAPError;  

var LDAP = function(opts) {
    var self = this;
    var binding = new LDAPConnection();
    var callbacks = {};
    var reconnecting = false;
    var stats = {
        lateresponses: 0,
        reconnects: 0,
        ignored_reconnnects: 0,
        searches: 0,
        binds: 0,
        errors: 0,
        disconnects: 0,
        replays: 0,
        opens: 0,
        backoffs: 0,
        results: 0,
        searchresults: 0
    };
        

    if (!opts.uri) {
        throw new LDAPError('You must provide a URI');
    }

    opts.timeout = opts.timeout || 5000;
    opts.backoff = -1;
    opts.backoffmax = opts.backoffmax || 30000;

    self.BASE = 0;
    self.ONELEVEL = 1;
    self.SUBTREE = 2;
    self.SUBORDINATE = 3;
    self.DEFAULT = -1;

    function setCallback(msgid, replay, args, fn) {
        if (msgid >= 0) {
            if (typeof(fn) == 'function') {
                callbacks[msgid] = 
                    {
                        fn: fn,
                        replay: replay,
                        args: args,
                        tm: setTimeout(function() {
                            delete callbacks[msgid];
                            fn(new LDAPError('Timeout', msgid));
                        }, opts.timeout)
                    }
            }
        } else {
            fn(new Error('LDAP Error', msgid));
        }
        return msgid;
    }

    function handleCallback(msgid, data) {
        if (callbacks[msgid]) {
            if (typeof callbacks[msgid].fn == 'function') {
                var thiscb = callbacks[msgid];
                delete callbacks[msgid];
                clearTimeout(thiscb.tm);
                thiscb.fn(undefined, data);
            }
        } else {
            stats.lateresponses++;
        }
    }

    function replayCallbacks() {
        for (var i in callbacks) {
            var thiscb = callbacks[i];
            delete (callbacks[i]);
            stats.replays++;
            thiscb.replay.apply(null, thiscb.args);
        }
    }

    function open(fn) {
        stats.opens++;
        binding.open(opts.uri, (opts.version || 3));
        return simpleBind(fn); // do an anon bind to get it all ready.
    }

    function backoff() {
        stats.backoffs++;
        opts.backoff++;
        if (opts.backoff > opts.backoffmax) 
            opts.backoff = opts.backoffmax;
        return opts.backoff * 1000;
    }

    function reconnect() {
        reconnecting = true;
        binding.close();
        setTimeout(function() {
            console.log("Reopening");
            var res = open(function(err) {
                if (err) {
                    reconnect();
                } else {
                    stats.reconnects++;
                    opts.backoff = -1;
                    replayCallbacks();
                    reconnecting = false;
                }
            });
        }, (backoff()));
    }

    function getStats() {
        stats.inflight = Object.keys(callbacks).length;
        return stats;
    }

    function simpleBind(fn) {
        var msgid;
        if (!opts.binddn) {
            msgid = binding.simpleBind();
        } else {
            msgid = binding.simpleBind(opts.binddn, opts.password);
        }
        stats.binds++;
        return setCallback(msgid, simpleBind, arguments, fn);
    }

    function search(s_opts, fn) {
        stats.searches++;
        return setCallback(binding.search(s_opts.base, s_opts.scope, s_opts.filter,
                                          s_opts.attrs), search, arguments, fn);
    }

    binding.on('searchresult', function(msgid, result, data) {
        stats.searchresults++;
        handleCallback(msgid, data);
    });

    binding.on('result', function(msgid) {
        stats.results++;
        handleCallback(msgid);
    });

    binding.on('error', function(err) {
        stats.errors++;
        process.exit();
    });

    binding.on('disconnected', function(err) {
        stats.disconnects++;
        if (!reconnecting) {
            stats.reconnects++;
            reconnect();
        } else {
            stats.ignored_reconnnects++;
        }
    });

    this.open = open;
    this.simpleBind = simpleBind;
    this.search = search;
    this.getStats = getStats;

};

util.inherits(LDAP, events.EventEmitter);

module.exports = LDAP;
