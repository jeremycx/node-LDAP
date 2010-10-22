node-ldap
=========

OpenLDAP client bindings for [Node.js].

Dependencies
------------

Tested with Node v0.2.3.

To build, ensure the OpenLDAP client libraries are installed.

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

Close() currenlty does noting.
