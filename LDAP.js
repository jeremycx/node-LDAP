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
    var stasiscallbacks;
    var reconnecting = false;

    if (!opts.uri) {
        throw new LDAPError('You must provide a URI');
    }

    opts.timeout = opts.timeout || 2000;
    opts.backoff = -1;
    opts.backoffmax = opts.backoffmax || 30000;

    self.BASE = 0;
    self.ONELEVEL = 1;
    self.SUBTREE = 2;
    self.SUBORDINATE = 3;
    self.DEFAULT = -1;

    function setCallback(msgid, fn) {
        if (msgid >= 0) {
            if (typeof(fn) == 'function') {
                callbacks[msgid] = fn;
                callbacks[msgid].tm = setTimeout(function() {
                    fn(new LDAPError('Timeout', msgid));
                    delete callbacks[msgid];
                }, opts.timeout);
            }
        } else {
            fn(new Error('LDAP Error', msgid));
        }
    }

    function handleCallback(msgid, data) {
        if (typeof callbacks[msgid] == 'function') {
            clearTimeout(callbacks[msgid].tm);
            callbacks[msgid](undefined, data);
            delete(callbacks[msgid]);
        }
    }

    function clearCallbacks() {
        stasiscallbacks = callbacks;
        callbacks = {};
    }

    function open(fn) {
        binding.open(opts.uri, (opts.version || 3));
        return simpleBind(fn); // do an anon bind to get it all ready.
    }

    function backoff() {
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
                    console.log('Error in reconnect ' + err.message);
                    reconnect();
                } else {
                    console.log('Successful reconnect');
                    opts.backoff = -1;
                    reconnecting = false;
                }
            });
        }, (backoff()));
    }

    function simpleBind(fn) {
        var msgid;
        if (!opts.binddn) {
            msgid = binding.simpleBind();
        } else {
            msgid = binding.simpleBind(opts.binddn, opts.password);
        }
        return setCallback(msgid, fn);
    }

    function search(s_opts, fn) {
        setCallback(binding.search(s_opts.base, s_opts.scope, s_opts.filter,
                                   s_opts.attrs), fn);
    }

    binding.on('searchresult', function(msgid, result, data) {
        handleCallback(msgid, data);
    });

    binding.on('result', function(msgid) {
        handleCallback(msgid);
    });

    binding.on('error', function(err) {
        console.log(err);
        process.exit();
    });

    binding.on('disconnected', function(err) {
        console.log("Disconnect");
        if (!reconnecting) {
            console.log('Reconnecting');
            clearCallbacks();
            reconnect();
        } else {
            console.log('Reconnect in progress. Ignoring disconnect event');
        }
    });

    this.open = open;
    this.simpleBind = simpleBind;
    this.search = search;

};

util.inherits(LDAP, events.EventEmitter);

module.exports = LDAP;
