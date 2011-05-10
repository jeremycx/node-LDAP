var ldapbinding = require("./build/default/ldap_binding");

var Connection = function() {
    var requests = {};
    var binding = new ldapbinding.Connection();
    var self = this;
    var requestcount = 0;
    var reconnects = 0;
    var connectretries = 0;
    var uri;
    var openCB;

    self.maxconnectretries = 3;
    self.retrywait = 10000;

    binding.addListener("search", function(msgid, result) {
        if (typeof(requests[msgid].successCB) != "undefined") {
            requests[msgid].successCB(result);
            delete requests[msgid];
        }
    });

    binding.addListener("event", function(msgid, error) {
        if (typeof(requests[msgid].successCB) != "undefined") {
            requests[msgid].successCB(error);
            delete requests[msgid];
        }
    });

    binding.addListener("unknown", function(errmsg, msgid, type) {
        console.log("Unknown response detected "+errmsg+" "+msgid+" "+type);
    });

    self.reconnect = function() {
        console.log("Reconnect starting");
        binding.close();
        openSuccessCB = function() {
            reconnects++;

            var newrequests = {};
            for (msgid in requests) {
                console.log("Resubmitting "+msgid);
                if (typeof requests[msgid] != 'undefined') {
                    newrequests[requests[msgid].redo()] = requests[msgid];
                } 
            }
            requests = newrequests;
        }
        self.openWithRetry();
    }

    binding.addListener("serverdown", self.reconnect);

    self.search = function(base, filter, attrs, successCB, errCB) {
        requestcount++;
        var r = new Request(successCB, errCB);

        var msgid = r.doAction(function() {
            return binding.search(base, filter, attrs);
        });

        requests[msgid] = r;
    }

    self.Open = function(u, CB) {
        startup = new Date();
        openCB = CB;
        uri = u;

        self.openWithRetry();
    }

    self.openWithRetry = function() {
        var err;
        if (err = binding.open(uri)) {
            if (++connectretries > self.maxconnectretries) {
                connectretries = 0;
                if (typeof openCB == 'function') { openCB(err); }
                return;
            }
            setTimeout(self.openWithRetry, self.retrywait);
            console.log("Open "+connectretries+" of "+
                        self.maxconnectretries+
                        " failed. Retry in "+self.retrywait+" ms");
        } else {
            connectretries=0;
            if (typeof openCB == 'function') { openCB(); }
        }
    }

    self.reopen = function() {
        binding.open(uri);
    }

    self.close = function() {
        binding.close();
    }

    self.authenticate = function (username, password, callback) {
      requestcount++;
      var r = new Request(callback, null);
        
        var msgid = r.doAction(function() {
            return binding.authenticate(username, password);
        });

        requests[msgid] = r;
    }

    self.modify = function (dn, mods, callback) {
      requestcount++;

      var r = new Request(callback, null);
      var msgid = r.doAction(function () {
        return binding.modify(dn, mods);
      });
      requests[msgid] = r;
    };

    self.rename = function (dn, newrdn, callback) {
      requestcount++;

      var r = new Request(callback, null);
      var msgid = r.doAction(function () {
        return binding.rename(dn, newrdn, "", true);
      });
      requests[msgid] = r;
    };

    self.add = function (dn, attrs, callback) {
      requestcount++;

      var r = new Request(callback, null);
      var msgid = r.doAction(function () {
        return binding.add(dn, attrs);
      });
      requests[msgid] = r;
    };

    self.close = function(a) {
        binding.close(a);
    }

    self.searchAuthenticate = function(base, filter, password, CB) {
        self.search(base, filter, "", function(res) {
            // TODO: see if there's only one result, and exit if not
            if (res.length != 1) {
                CB(0);
            } else {
                // we have the result. Use the DN to auth.
                self.authenticate(res[0].dn, password, function(success, dn) {
                    CB(success, res[0].dn);
                });
            }
        });
    }

    self.getStats = function() {
        return { 'requests'   : requestcount,
                 'startup'    : startup,
                 'reconnects' : reconnects };
    }
}

var Request = function(successCB, errCB) {
    var self = this;
    self.successCB = successCB;
    self.errCB = errCB;
    var startup = new Date();

    self.doAction = function(func) {
        self.action = func;
        self.msgid = self.action();
        return self.msgid;
    }

    self.redo  = function() { 
        self.msgid = self.action();
        return self.msgid;
    }
}

exports.Connection = Connection;
