node-ldap
=========

OpenLDAP client bindings for Node.js. A good start, but not, as of
this writing, production quality. The API is mostly stable at this point.

Current Notes
-------------
This is back in active development again. Expect much churn for the
next couple of weeks (or until this notice goes away).

Contributing
------------

This module works, but is not yet ready for production. It is being
made available at this early stage to funnel contributors who may
otherwise begin their own module in parallel. Any and all patches and
pull requests are certainly welcome.

Thanks to:
* Petr Běhan
* YANG Xudong


Dependencies
------------

Tested with Node >= v0.4.0

Installation
------------

To build, ensure the OpenLDAP client libraries are installed, and

   npm install https://github.com/jeremycx/node-LDAP/tarball/master -g

Search Example
--------------

        var LDAP = require("LDAP");
        var cnx = new LDAP.Connection();
        
        // Open a connection.
        cnx.open("ldap://ldap1.example.com",
            function() {
                cnx.search("o=company", "(uid=alice)","*",function(err, res) {
                console.log(res[0].uid[0]);
             });
        });

Authenticate Example
--------------------

        var LDAP = require("LDAP");
        var cnx = new LDAP.Connection();

        // Open a connection. 
        cnx.open("ldap://ldap1.example.com",
            function() {
                cnx.authenticate("cn=alice,o=company", "seCretStuff", function(err, res) {
                    // authenticated. Try a search.
                    cnx.search("o=company", "(uid=bob)", "*", function(res) {
                        console.log("Bob has a cn of "+res[0].cn[0]);
                    });                                        
                });
             });


The tests directory can be skimmed for more usage examples.


TODO:
-----
* Document Modify, Add and Rename


