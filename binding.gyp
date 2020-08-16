{
    "targets": [
        {
            "target_name": "LDAPCnx",
            "sources": [ "LDAP.cc", "LDAPCnx.cc", "LDAPCookie.cc", 
              "LDAPSASL.cc", "LDAPXSASL.cc", "SASLDefaults.cc" ],
            "include_dirs" : [
 	 	"<!(node -e \"require('nan')\")",
                "/usr/local/include"
	    ],
            "defines": [
                "LDAP_DEPRECATED"
            ],
            "ldflags": [
                "-L/usr/local/lib"
            ],
            "cflags": [
                "-Wall",
                "-g"
            ],
            "conditions": [
                [ "SASL==\"n\"", { "sources!": 
                  ["LDAPSASL.cc", "SASLDefaults.cc"] } ], 
                [ "SASL==\"y\"", { "sources!": ["LDAPXSASL.cc"] } ],
		['OS=="linux" and NODE_VERSION > 9', {
		    "libraries": [ "../deps/libldap.a", "../deps/liblber.a", "-lresolv", "-lsasl2" ],
                    "include_dirs": [ "deps/include" ]
		}, {
		    "libraries": [ "-lldap" ]
		}]
            ]
        }
    ],
    "variables": {
      "SASL": "<!(test -f /usr/include/sasl/sasl.h && echo y || echo n)",
      "NODE_VERSION": "<!(node --version | cut -d. -f1 | cut -dv -f2)"
    },
    "conditions": [
        [
            "OS==\"mac\"",
            {
                "link_settings": {
                    "libraries": [
                        "-lldap"
                    ]
                },
                "xcode_settings": {
                    'OTHER_LDFLAGS': [
                        '-L/usr/local/lib'
                    ]
                }
            }
        ]
    ]
}

