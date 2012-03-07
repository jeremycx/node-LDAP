node-LDAP 1.0.0
===============

OpenLDAP client bindings for Node.js. Requires libraries from
http://www.openldap.org installed.

This latest version implements proper reconnects to a lost LDAP server.

Of note in this release is access to LDAP Syncrepl. With this API, you
can subscribe to changes to the LDAP database, and be notified (and
fire a callback) when anything is changed in LDAP. Use Syncrepl to
completely mirror an LDAP database, or use it to implement triggers
that perform an action when LDAP is modified.

The API is finally stable, and (somewhat) sane.


Contributing
------------

Any and all patches and pull requests are certainly welcome.

Thanks to:
----------
* Petr Běhan
* YANG Xudong
* Victor Powell

Dependencies
------------

Node >= 0.6

For < 0.6 compaibility, check out v0.4

Install
=======

You must ensure you lave the latest OpenLDAP client libraries
installed from http:///www.openldap.org

To install the 1.0.0 release from npm:

    npm install node-LDAP


API
===

    new LDAP(otions);

Creating an instance:


    var LDAP = require('LDAP');
    var ldap = new LDAP({ uri: 'ldap://my.ldap.server', version: 3});


ldap.open()
-----------

    ldap.open(callback);

Now that you have an instance, you can open a connection. This will
automatically reconnect until you close():

    ldap.open(function(err) {
        if (err) {
           throw new Error('Can not connect');
        }
        // connection is ready.

    });

ldap.simplebind()
-----------------
Calling open automatically does an anonymous bind to check to make
sure the connection is actually open. If you call simplebind(), you
will upgrade the existing anonymous bind.

ldap.search()
-------------
    ldap.search(options, callback(err, data));

Options are provided as a JS object:

    {
        base: '',
        scope: '',
        filter: '',
        attrs: ''
    }

Scopes are specified as one of the following integers:

* Connection.BASE = 0;
* Connection.ONELEVEL = 1;
* Connection.SUBTREE = 2;
* Connection.SUBORDINATE = 3;
* Connection.DEFAULT = -1;

ldap.findandbind()
------------------
A convenience function that is in here only to encourage developers to
do LDAP authentication "the right way" if possible.


Connection.searchPaged(base, scope, filter, attrs, pageSize, function(msgid, err, data) [, cookie])
---------------------------------------------------------------------------------------------------

LDAP servers are usually limited in how many items they are willing to return -
1024 or 4096 are some typical values. For larger LDAP directories, you need to
either partition your results with filter, or use paged search.

Note that it's only extension to the protocol, server doesn't have to support
it. In such case, callback will be called with nonzero err (actually, it would
be nice if someone could verify this, the server it was tested on had this
feature).

Cookie parameter is only for internal use, leave it undefined in your calls.

Results are passed to callback function as they arrive in the same format
as for simple search. Request for next page is sent only after the callback
returns. After all data has arrived, callback is called once more, with data
equal to null.


SYNCREPL API
============
TODO.



TODO:
-----
* Document Modify, Add and Rename
* Re-add paged searches
* Test cases for Modify, Add, Rename
* Testing against Microsoft Active Directory is welcomed, as I don't
have a server to test against.
