node-ldap
=========

OpenLDAP client bindings for [Node.js]. A good start, but not, as of
this writing, production quality. The API will change slightly over
the next week or two.

Contributing
------------

This module works, but is not yet ready for production. It is being
made available at this early stage to funnel contributors who may
otherwise begin their own module in parallel. Any and all patches are
certainly welcome.

Dependencies
------------

Tested with Node v0.2.3.

To build, ensure the OpenLDAP client libraries are installed, and

   node-waf configure build

Search Example
--------------

        var LDAP = require("LDAP");
        var lconn = new LDAP.Connection();
        
        // Open a connection. Returns immediately (connects when required)
        lconn.Open("ldap://ldap1.example.com,ldap://ldap2.example.com");

        lconn.Search("o=company", "(uid=alice)", function(res) {
            console.log(res[0].uid[0]);
        }); 

Authenticate Example
--------------------

        var LDAP = require("LDAP");
        var lconn = new LDAP.Connection();

        // Open a connection. Returns immediately (connects when required)
        lconn.Open("ldap://ldap1.example.com,ldap://ldap2.example.com");

        lconn.Authenticate("cn=alice,o=company", "seCretStuff", function(res) {
            // authenticated. Try a search.
           lconn.Search("o=company", "uid=bob", function(res) {
           console.log("Bob is "+res[0].cn[0]);
        });                                        

Authenticate with Search
------------------------

        var LDAP = require("LDAP");
        var lconn = new LDAP.Connection();

        // Open a connection. Returns immediately (connects when required)
        lconn.Open("ldap://ldap1.example.com,ldap://ldap2.example.com");

        lconn.SearchAuthenticate("o=comapny", "(uid=alice)", "seCretStuff",
                         function(res, dn) {
            console.log(res[0].uid[0] + " authenticated. User dn: " + res[0].dn);
        });


TODO:
-----

* Close() currenlty does nothing.
* Search() needs to accept a list of attributes to return.
* Need error callbacks on all methods.
* Need better server-disconnect handling (currently all inflight
  queries get lost).
* proper packaging required, with package.json and all that goodness.
