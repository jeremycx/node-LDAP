var fs = require('fs');

var schema_raw = [];

var schema;

schema_raw = schema_raw.concat(JSON.parse(fs.readFileSync('schema/default.schema')));
schema_raw = schema_raw.concat(JSON.parse(fs.readFileSync('schema/nonstandard.schema')));

function initSchema() {
    schema = {
        objectclasses: {},
        attributes: {}
    }
    schema_raw.forEach(function(item) {
        if (item.type == 'ATTRIBUTE') {
            item.name.forEach(function(name) {
                schema.attributes[name] = item;
            });
        } else if (item.type == 'OBJECTCLASS') {
            schema.objectclasses[item.name] = item;
        }
    });
}


module.exports = function(customschemafiles, customhelperfiles) {
    var schema = schema;

    // TODO: merge in custom files provided during instantiation

    initSchema();

    function getObjectClass(name) {
        if (schema.objectclasses[name]) {
            return schema.objectclasses
        }
        return undefined;
    }

    function getAttribute(name) {
        if (schema.attributes[name]) {
            return schema.attributes[name];
        }
    }

    function getAttributesForObjectClass(name) {
        var obj;
        var attrs = [];

        if (obj = getObjectClass(name)) {
            attrs = attrs.concat(obj.must);
            attrs = attrs.concat(obj.may);
            return atrts;
        } else {
            return undefined;
        }
    }


    this.getObjectClass = getObjectClass;
    this.getAttribute = getAttribute;
    this.getAttributesForObjectClass = getAttributesForObjectClass;
}