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
        'LDAP_DEPRECATED',      
        'LJSDEBUG'
      ],
      'cflags': [
        '-Wall',
        '--verbose',
        '-g'
      ],
      'ldflags': [
        '-L/usr/local/lib',
        '-lldap'
      ],
    }
  ]
}






