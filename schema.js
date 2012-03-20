var fs = require('fs');

var schema_raw = [];

schema_raw = schema_raw.concat(JSON.parse(fs.readFileSync(__dirname + '/schema/default.schema')));
schema_raw = schema_raw.concat(JSON.parse(fs.readFileSync(__dirname + '/schema/nonstandard.schema')));

var ObjectClass = function(obj, lookup_fn) {
    var must = {};
    var may = {};
    var all = {};
    var attr;

    for (var i in obj) {
        if (obj.hasOwnProperty(i)) {
            this[i] = obj[i];
        }
    }

    if (obj.must) {
        obj.must.forEach(function(attrname) {
            attr = lookup_fn(attrname);
            must[attrname] = attr;
            all[attrname] = attr;
        });
    }
    if (obj.may) {
           obj.may.forEach(function(attrname) {
            attr = lookup_fn(attrname);
            may[attrname] = attr;
            all[attrname] = attr;
           });
    }


    // adds attributes that aren't already in the accum
    function mergeAttributes(accum) {
        for (var i in this.all) {
            accum[i] = this.all[i];
        }
    }

    this.all = all;
    this.must = must;
    this.may = may;
    this.mergeAttributes = mergeAttributes;
}

var Attribute = function(obj) {
    for (var i in obj) {
        if (obj.hasOwnProperty(i)) {
            this[i] = obj[i];
        }
    }
}

module.exports = function(opt) {
    var schema;
    var customschema = undefined;

    // dummy for init_attr;
    var init_attr = function() {
        return;
    }

    // dummy for init_ibj
    var init_obj = function() {
        return;
    }
    
    if (!opt) opt = {};

    if (typeof opt.customschema == 'string') {
        customschema = [ opt.customschema ];
    } else if (typeof opt.customschema == 'object') {
        customschema = opt.customschema;
    }

    customschema.forEach(function(file) {
        schema_raw = schema_raw.concat(JSON.parse(fs.readFileSync(file)));
    });

    if (typeof opt.init_attr == 'function') {
        init_attr = opt.init_attr;
    }
    if (typeof opt.init_obj == 'function') {
        init_obj = opt.init_obj;
    }

    initSchema();

    function initSchema() {
        schema = {
            objectclasses: {},
            attributes: {}
        }
        schema_raw.forEach(function(item) {
            if (item.type == 'ATTRIBUTE') {
                item.name.forEach(function(name) {
                    schema.attributes[name] = new Attribute(item);
                    init_attr(schema.attributes[name]);
                });
            }
        });
        // attrs loaded. Second pass for ObjClass
        schema_raw.forEach(function(item) {
            var tmp;
            if (item.type == 'OBJECTCLASS') {
                schema.objectclasses[item.name] = new ObjectClass(item, getAttribute);
                init_obj(schema.objectclasses[item.name]);
            }
        });
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

    function mergeHelper(helper) {
        for (var i in helper.attrs) {
            var attr = getAttribute(i);
            if (attr) {
                for (var j in helper.attrs[i]) {
                    attr[j] = helper.attrs[i][j];
                }
            }
        }
    }

    function getObjectClass(name) {
        if (schema.objectclasses[name]) {
            return schema.objectclasses[name];
        }
        return undefined;
    }

    function getAttribute(name) {
        if (schema.attributes[name]) {
            return schema.attributes[name];
        }
        return undefined;
    }

    function getUniqueAttributes(rec) {
        var res = {};

        if (!rec) return undefined;
        
        for (var i in rec.objectClass) {
            var oc = getObjectClass(rec.objectClass[i]);
            if (oc) oc.mergeAttributes(res);
        }
        return res;
    }

    function getAllAttributes() {
        return schema.attributes;
    }

    function getAllObjectClasses() {
        return schema.objectclasses;
    }


    this.getObjectClass = getObjectClass;
    this.getAttribute = getAttribute;
    this.getAttributesForRec = getAttributesForRec;
    this.getUniqueAttributes = getUniqueAttributes;
    this.getAllObjectClasses = getAllObjectClasses;
    this.getAllAttributes = getAllAttributes;
}