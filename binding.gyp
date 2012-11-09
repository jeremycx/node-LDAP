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
        '--verbose'
      ],
      'ldflags': [
        '-L/usr/local/lib',
        '-lldap',
        '--verbose'
      ],
    }
  ]
}






