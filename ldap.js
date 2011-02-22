var ldapbinding = require("./build/default/ldap_binding");

var Connection = function() {
    var requests = {};
    var binding = new ldapbinding.Connection();
    var self = this;
    var requestcount = 0;
    var reconnects = 0;
    var retries = 0;
    var uri;
    var openSuccessCB;
    var openErrCB;

    binding.addListener("search", function(msgid, result) {
        if (typeof(requests[msgid].successCB) != "undefined") {
            requests[msgid].successCB(result);
            delete requests[msgid];
        }
    });

    binding.addListener("bind", function(msgid, success) {
        if (typeof(requests[msgid].successCB) != "undefined") {
            requests[msgid].successCB(success);
            delete requests[msgid];
        }
    });

    binding.addListener("modify", function(msgid, success) {
      if (typeof(requests[msgid].successCB) != "undefined") {
        requests[msgid].successCB(success);
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

    self.open = function(u, sCB, eCB) {
        startup = new Date();
        openSuccessCB = sCB;
        openErrCB = eCB;
        uri = u;

        self.openWithRetry();
    }

    self.openWithRetry = function() {
        if (binding.open(uri)) {
            retries++;
            setTimeout(self.openWithRetry, 1000);
            console.log("Open failed. Retry in 1 s");
        } else {
            retries=0;
            if (typeof openSuccessCB == 'function') { openSuccessCB(); }
        }
    }

    self.reopen = function() {
        binding.open(uri);
    }

    self.close = function() {
        binding.close();
    }

    self.authenticate = function(username, password, successCB, errCB) {
        requestcount++;

        var r = new Request(successCB, errCB);        
        
        var msgid = r.doAction(function() {
            return binding.authenticate(username, password);
        });

        requests[msgid] = r;
    }

    self.modify = function (dn, mods, successCB, errCB) {
      requestcount++;
      var r = new Request(successCB, errCB);
      var msgid = r.doAction(function () {
        return binding.modify(dn, mods);
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
