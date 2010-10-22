var LDAPConnection = require("./LDAPConnection").Connection;
var fs = require('fs');

var l = new LDAPConnection();
var l2 = new LDAPConnection();
var x = 0;

l.Open("ldaps://foo.bar.nobody:838,ldap://boilermaker.ssimicro.com");

//l.SearchAuthenticate("dc=ssi", "uid=jseremyc", "AZIZlight", function(success, who) {
//    if (success) {
//        console.log("Auth success "+who);
//    } else {
//        console.log("Auth FAIL");
//    }
//});

function status() {
    console.log("Recd "+x+" replies");
}

setTimeout("status()", 10000);
                    
fs.readFile('sn.txt', function (err, data) {
    if (err) throw err;
    var list = JSON.parse(data);
    var allUsers = new Array();

    for (foo in list) {
        l.Search("dc=ssi", "(wirelessName="+list[foo]+")", function(res) {
            allUsers.push(res);
            x++;
        });
    }
    l.Search("dc=ssi", "uid=jeremyc", function(res) {
        console.log("Done last");
        console.log("Done. Retrieved " + allUsers.length);
    });
});