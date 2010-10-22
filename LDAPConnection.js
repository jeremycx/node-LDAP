var ldapbinding = require("./build/default/ldap_binding");

exports.Connection = function() {
    var callbacks = {};
    var binding = new ldapbinding.Connection();
    var me = this;

    binding.addListener("search", function(msgid, result) {
        if (typeof(callbacks[msgid]) != "undefined") {
            callbacks[msgid](result);
            delete callbacks[msgid];
        }
    });

    binding.addListener("bind", function(msgid, success) {
        if (typeof(callbacks[msgid]) != "undefined") {
            callbacks[msgid](success);
            delete callbacks[msgid];
        }
    });

    binding.addListener("unknown", function() {
        console.log("Unknown response detected");
    });

    this.Search = function(base, filter, callback) {
        var msgid = binding.search(base, filter);
        callbacks[msgid] = callback;
    }

    this.Open = function(uri) {
        binding.open(uri);
    }

    this.Authenticate = function(username, password, callback) {
        var msgid = binding.authenticate(username, password);
        callbacks[msgid] = callback;
    }

    this.SearchAuthenticate = function(base, filter, password, CB) {
        this.Search(base, filter, function(res) {
            // TODO: see if there's only one result, and exit if not
            if (res.length != 1) {
                CB(0);
            } else {
                // we have the result. Use the DN to auth.
                me.Authenticate(res[0].dn, password, function(success, dn) {
                    CB(success, res[0].dn);
                });
            }
        });
    }
}