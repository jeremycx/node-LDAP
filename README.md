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

    ldap.open(function(err));

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

    ldap.simplebind(bind_options, function(err));

Options are binddn and password:

    bind_options = {
        binddn: '',
        password: ''
    }

ldap.search()
-------------
    ldap.search(search_options, function(err, data));

Options are provided as a JS object:

    search_options = {
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

Results are returned as an array of zero or more objects. Each object
has attributes named after the LDAP attributes in the found
record(s). Each attribute contains an array of values for that
attribute (even if the attribute is single-valued - having to check typeof()
before you can act on /anything/ is a pet peeve of
mine). The exception to this rule is the 'dn' attribute - this is
always a single-valued string.

      [ { gidNumber: [ '2000' ],
        objectClass: [ 'posixAccount', 'top', 'account' ],
        uidNumber: [ '3214' ],
        uid: [ 'fred' ],
        homeDirectory: [ '/home/fred' ],
        cn: [ 'fred' ],
        dn: 'cn=fred,dc=ssimicro,dc=com' } ]

ldap.findandbind()
------------------
A convenience function that is in here only to encourage developers to
do LDAP authentication "the right way" if possible.

    ldap.findandbind(fb_options, function(err, data))

Options are exactly like the search options, with the addition of a
"password" attribute:

    fb_options = {
        base: '',
        filter: '',
        scope: '',
        attrs: '',
        password: ''
    }

Calls the callback with the record it authenticated against.

ldap.add()
----------

    ldap.add(dn, [attrs], function(err))

dn is the full DN of the record you want to add, attrs to be provided
as follows:

    [
        { attr: 'objectClass',  vals: [ 'organizationalPerson', 'person', 'top' ] },
        { attr: 'sn',           vals: [ 'Smith' ] },
        { attr: 'badattr',      vals: [ 'Fried' ] }
    ]

ldap.modify()
-------------

    ldap.modify(dn, [ changes ], function(err))

Modifies the provided dn as per the changes array provided.

    [
        { op: 'add', 
          attr: 'title', 
          vals: [ 'King of Callbacks' ] 
        }
    ]

ldap.rename()
-------------

    ldap.rename(dn, newrdn, function(err))

Will rename the entry to the new RDN provided.

Example:

    ldap.rename('cn=name,dc=example,dc=com', 'cn=newname')


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

If you are connecting to an LDAP server with syncrepl overlay enabled,
you can be notified of updates to the LDAP tree. Begin by connecting,
then issue the ldap.sync() command:

    ldap.sync(options)

The options are as follows:

    {
        base: '',
        scope: ldap.SUBTREE,
        filter: '(objectClass=*)',
        attrs: '* +',
        rid: '000',
        cookie: '',
        newcookie: function(cookie),
        syncrefresh: function(entryUUIDs, deletes),
        syncrefreshdone: function(),
        syncentry: function(data)
    }

The cookie attribute is used to send a cookie to the server to ensure
sync continues where you last left off.

The rid attribute is required, and should be set to a unique value for
the server you are syncing to.

The function callbacks are called upon initial refresh, and as new
data is available.

newcookie(cookie)
-----------------

This callback fires whenever the server sends a new cookie. You should
store this cookie somewhere for use in later reconnects.

syncrefresh(entryUUIDs, deletes)
--------------------------------

This callback fires during the initial sync. It will include an array
of UUIDs that are either to be deleted from the local DB, or a list of
UUIDs that are to be kept in the local DB (whichever list is shorter).

NOTE: this may be handled incorrectly, but I haven't seen OpenLDAP
2.4.29 do anything but pass entryUUIDs back during the inital refresh stage.

syncrefreshdone()
-----------------

This callback is fired when the refresh phase is done. This is where
you take the UUIDs provided by syncrefresh and add/delete the entries
from the local DB.

syncentry(data)
---------------
As records are added/modified/removed from LDAP, the records are
passed to this callback. The entries have two additional single-valued
attributes attached: _syncUUID and _syncState. These two attributes
notify the callback what should be done with the record.


TODO:
-----
* Document Modify, Add and Rename
* Re-add paged searches
* Test cases for Modify, Add, Rename
* Testing against Microsoft Active Directory is welcomed, as I don't
have a server to test against.
