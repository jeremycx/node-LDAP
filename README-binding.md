Binding Documentation
=====================

Typically, you will require LDAP.js and use the convenience
library. This file documents the binding itself, in case you need
direct access to the OpenLDAP library.

Open(uri)
------
Open() calls ldap_initialize, which parses the URI, allocates any
memory required, but does not try to connect. The first command sent
will start up the connection.

This first command may block until the connection is made, or the
timeout occurs. This is potentially pretty disatrous, I admit.

Open() will throw an exception if the URI isn't formatted properly, or
some other unrecoverable error occurs.

To get failover, you may provide a list of LDAP URIs, separated by
spaces or commas.

Command()
--------
The following commands are available:

* Serarch(base, scope, filter, attrs)
* Bind(binddn, password)
* Add(dn, attrs)
* Modify(dn. mods)

Each of these commands returns a msgid for matching up responses, or
-1 in the case of an error.

They may also throw an exception if the parameters are incorrect.

Retrying the server connection is automatic with each subsequent
command issued, and will (unfortunately) block until the connection
times out. This is certainly suboptimal, but the solutions are not
trivial. This should only become an issue if the LDAP server becomes
completely unresponsive.

In the case the server connection has gone away, the commands will
return a -1, and the binding itself will emit the "disconnected" event.

When the response to the command is available, the server emits either
a "result" event, or a "searchresult" event, with the message id and
the resulting data as parameters.

