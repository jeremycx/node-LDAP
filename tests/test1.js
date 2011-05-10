var LDAP = require('../LDAP');
var cnx = new LDAP.Connection();

cnx.maxconnectretries = 3;
cnx.retrywait = 10;

function test1() {
    cnx.open("ldap://localhost:43241", function(err) {
        if (err) {
            console.log("Got : "+ err + " [OK]")
            test2();
        } else {
            throw(err);
        }
    });
}

function test2() {
   cnx.open("ldap://no.lookup:43241", function(err) {
        if (err) {
            console.log("Got : "+ err + " [OK]")            
            test3();
        } else {
            throw(err);
        }
    });
}

function test3() {
   cnx.open("ldap://localhost:34524,ldap://no.lookup:43241", function(err) {
        if (err) {
            console.log("Got : "+ err + " [OK]");
            cnx.close(); //OK to close, even though the connection is not open
        } else {
            throw(err);
        }
    });
}

test1();