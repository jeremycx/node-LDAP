var events = require('events')
    , util = require('util');

var LDAPConnection;

try {
    LDAPConnection = require('./build/default/LDAP').LDAPConnection;
} catch(e) {
    LDAPConnection = require('./build/Release/LDAP').LDAPConnection;
}

function LDAPError(message, msgid, errcode) {
    this.name = 'LDAPError';
    this.message = message || 'Default Message';
    this.msgid = msgid;
    this.code = errcode;
}
LDAPError.prototype = new Error();
LDAPError.prototype.constructor = LDAPError;

var LDAP = function(opts) {
    var self = this;
    var binding;
    var callbacks = {};
    var reconnecting = false;
    var syncopts = undefined;
    var cookie = undefined;
    var syncpolltimer = undefined;
    var stats = {
        lateresponses: 0,
        reconnects: 0,
        ignored_reconnnects: 0,
        searches: 0,
        binds: 0,
        errors: 0,
        closes: 0,
        modifies: 0,
        adds: 0,
        removes: 0,
        renames: 0,
        disconnects: 0,
        replays: 0,
        opens: 0,
        backoffs: 0,
        results: 0,
        searchresults: 0
    };
    var b = [];

    if (!opts || !opts.uri) {
        throw new LDAPError('You must provide a URI');
    }

    opts.starttls = opts.starttls || false;
    opts.timeout = opts.timeout || 5000;
    opts.backoff = 1; //sec
    opts.backoffmax = opts.backoffmax || 32; //sec

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
        if (msgid >= 1) {
            if (typeof(fn) == 'function') {
                callbacks[msgid] =
                    {
                        fn: fn,
                        replay: replay,
                        args: args,
                        tm: setTimeout(function() {
                            delete callbacks[msgid];
                            fn(new LDAPError('Timeout', msgid, -2));
                        }, opts.timeout)
                    }
            }
        } else {
            var message = 'LDAP Error ' + binding.err2string();
            process.nextTick(function() {
                fn(new LDAPError(message, msgid, msgid));
            });
            reconnect();
        }
        return msgid;
    }

    function handleCallback(msgid, err, data, cookie) {
        if (callbacks[msgid]) {
            if (typeof callbacks[msgid].fn == 'function') {
                var thiscb = callbacks[msgid];
                delete callbacks[msgid];
                clearTimeout(thiscb.tm);
                thiscb.fn(err, data, cookie);
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
        binding = new LDAPConnection();
        setcallbacks();
        binding.open(opts.uri || 'ldap://localhost', (opts.starttls || false), (opts.version || 3), (opts.connecttimeout || -1));
        return bind(fn); // do an anon bind to get it all ready.
    }

    function backoff() {
        stats.backoffs++;
        opts.backoff *= 2;
        if (opts.backoff > opts.backoffmax)
            opts.backoff = opts.backoffmax;
        return opts.backoff * 1000;
    }

    function reconnect() {
        if (reconnecting) {
            return;
        }
        // binding.close();
        setcallbacks();
        reconnecting = setTimeout(function() {
            var res = open(function(err) {
                reconnecting = false;
                if (err) {
                    reconnect();
                } else {
                    stats.reconnects++;
                    opts.backoff = 1;
                    setcallbacks();
                    replayCallbacks();
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

    function close() {
        stats.closes++;
        if (reconnecting) {
            clearTimeout(reconnecting);
        }
        binding.close();
    }


    function simpleBind(bindopts, fn) {
        if (!bindopts || !bindopts.binddn || !bindopts.password) {
            throw new Error('Bind requires options: binddn and password');
        }
        opts.binddn = bindopts.binddn;
        opts.password = bindopts.password;
        bind(fn);
    }

    function findandbind(fbopts, fn) {
        if (!fbopts || !fbopts.filter || !fbopts.base ||!fbopts.password) {
            throw new Error('findandbind requires options: filter, scope, base and password');
        }
        if (!fbopts.scope) fbopts.scope = self.SUBTREE;

        search(fbopts, function(err, data) {
            if (err) {
                fn(err);
                return;
            }
            if (!data || data.length != 1) {
                fn(new Error('Search returned != 1 results'));
                return;
            }
            simpleBind({ binddn: data[0].dn, password: fbopts.password }, function(err) {
                if (err) {
                    fn(err);
                    return;
                }
                fn(undefined, data[0]);
            });
        });
    }

    function bind(fn) {
        var msgid;
        if (!opts.binddn) {
            msgid = binding.simpleBind();
        } else {
            msgid = binding.simpleBind(opts.binddn, opts.password);
        }
        stats.binds++;
        return setCallback(msgid, bind, arguments, fn);
    }

    function syncpoll() {
        binding.syncpoll();
    }

    function getcookie() {
        return binding.getcookie();
    }

    function sync(s) {
        if (!s) {
            throw new Error('Options Required');
        }

        if (!s.base) {
            throw new Error('Base required');
        }

        if (!s.rid) {
            throw new Error('3-digit RID Required. Make one up.');
        }

        binding.setsynccallbacks(
            (typeof s.syncentry        == 'function'?s.syncentry:function(){}),
            (typeof s.syncintermediate == 'function'?s.syncintermediate:function(){}),
            (typeof s.syncresult       == 'function'?s.syncresult:function(){}));

        binding.sync(s.base,
                     s.scope?parseInt(s.scope):self.SUBTREE,
                     s.filter?s.filter:'(objectClass=*)',
                     s.attrs?s.attrs:'*',
                     s.cookie?s.cookie:"rid="+s.rid);
        syncopts = s;

        // this is DUMB, but I can't seem to get the sync routines
        // to deliver the last message in the queue (sometimes). So,
        // we'll poll periodically. It's fairly cheap.
        syncpolltimer = setInterval(self.syncpoll, 1000);
    }

    function search(s_opts, fn) {
        stats.searches++;

        if (!s_opts) {
            throw new Error("Opts required");
        }
        if (typeof s_opts.base != 'string') {
            throw new Error("Base required");
        }

        return setCallback(binding.search(s_opts.base,
                                          (typeof s_opts.scope == 'number')?s_opts.scope:self.SUBTREE,
                                          s_opts.filter?s_opts.filter:'(objectClass=*)',
                                          s_opts.attrs?s_opts.attrs:'*', s_opts.pagesize,
                                          s_opts.cookie),
                                          search, arguments, fn);
    }

    function modify(dn, mods, fn) {
        if (!dn || typeof mods != 'object') {
            throw new Error('modify requires a dn and an array of modifications');
        }
        stats.modifies++;
        return setCallback(binding.modify(dn, mods), modify, arguments, fn);
    }

    function add(dn, attrs, fn) {
        if (!dn || typeof attrs != 'object') {
            throw new Error('add requires a dn and an array of attributes');
        }
        stats.adds++;
        return setCallback(binding.add(dn, attrs), add, arguments, fn);
    }

    function remove(dn, fn) {
        if (!dn) {
            throw new Error('remove requires a dn');
        }
        stats.removes++;
        return setCallback(binding.remove(dn), remove, arguments, fn);
    }

    function rename(dn, newrdn, fn) {
        if (!dn || !newrdn) {
            throw new Error('rename requires a dn and newrdn');
        }
        stats.renames++;
        return setCallback(binding.rename(dn, newrdn), rename, arguments, fn);
    }

    function setcallbacks() {
        binding.setcallbacks(function() {
            // connected callback
            self.emit('connected');
        }, function(err) {
            // disconnected callback
            stats.disconnects++;
            self.emit('disconnect');
            clearInterval(syncpolltimer);
            if (!reconnecting) {
                stats.reconnects++;
                // binding.close();
                // b.push(binding); // TODO: remove this
                binding = new LDAPConnection();
                if (!opts.noreconnect) reconnect();
            } else {
                stats.ignored_reconnnects++;
            }
        },function(msgid, errcode, data, cookie) {
            //searchresult callback
            stats.searchresults++;
            handleCallback(msgid, (errcode?new LDAPError(binding.err2string(errcode), msgid, errcode):undefined), data, cookie);
        }, function(msgid, errcode, data) {
            //result callback
            stats.results++;
            handleCallback(msgid, (errcode?new LDAPError(binding.err2string(errcode), msgid, errcode):undefined), data);
        }, function() {
            //error callback
            stats.errors++;
            process.exit();
        });
    }

    // public functions
    this.open = open;
    this.simpleBind = simpleBind; //left for back compat.
    this.simplebind = simpleBind;
    this.search = search;
    this.findandbind = findandbind;
    this.getStats = getStats;
    this.sync = sync;
    this.syncpoll = syncpoll;
    this.close = close;
    this.modify = modify;
    this.add = add;
    this.remove = remove;
    this.rename = rename;
    this.getcookie = getcookie;
};

util.inherits(LDAP, events.EventEmitter);

module.exports = LDAP;
module.exports.Schema = require('./schema');
