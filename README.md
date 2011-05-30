node-ldap
=========

OpenLDAP client bindings for Node.js. A good start, but not, as of
this writing, production quality. The API is mostly stable at this point.

Contributing
------------

Any and all patches and pull requests are certainly welcome.

Thanks to:
----------
* Petr Běhan
* YANG Xudong


Dependencies
------------

Tested with Node >= v0.4.0

Installation
------------

To build, ensure the OpenLDAP client libraries are installed, and

   npm install https://github.com/jeremycx/node-LDAP/tarball/master -g

Connection.Open(uri, version)
-----------------------------

Opens a new connection to the LDAP server or servers. Does not make a
connection attept (that is saved until the first command is issued).

Basically, this call will always success, but may throw an error in
the case of improper parameters. Will not return an error unless no
memory is available.


        var LDAPConnection = require("../LDAP").Connection;
        var LDAP = new LDAPConnection();
        
        if (LDAP.Open("ldap://server1.domain.com ldap://server2.domain.com", 3) < 0) {
           throw new Error("Unable to connect to server");
        }                                                

Connection.SimpleBind(dn, password, callback(msgid, err));
-----------------------------------

Authenticates to the server. When the response is ready, or the
timeout occurs, will execute the callback with the error value set.

Connection.Search(base, scope, filter, attrs, function(msgid, err, data))
---------------------------------------------

Searches LDAP within the given base for entries matching the given
filter, and returns all attrs for matching entries. To get all
available attrs, use "*".

Scopes are specified as one of the following integers:

* Connection.BASE = 0;
* Connection.ONELEVEL = 1;
* Connection.SUBTREE = 2;
* Connection.SUBORDINATE = 3;
* Connection.DEFAULT = -1;

If a disconnect or other server error occurs, the backing library will
attempt to reconnect automatically, and if this reconnection fails,
Connection.Open() will return -1.

See also "man 3 ldap" for details.


Search Example
--------------

        var LDAPConnection = require("../LDAP").Connection;
        var LDAP = new LDAPConnection();
        
        // Open a connection.
        LDAP.Open("ldap://ldap1.example.com");
        LDAP.Search("o=company", LDAP.SUBTREE, "(uid=alice)", "*", function(err, res, data) {
            switch(res) {
            case -2:
                 console.log("Timeout");
                 break;
            case -1:
                 console.log("Server gone away");
                 break;
            default:
                console.log(data[0].uid[0]);
                break;
            }                
        });

TODO:
-----
* Document Modify, Add and Rename


