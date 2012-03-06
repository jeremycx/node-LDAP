var events = require('events')
    , util = require('util');

try {
    LDAPConnection = require('./build/default/LDAP').LDAPConnection;
} catch(e) {
    LDAPConnection = require('./build/Release/LDAP').LDAPConnection;
}

//have the LDAPConnection class inherit properties like 'emit' from the EventEmitter class
LDAPConnection.prototype.__proto__ = events.EventEmitter.prototype;

function LDAPError(message, msgid) {  
    this.name = 'LDAPError';  
    this.message = message || 'Default Message';  
    this.msgid = msgid;
}  
LDAPError.prototype = new Error();
LDAPError.prototype.constructor = LDAPError;  

var LDAP = function(opts) {
    var self = this;
    var binding = new LDAPConnection();
    var callbacks = {};
    var reconnecting = false;
    var syncopts = undefined;
    var cookie = undefined;
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

    self.LDAP_SYNC_PRESENT = 0;
    self.LDAP_SYNC_ADD = 1;
    self.LDAP_SYNC_MODIFY = 2;
    self.LDAP_SYNC_DELETE = 3;
    self.LDAP_SYNC_NEW_COOKIE = 4;

    self.LDAP_SYNC_CAPI_PRESENTS = 16;
    self.LDAP_SYNC_CAPI_DELETES = 19;
    self.LDAP_SYNC_CAPI_PRESENTS_IDSET = 48;
    self.LDAP_SYNC_CAPI_DELETES_IDSET = 51;
    self.LDAP_SYNC_CAPI_DONE = 80;

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
            var res = open(function(err) {
                if (err) {
                    reconnect();
                } else {
                    stats.reconnects++;
                    opts.backoff = -1;
                    replayCallbacks();
                    reconnecting = false;
                    
                    if (syncopts) {
                        sync(syncopts);
                    }
                }
            });
        }, (backoff()));
    }

    function getStats() {
        stats.inflight = Object.keys(callbacks).length;
        return stats;
    }

    function state2str(state) {
        switch(state) {
        case self.LDAP_SYNC_PRESENT:
            return 'LDAP_SYNC_PRESENT';
        case self.LDAP_SYNC_ADD:
            return 'LDAP_SYNC_ADD';
        case self.LDAP_SYNC_MODIFY:
            return 'LDAP_SYNC_MODIFY';
        case self.LDAP_SYNC_DELETE:
            return 'LDAP_SYNC_DELETE';
        case self.LDAP_SYNC_NEW_COOKIE:
            return 'LDAP_SYNC_NEW_COOKIE';
        default:
            return 'UNKNOWN_STATE (' + state + ')';
        }
    }

    function phase2str(phase) {
        switch(phase) {
        case self.LDAP_SYNC_CAPI_DONE:
            return 'LDAP_SYNC_CAPI_DONE';
        case self.LDAP_SYNC_CAPI_PRESENTS:
            return 'LDAP_SYNC_CAPI_PRESENTS';
        case self.LDAP_SYNC_CAPI_DELETES:
            return 'LDAP_SYNC_CAPI_DELETES';
        case self.LDAP_SYNC_CAPI_PRESENTS_IDSET:
            return 'LDAP_SYNC_CAPI_PRESENTS_IDSET';
        case self.LDAP_SYNC_CAPI_DELETES_IDSET:
            return 'LDAP_SYNC_CAPI_DELETES_IDSET';
        default:
            return 'UNKNOWN_PHASE (' + phase + ')';
        }
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

    function sync(s) {
        if (typeof s.syncresult == 'function') {
            binding.on('syncresult', s.syncresult);
        }
        if (typeof s.syncentry == 'function') {
            binding.on('syncentry', s.syncentry);
        }
        if (typeof s.syncidset == 'function') {
            binding.on('syncidset', s.syncidset);
        }
        if (typeof s.syncintermediate == 'function') {
            binding.on('syncintermediate', s.syncintermediate);
        }

        if (!s) {
            throw new Error('Options Required');
        }

        if (!s.base) {
            throw new Error('Base required');
        }

        if (!s.rid) {
            throw new Error('3-digit RID Required. Make one up.');
        }

        binding.sync(s.base, 
                     s.scope?parseInt(s.scope):self.SUBTREE,
                     s.filter?s.filter:'(objectClass=*)', 
                     s.attrs?s.attrs:'*', 
                     s.cookie?s.cookie:"rid="+s.rid);
        syncopts = s;
    }

    function search(s_opts, fn) {
        stats.searches++;
        
        if (!s_opts) {
            throw new Error("Opts required");
        }
        if (!s_opts.base) {
            throw new Error("Base required");
        }

        return setCallback(binding.search(s_opts.base, 
                                          s_opts.scope?s_opts.scope:self.SUBTREE, 
                                          s_opts.filter?s_opts.filter:'(objectClass=*)',
                                          s_opts.attrs?s_opts.attrs:'*'),
                                          search, arguments, fn);
    }

    binding.on('searchresult', function(msgid, data) {
        stats.searchresults++;
        handleCallback(msgid, data);
    });

    binding.on('result', function(msgid) {
        stats.results++;
        handleCallback(msgid);
    });

    binding.on('newcookie', function(cookie) {
        // this way a reconnect always starts from the last known cookie.
        if (cookie) {
            syncopts.cookie = cookie;
            console.log('Storing new cookie ' + syncopts.cookie);
        }
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
    this.sync = sync;
    this.state2str = state2str;
    this.phase2str = phase2str;

};

util.inherits(LDAP, events.EventEmitter);

module.exports = LDAP;
