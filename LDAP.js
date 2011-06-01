var ldapbinding = require("./build/default/LDAP");

var Connection = function() {
    var callbacks = {};
    var binding = new ldapbinding.LDAPConnection();
    var self = this;
    var querytimeout = 5000;
    var totalqueries = 0;

    self.BASE = 0;
    self.ONELEVEL = 1;
    self.SUBTREE = 2;
    self.SUBORDINATE = 3;
    self.DEFAULT = -1;

    self.setCallback = function(msgid, CB) {
        if (msgid > 0) {
            totalqueries++;
            if (typeof(CB) == 'function') {
                callbacks[msgid] = CB;
                callbacks[msgid].tm = setTimeout(function() {
                    CB(msgid, -2);
                    delete callbacks[msgid];
                }, querytimeout);
            }
        } else {
            CB(msgid, new Error('Error setting callback'));
        }
    };

    self.open = function(uri, version) {
        if (arguments.length < 2) {
            return binding.open(uri, 3);
        }

        return binding.open(uri, version);
    };

    self.search = function(base, scope, filter, attrs, CB) {
        var msgid = binding.search(base, scope, filter, attrs);
        return self.setCallback(msgid, CB);
    };

    self.simpleBind = function(binddn, password, CB) {
        var msgid;
        if (arguments.length === 0) {
            msgid = binding.simpleBind();
        } else {
            msgid = binding.simpleBind(binddn, password);
        }
        return self.setCallback(msgid, CB);
    };

    self.add = function(dn, data, CB) {
        var msgid = binding.add(dn, data);
        return self.setCallback(msgid, CB);
    };

    self.modify = function(dn, data, CB) {
        var msgid = binding.modify(dn, data);
        return self.setCallback(msgid, CB);
    };

    self.addListener = function(event, CB) {
        binding.addListener(event, CB);
    };

    binding.addListener("searchresult", function(msgid, result, data) {
        if (callbacks[msgid]) {
            clearTimeout(callbacks[msgid].tm);
            callbacks[msgid](msgid, result, data);
            delete(callbacks[msgid]);
        }
    });

    binding.addListener("result", function(msgid, result) {
        if (callbacks[msgid]) {
            clearTimeout(callbacks[msgid].tm);
            callbacks[msgid](msgid, result);
            delete(callbacks[msgid]);
        }
    });
};

exports.Connection = Connection;
