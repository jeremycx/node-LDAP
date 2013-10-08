var attributes = {};
var objectclasses = {};

var re_main = /(?:[^\(]*\( *)(.+)(?: \))/;
var re_tokenize = /[\w\.\-:\{\}]+|'(?:\\'|[^'])+'/g;
var re_quotedstring = /(?:')([^'\\]*(?:\\.[^'\\]*)*)/;
var is_oid = /[0-9\.]+/;
var is_keyword = /(NAME|DESC|X\-ORDERED|USAGE|EQUALITY|OBSOLETE|SUP|ABSTRACT|STRUCTURAL|AUXILIARY|MUST|MAY|SINGLE\-VALUE|NO\-USER\-MODIFICATION|SYNTAX|ORDERING|SUBSTR|COLLECTIVE|X\-ORDERED\-VALUES)/;

function parseSchema(entry) {
    var self = this;
    var x;
    var keyword;
    try {
        var items = entry.match(re_main)[1].match(re_tokenize);
        items.forEach(function(item) {
            if ((x = item.match(is_keyword)) && x[0]) {
                keyword = x[0].toLowerCase().replace(/-/, '');
                self[keyword] = true;
            } else if ((x = item.match(is_oid)) && !keyword) {
                self.oid = item;
            } else {
                // we're a value.. let's clean it up.
                if (item[0] == '\'') {
                    item = item.match(re_quotedstring)[1];
                } else if (item[0] == '(') {
                    item = item.split(/ /);
                }

                switch(typeof self[keyword]) {
                case 'boolean':
                    self[keyword] = item;
                    break;
                case 'string':
                    self[keyword] = [ self[keyword] ];
                    // nobreak - fall through
                case 'object':
                    self[keyword].push(item);
                    break;
                case 'undefined':
                    break;
                default:
                    self[keyword] = item;
                    break;
                }
            }
        });

    } catch (e) {
        console.log(e);
    }

    return;
}

function ObjectClass(str) {
    this.attributes = {};
    this.parse(str);

    if (!this.must) {
        this.must = [];
    } else if (typeof this.must != 'object') {
        this.must = [ this.must ];
    }
    if (!this.may) {
        this.may = [];
    } else if (typeof this.may != 'object') {
        this.may = [ this.may ];
    }
    if (!this.name) {
        this.name = [];
    } else if (typeof this.name != 'object') {
        this.name = [ this.name ];
    }

    for (var i in this.must) {
        var attrname = this.must[i];
        if (attributes[attrname]) {
            this.attributes[attrname] = attributes[attrname];
        }
    }
    for (var i in this.may) {
        var attrname = this.may[i];
        if (attributes[attrname]) {
            this.attributes[attrname] = attributes[attrname];
        }
    }
    return this;
}
ObjectClass.prototype.parse = parseSchema;

function Attribute(str) {
    this.parse(str);
    if (!this.name) {
        this.name = [];
    } else if (typeof this.name != 'object') {
        this.name = [ this.name ];
    }
    return this;
}
Attribute.prototype.parse = parseSchema;

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
