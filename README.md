ldap-client 2.X.X
===============

OpenLDAP client bindings for Node.js. Requires libraries from
http://www.openldap.org installed.

Now uses Nan to ensure it will build for all version of Node.js.

This release is a complete rewrite from 1.x.x, but remains API compatible.

NOTE: The module has been renamed to `ldap-client` as `npm` no longer accepts capital letters.


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

Node >= 0.8

Install
=======

You must ensure you have the latest OpenLDAP client libraries
installed from http://www.openldap.org

To install the latest release from npm:

    npm install ldap-client

You will also require the LDAP Development Libraries (on Ubuntu, `sudo apt-get install libldap2-dev`)


API
===

    new LDAP(options);

Options are provided as a JS object:

```js
var LDAP = require('ldap-client');

var ldap = new LDAP({
    uri:             'ldap://server',   // string
    starttls:        false,             // boolean, default is false
    connecttimeout:  -1,                // seconds, default is -1 (infinite timeout), connect timeout
    base:            'dc=com',          // default base for all future searches
    attrs:           '*',               // default attribute list for all future searches
    filter:          '(objectClass=*)', // default filter for all future searches
    scope:           LDAP.SUBTREE,      // default scope for all future searches
    reconnect:       function(),        // optional function to call when connect/reconnect occurs
    disconnect:      function(),        // optional function to call when disconnect occurs        
});

```

The reconnect handler is a good place to put a bind() call if you need one. This will rebind on every
reconnect (which is probably what you want).

ldap.open()
-----------

Deprecated. Currently, just calls the callback with no error. Feel free to omit.

```js
ldap.open(function(err) {
    if (err) {
        // will never happen
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

```js
bind_options = {
    binddn: '',
    password: ''
}
```

ldap.search()
-------------
    ldap.search(search_options, function(err, data));

Options are provided as a JS object:

```js
search_options = {
    base: '',
    scope: '',
    filter: '',
    attrs: '' // default is '*'
}
```

Scopes are specified as one of the following integers:

* LDAP.BASE = 0;
* LDAP.ONELEVEL = 1;
* LDAP.SUBTREE = 2;
* LDAP.SUBORDINATE = 3;
* LDAP.DEFAULT = -1;

List of attributes you want is passed as simple string - join their names
with space if you need more ('objectGUID sAMAccountName cname' is example of
valid attrs filter). '\*' is also accepted.

Results are returned as an array of zero or more objects. Each object
has attributes named after the LDAP attributes in the found
record(s). Each attribute contains an array of values for that
attribute (even if the attribute is single-valued - having to check typeof()
before you can act on /anything/ is a pet peeve of
mine). The exception to this rule is the 'dn' attribute - this is
always a single-valued string.

Example of search result:
```js
[ { gidNumber: [ '2000' ],
  objectClass: [ 'posixAccount', 'top', 'account' ],
  uidNumber: [ '3214' ],
  uid: [ 'fred' ],
  homeDirectory: [ '/home/fred' ],
  cn: [ 'fred' ],
  dn: 'cn=fred,dc=ssimicro,dc=com' } ]
```

Attributes themselves are usually returned as strings. There is a list of known
binary attribute names hardcoded in C++ binding sources. Those are always
returned as Buffers, but the list is incomplete so far. You can take advantage
of RFC4522 and specify attribute names in the form '\<name\>;binary' - such
attributes are returned as Buffers too. There is currently no known way to do
this for '\*' wildcard - patches are welcome (see discussion in issue #44 and
pull #58 for some ideas).

LDAP servers are usually limited in how many items they are willing to return -
1024 or 4096 are some typical values. For larger LDAP directories, you need to
either partition your results with filter, or use paged search. To get
a paged search, add the following attributes to your search request:

```js
search_options = {
    base: '',
    scope: '',
    filter: '',
    attrs: '',
    pagesize: n
}
```

The callback will be called with a new parameter: cookie. Pass this
cookie back in subsequent searches to get the next page of results:

```js
search_options = {
    base: '',
    scope: '',
    filter: '',
    attrs: '',
    pagesize: n,
    cookie: cookie
}
```

As of version 1.2.0 you can also read the rootDSE entry of an ldap server.
To do so, simply issue a read request with base set to an empty string:

```js
search_options = {
  base: '',
  scope: Connection.BASE,  // 0
  // ... other options as necessary
}
```

ldap.findandbind()
------------------

    ldap.findandbind(fb_options, function(err, data))

Options are exactly like the search options, with the addition of a
"password" attribute:

```js
fb_options = {
    base: '',
    filter: '',
    scope: '',
    attrs: '',
    password: ''
}
```

Calls the callback with the record it authenticated against as the
`data` argument.

`findandbind()` does two convenient things: It searches LDAP for
a record that matches your search filter, and if one (and only one)
result is retured, it then uses a second connection with the same
options as the primary connection to attempt to authenticate to
LDAP as the user found in the first step.

The idea here is to bind your main LDAP instance with an "admin-like"
account that has the permissions to search. Your secondary connection
can then just attempt to authenticate to it's heart's content.

`bind()` itself will change the authentication on the primary connection.

ldap.add()
----------

    ldap.add(dn, [attrs], function(err))

dn is the full DN of the record you want to add, attrs to be provided
as follows:

```js
var attrs = [
    { attr: 'objectClass',  vals: [ 'organizationalPerson', 'person', 'top' ] },
    { attr: 'sn',           vals: [ 'Smith' ] },
    { attr: 'badattr',      vals: [ 'Fried' ] }
]
```

ldap.modify()
-------------

    ldap.modify(dn, [ changes ], function(err))

Modifies the provided dn as per the changes array provided. Ops are
one of "add", "delete" or "replace".

```js
var changes = [
    { op: 'add',
      attr: 'title',
      vals: [ 'King of Callbacks' ]
    }
]
```

ldap.rename()
-------------

    ldap.rename(dn, newrdn, function(err))

Will rename the entry to the new RDN provided.

Example:

```js
ldap.rename('cn=name,dc=example,dc=com', 'cn=newname')
```

ldap.remove()
-------------

    ldap.remove(dn, function(err))

Deletes an entry.

Example:

```js
ldap.remove('cn=name,dc=example,dc=com', function(err) {
  if (err) {
    // Could not delete entry
  }
});
```

Bugs
----
Domain errors don't work properly. Domains are deprecated as of node 4,
so I don't think I'm going to track it down. If you need domain handling,
let me know.

TODO Items
----------
Basically, these are features I don't really need myself.

* Referral chasing
* Binary attribute handling
* Paged search results
* close() and friends
* test starttls
