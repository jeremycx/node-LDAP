var ldapbinding = require("./build/default/LDAP");

var Connection = function() {
    var callbacks = {};
    var binding = new ldapbinding.LDAPConnection();
    var self = this;
    var querytimeout = 5000;

    self.SetCallback(msgid, CB) {
        if (msgid > 0) {
            callbacks[msgid] = CB;
            callbacks[msgid].tm = setTimeout(function() {
                CB(msgid, -2);
                delete callbacks[msgid];
            }, querytimeout);
        }
        return msgid;
    }

    self.Open = function(uri) {
        return binding.Open(uri);
    }

    self.Search = function(base, scope, filter, attrs, CB) {
        var msgid = binding.Search(base, scope, filter, attrs);
        return self.SetCallback(msgid, CB);
    }

    self.Add = function(dn, data, CB) {
        var msgid = binding.Add(dn, data);
        return self.SetCallback(msgid, CB);
    }

    self.Modify = function(dn, data, CB) {
        var msgid = binding.Modify(dn, data);
        return self.SetCallback(msgid, CB);
    }

    binding.addListener("searchresult", function(msgid, result, data) {
        clearTimeout(callbacks[msgid].tm);
        callbacks[msgid](msgid, result, data);
        delete(callbacks[msgid]);
    });

    binding.addListener("result", function(msgid, result) {
        clearTimeout(callbacks[msgid].tm);
        callbacks[msgid](msgid, result);
        delete(callbacks[msgid]);
    });
}

exports.Connection = Connection;