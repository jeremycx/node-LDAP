var LDAPConnection = require("./LDAP").Connection
	, LDAP = new LDAPConnection()
	, util = require('util')

if (LDAP.open("ldap://localhost", 3) < 0) {
	throw new Error("Unable to connect to server");
}
LDAP.search("dc=example,dc=com", LDAP.SUBTREE, "(objectclass=*)", "*", function(msgid, err, data) {
	if(!err){
		console.log(data);
		LDAP.close();
	}else{
		console.log('there was an error: ');
		throw err;
	}
});