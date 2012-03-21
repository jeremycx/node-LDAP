var attributes = {};
var objectclasses = {};

var re_main = /(?:[^\(]*\( *)(.+)(?: \))/;
var re_tokenize = /[\w\.-:]+|'(?:\\'|[^'])+'/g;
var re_quotedstring = /(?:')([^'\\]*(?:\\.[^'\\]*)*)/;
var is_oid = /[0-9\.]+/;
var is_keyword = /(NAME|DESC|X-ORDERED|EQUALITY|OBSOLETE|SUP|ABSTRACT|STRUCTURAL|AUXILIARY|MUST|MAY|SINGLE-VALUE|NO-USER-MODIFICATION|SYNTAX|ORDERING|SUBSTR|COLLECTIVE)/;

function parse(result, entry) {
    var x;
    var keyword;

    try {
        var items = entry.match(re_main)[1].match(re_tokenize);
        items.forEach(function(item) {
            if ((x = item.match(is_keyword)) && x[0]) {
                keyword = x[0].toLowerCase().replace(/-/, '');
                result[keyword] = true;
            } else if ((x = item.match(is_oid)) && !keyword) {
                result.oid = item;
            } else {
                // we're a value.. let's clean it up.
                if (item[0] == '\'') {
                    item = item.match(re_quotedstring)[1];
                } else if (item[0] == '(') {
                    item = item.split(/ /);
                }

                switch(typeof result[keyword]) {
                case 'boolean':
                    result[keyword] = item;
                    break;
                case 'string':
                    result[keyword] = [ result[keyword] ];
                    // nobreak - fall through
                case 'object':
                    result[keyword].push(item);
                    break;
                case 'undefined':
                    break;
                default:
                    result[keyword] = item;
                    break;
                }
            }
        });
        
    } catch (e) {
        console.log(e);
    }
    if (result.name && typeof result.name != 'object') {
        result.name = [ result.name ];
    }
    if (result.may && typeof result.may != 'object') {
        result.may = [ result.may ];
    }
    if (result.must && typeof result.must != 'object') {
        result.must = [ result.must ];
    }

    return;
}

function ObjectClass(str) {
    var must = {};
    var may = {};

    parse(this, str);
    
    for (var i in this.must) {
        var attrname = this.must[i];
        if (attributes[attrname]) {
            must[attrname] = attributes[attrname];
        }
    }
    for (var i in this.may) {
        var attrname = this.may[i];
        if (attributes[attrname]) {
            may[attrname] = attributes[attrname];
        }
    }
    
    this.muststr = this.must; // used for looping - so we know what name this oc uses for a given attr
    this.maystr = this.may;
    this.must = must;
    this.may = may;

    return this;
}

function Attribute(str) {
    parse(this, str);
    return this;
}

module.exports = function(ldap, opt) {
    // dummy for init_attr;
    var init_attr = function() {
        return;
    }

    // dummy for init_obj
    // which is cheaper: calling a dummy func, or  "if (func) func();" ?
    var init_obj = function() {
        return;
    }

    function getAllAttributes() {
        return attributes;
    }

    function getAllObjectClasses() {
        return objectclasses;
    }

    function getAttributesForRec(data) {
        var res = [];

        if (!data || !data.objectClass) {
            return undefined;
        }
        data.objectClass.forEach(function(oc) {
            var obj = getObjectClass(oc);
            if (obj) {
                if (obj.must) {
                    res = res.concat(obj.must);
                }
                if (obj.may) {
                    res = res.concat(obj.may);
                }
            }
        });
        return res;
    }

    function getUniqueAttributes(rec) {
        var res = {};

        if (!rec) return undefined;
        
        for (var i in rec.objectClass) {
            var oc = objectclasses[rec.objectClass[i]];
            if (oc.muststr) {
                oc.muststr.forEach(function(attr) {
                    res[attr] = attributes[attr];
                });
            }
            if (oc.maystr) {
                oc.maystr.forEach(function(attr) {
                    res[attr] = attributes[attr];
                });
            }
        }
        return res;
    }

    function getObjectClass(name) {
        return objectclasses[name];
    }

    function getAttribute(name) {
        return attributes[name];
    }

    if (!opt) opt = {};

    if (typeof opt.init_attr == 'function') {
        init_attr = opt.init_attr;
    }
    if (typeof opt.init_obj == 'function') {
        init_obj = opt.init_obj;
    }

    ldap.search({
        base: 'cn=subSchema',
        filter: '(objectClass=subschema)',
        attrs: 'attributeTypes objectClasses',
        scope: ldap.BASE
    }, function(err, data) {
        if (err) {
            throw err;
        }
        data.forEach(function(schemaentry) {
            schemaentry.attributeTypes.forEach(function (attr) {
                var a = new Attribute(attr);
                a.name.forEach(function(n) {
                    attributes[n] = a;
                });
                init_attr(a);
            });
        });

        // now all the attributes have been collected.
        data.forEach(function(schemaentry) {
           schemaentry.objectClasses.forEach(function (oc) {
                var a = new ObjectClass(oc);
                a.name.forEach(function(n) {
                    objectclasses[n] = a;
                });
               init_obj(a);
            });
        });
        // call the callback
        if (typeof opt.ready == 'function') {
            opt.ready();
        };
    });

    this.getObjectClass = getObjectClass;
    this.getAttribute = getAttribute;
    this.getAttributesForRec = getAttributesForRec;
    this.getUniqueAttributes = getUniqueAttributes;
    this.getAllObjectClasses = getAllObjectClasses;
    this.getAllAttributes = getAllAttributes;
}
