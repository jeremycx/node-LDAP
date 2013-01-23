{
  "targets": [
    {  
      'target_name': 'LDAP',
      'sources': [ 
        'src/LDAP.cc' 
      ],
      'include_dirs': [ 
        '/usr/local/include'
      ],
      'defines': [
        'LDAP_DEPRECATED'
      ],
      'cflags': [
        '-Wall',
        '-g'
      ],
      'ldflags': [
        '-L/usr/local/lib',
        '-lldap',
        '-lber'
      ],
      'conditions': [
        ['OS=="linux"', {
            'ldflags': [
              '-luuid'
            ]
          }
        ],
        ['OS=="mac"', {
          "link_settings": {
            "libraries": [
              "-lldap"
            ]
          }
         }
        ]
      ]   
    }
  ]
}






