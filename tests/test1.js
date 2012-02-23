var LDAP = require('../LDAP');
var ldap = new LDAP({ uri: 'ldap://64.247.130.65', version: 3);

ldap.maxconnectretries = 3;
ldap.retrywait = 10;

ldap.open(function(err) {
    console.log(err?err:"Opened");
    setInterval(function() {
        ldap.search({
            base: 'dc=meetonline,dc=ssi',
            scope: ldap.SUBTREE,
            filter: '(objectclass=*)',
            attrs: '*'
        }, function(err, data) {
            console.log(err?('Search error:'+err.message+'/'+err.msgid):data.length);
        });
    }, 5000);
});
