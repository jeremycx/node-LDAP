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
            "libraries": [
                "-lldap"
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
                [ "SASL==\"y\"", { "sources!": ["LDAPXSASL.cc"] } ]
            ]
        }
    ],
    "variables": {
      "SASL": "<!(test -f /usr/include/sasl/sasl.h && echo y || echo n)"
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

