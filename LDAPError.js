/*jshint globalstrict:true, node:true, trailing:true, mocha:true unused:true */

'use strict';

module.exports = function LDAPError(message) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
};

require('util').inherits(module.exports, Error);
