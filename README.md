node-LDAP 1.2.0
===============

OpenLDAP client bindings for Node.js. Requires libraries from
http://www.openldap.org installed.

Now uses Nan to ensure it will build for all version of Node.js.

This release is a complete rewrite, it's much more stable than the 1.X.X release.


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

    npm install LDAP

If this fails, please ensure you have uuid.h available (on Ubuntu,
install the uuid-dev package).

You will also require the LDAP Development Libraries (on Ubuntu, `sudo apt-get install libldap2-dev`)


API
===

    new LDAP(options);

Options are provided as a JS object:

```js
var options = {
    uri: 'ldap://my.ldap.server', // string
    version: 3, // integer, default is 3,
    starttls: false, // boolean, default is false
    connecttimeout: -1, // seconds, default is -1 (infinite timeout), connect timeout
    timeout: 5000, // milliseconds, default is 5000 (infinite timeout is unsupported), operation timeout
    reconnect: true, // boolean, default is true,
    backoffmax: 32 // seconds, default is 32, reconnect timeout
};
```

ldap.open()
-----------

    ldap.open(function(err));

Now that you have an instance, you can open a connection. This will
automatically reconnect until you close():

```js
ldap.open(function(err) {
    if (err) {
       throw new Error('Can not connect');
    }
    // connection is ready.

});
```

You can disable the automatic reconnect by setting the `reconnect`
option to false.

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
A convenience function that is in here only to encourage developers to
do LDAP authentication "the right way" if possible.

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

Calls the callback with the record it authenticated against.

Note: since findandbind leaves the connection in an authenticated
state, you probably don't want to do a findandbind with a general
purpose instance of this library, as you would be sending one user's
queries on the authenticated connection of the last user to log
in. Depending on your configuration, this may not even be an issue,
but you should be aware.

Did someone say that asyncronous programming wasn't perilous?

There are three obvious solutions to this problem:

* Use two instances of this library (and thus two TCP connections) -
  one for authenication binds, and the other for general purpose use
  (which may be pre-bound as admin or some other suitably priveleged
  user). You are then completely in charge of authorization (can this
  user edit that user?).

* Create a new instance for each authenticated user, and reconnect
  that user to their own instance with each page load. The advantage of
  this strategy is you can then rely on LDAP's authorization systems
  (slapd then decides what each user can and can't do).

* Create, bind, and close a connection for each user's initial visit, and
  use cookies and session trickery for subsequent visits.

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
