{
    "targets": [
        {
            "target_name": "LDAPCnx",
            "sources": [ "LDAP.cc", "LDAPCnx.cc" ],
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

        }
    ],
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
                    
   
