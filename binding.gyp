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
      'libraries': [
        '-llber -lldap'
      ],
      'ldflags': [
        '-L/usr/local/lib'
      ],
      'conditions': [
        ['OS=="linux"', {
            'libraries': [
              '-luuid'
            ]
          }
        ],
        ['OS=="mac"', {
          "link_settings": {
            "libraries": [
              "-lldap"
            ]
          },
          'xcode_settings': {
            'OTHER_LDFLAGS': [
              '-L/usr/local/lib'
            ]
          }
         }
        ]
      ]
    }
  ]
}






