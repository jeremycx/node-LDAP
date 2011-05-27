var LDAP = require('../LDAP');
var cnx = new LDAP.Connection();

// these tests are all run against a live openLDAP database.
// this is for module development only - not to be run automatically

cnx.maxconnectretries = 3;
cnx.retrywait = 100;

function test_connect() {
    cnx.open("ldap://localhost:1234", function(err) {
        if (err) {
            throw(err);
        } else {
            log("Connect");
            test_search();
        }
    }); 
}

function test_search() {
    cnx.search("dc=sample,dc=com", "(cn=Manager)", "*", function(err, res) {
        if (err) {
            throw(err);
        }
        if (res[0].cn[0] != "Manager") {
            throw new Error("Results look weird");
        }
        log("Search");
        test_search_fail();
    });
}

function test_search_fail() {
    cnx.search("dc=sample,dc=com", "(cn=xManager)", "*", function(err, res) {
        if (res.length == 0) {
            log("NullSearch");
            test_auth_fail();
        } else {
            throw(new Error("No error where error expected"));
        }
    });
}

function test_auth_fail() {
    cnx.authenticate("cn=Manager,dc=sample,dc=com", "aaaaaaa", function(err) {
        if (err) {
            log("Auth Fail");
            test_auth();
        } else {
            throw(new Error("No error where error expected"));
        }
    });
}

function test_auth() {
    cnx.authenticate("cn=Manager,dc=sample,dc=com", "secret", function(err) {
        if (err) {
            throw err;
        }
        log("Auth");
        test_add();
    });
}

function test_add() {
    cnx.add("cn=Barbara Jensen,dc=sample,dc=com", [
        { type: "objectClass",
          vals: ["person"]},
        { type: "cn",
          vals: ["Barbara Jensen", "Babs Jensen"] },
        { type: "sn",
          vals: ["Jensen"]}
    ],
            function(err) {
                if (err) {
                    log("Add", true);
                    throw(err);
                }
                test_search_add();
            });
}

function test_search_add() {
    cnx.search("dc=sample,dc=com", "cn=Babs Jensen", "*", function(err, res) {
        if (err) {
            throw(err);
        }
        if (res.length == 1) {
            log("Search after add");
        } else {
            throw new Error("No results from search where results expected");
        }
        search_after_disconnect();
    });
}

function search_after_disconnect() {
    setTimeout(function() {
        cnx.search("dc=sample,dc=com", "cn=Babs Jensen", "*", function(err, res) {
            if (err) {
                throw new Error("Search after disconnect");
            } 
            log("Search after disconnect");
            done();
        });
    }, 10000);
}


function done() {
    cnx.close();
    log("Finish");


}

function log(msg, status) {
    if (!status) {
        console.log(msg + " [OK]");
    } else {
        console.log(msg + " [FAIL]");
    }
}


test_connect();