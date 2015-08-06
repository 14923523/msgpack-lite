// encode.js

exports.Encoder = Encoder;

var BufferLite = require("./buffer-lite");

var BUFFER_LENGTH = 8192;
var NO_ASSERT = true;

function Encoder(opts) {
  if (!(this instanceof Encoder)) return new Encoder(opts);
  if (opts && opts.push) this.push = opts.push.bind(opts);
}

Encoder.prototype.flush = function(length) {
  if (this.offset) {
    this.push(this.buffer.slice(0, this.offset));
    this.buffer = null;
  }
  if (length < BUFFER_LENGTH) length = 0;
  if (!this.buffer || length) {
    this.buffer = new Buffer(length || BUFFER_LENGTH);
  }
  this.offset = 0;
};

Encoder.prototype.write = function(buffer) {
  var end = this.offset + buffer.length;
  if (end >= BUFFER_LENGTH) {
    this.flush();
    this.push(buffer);
  } else {
    buffer.copy(this.buffer, this.offset);
    this.offset = end;
  }
};

var token = {};

init();

var types = {
  undefined: token[0xc0],
  boolean: boolean,
  number: number,
  string: string,
  object: object
};

Encoder.prototype.encode = function(chunk, encoding, callback) {
  if (!this.buffer) this.flush();
  var res = this.encode1(chunk);
  this.flush();
  if (callback) callback();
  return res;
};

Encoder.prototype.encode1 = function(value) {
  var type = typeof value;
  var func = types[type];
  if (!func) throw new Error("Unknown type: " + type);
  return func.call(this, value);
};

function init() {
  // positive fixint -- 0x00 - 0x7f
  // nil -- 0xc0
  // false -- 0xc2
  // true -- 0xc3
  // negative fixint -- 0xe0 - 0xff
  for (var i = 0x00; i <= 0xFF; i++) {
    token[i] = write0(i);
  }

  // bin 8 -- 0xc4
  // bin 16 -- 0xc5
  // bin 32 -- 0xc6
  token[0xc4] = write1(0xc4);
  token[0xc5] = write2(0xc5);
  token[0xc6] = write4(0xc6);

  // ext 8 -- 0xc7
  // ext 16 -- 0xc8
  // ext 32 -- 0xc9
  token[0xc7] = write1(0xc7);
  token[0xc8] = write2(0xc8);
  token[0xc9] = write4(0xc9);

  // float 32 -- 0xca
  // float 64 -- 0xcb
  token[0xca] = writeN(0xca, 4, Buffer.prototype.writeFloatBE);
  token[0xcb] = writeN(0xcb, 8, Buffer.prototype.writeDoubleBE);

  // uint 8 -- 0xcc
  // uint 16 -- 0xcd
  // uint 32 -- 0xce
  // uint 64 -- 0xcf
  token[0xcc] = write1(0xcc);
  token[0xcd] = write2(0xcd);
  token[0xce] = write4(0xce);
  token[0xcf] = write8(0xcf);

  // int 8 -- 0xd0
  // int 16 -- 0xd1
  // int 32 -- 0xd2
  // int 64 -- 0xd3
  token[0xd0] = write1(0xd0);
  token[0xd1] = write2(0xd1);
  token[0xd2] = write4(0xd2);
  token[0xd3] = write8(0xd3);

  // str 8 -- 0xd9
  // str 16 -- 0xda
  // str 32 -- 0xdb
  // array 16 -- 0xdc
  // array 32 -- 0xdd
  // map 16 -- 0xde
  // map 32 -- 0xdf
  token[0xd9] = write1(0xd9);
  token[0xda] = write2(0xda);
  token[0xdb] = write4(0xdb);
  token[0xdc] = write2(0xdc);
  token[0xdd] = write4(0xdd);
  token[0xde] = write2(0xde);
  token[0xdf] = write4(0xdf);
}

function write0(type) {
  return function() {
    var end = this.offset + 1;
    if (end >= BUFFER_LENGTH) this.flush();
    this.buffer[this.offset++] = type;
  };
}

function write1(type) {
  return function(value) {
    var end = this.offset + 2;
    if (end >= BUFFER_LENGTH) this.flush();
    var buffer = this.buffer;
    var offset = this.offset;
    buffer[offset++] = type;
    buffer[offset++] = value;
    this.offset = offset;
  };
}

function write2(type) {
  return function(value) {
    var end = this.offset + 3;
    if (end >= BUFFER_LENGTH) this.flush();
    var buffer = this.buffer;
    var offset = this.offset;
    buffer[offset++] = type;
    buffer[offset++] = value >>> 8;
    buffer[offset++] = value;
    this.offset = offset;
  };
}

function write4(type) {
  return function(value) {
    var end = this.offset + 5;
    if (end >= BUFFER_LENGTH) this.flush();
    var buffer = this.buffer;
    var offset = this.offset;
    buffer[offset++] = type;
    buffer[offset++] = value >>> 24;
    buffer[offset++] = value >>> 16;
    buffer[offset++] = value >>> 8;
    buffer[offset++] = value;
    this.offset = offset;
  };
}

function write8(type) {
  return function(high, low) {
    var end = this.offset + 9;
    if (end >= BUFFER_LENGTH) this.flush();
    var buffer = this.buffer;
    var offset = this.offset;
    buffer[offset++] = type;
    buffer[offset++] = high >>> 24;
    buffer[offset++] = high >>> 16;
    buffer[offset++] = high >>> 8;
    buffer[offset++] = high;
    buffer[offset++] = low >>> 24;
    buffer[offset++] = low >>> 16;
    buffer[offset++] = low >>> 8;
    buffer[offset++] = low;
    this.offset = offset;
  };
}

function writeN(type, len, method) {
  return function(value) {
    var end = this.offset + 1 + len;
    if (end >= BUFFER_LENGTH) this.flush();
    this.buffer[this.offset++] = type;
    method.call(this.buffer, value, this.offset, NO_ASSERT);
    this.offset += len;
  };
}

function boolean(value) {
  // false -- 0xc2
  // true -- 0xc3
  var type = value ? 0xc3 : 0xc2;
  return token[type].call(this, value);
}

function number(value) {
  var ivalue = value | 0;
  var type;
  if (value !== ivalue) {
    // float 64 -- 0xcb
    type = 0xcb;
  } else if (-0x20 <= ivalue && ivalue <= 0x7F) {
    // positive fixint -- 0x00 - 0x7f
    // negative fixint -- 0xe0 - 0xff
    type = ivalue & 0xFF;
  } else if (0 <= ivalue) {
    // uint 8 -- 0xcc
    // uint 16 -- 0xcd
    // uint 32 -- 0xce
    // uint 64 -- 0xcf
    type = (ivalue <= 0xFF) ? 0xcc : (ivalue <= 0xFFFF) ? 0xcd : 0xce;
  } else {
    // int 8 -- 0xd0
    // int 16 -- 0xd1
    // int 32 -- 0xd2
    // int 64 -- 0xd3
    type = (-0x80 <= ivalue) ? 0xd0 : (-0x8000 <= ivalue) ? 0xd1 : 0xd2;
  }
  return token[type].call(this, value);
}

function string(value) {
  // str 8 -- 0xd9
  // str 16 -- 0xda
  // str 32 -- 0xdb
  // fixstr -- 0xa0 - 0xbf

  // prepare buffer
  var length = value.length;
  var maxsize = 5 + length * 3;
  if (this.offset + maxsize > BUFFER_LENGTH) {
    this.flush(maxsize);
  }

  // expected header size
  var expected = (length < 32) ? 1 : (length <= 0xFF) ? 2 : (length <= 0xFFFF) ? 3 : 5;

  // expected start point
  var start = this.offset + expected;

  // write string
  length = BufferLite.writeString.call(this.buffer, value, start);

  // actual header size
  var actual = (length < 32) ? 1 : (length <= 0xFF) ? 2 : (length <= 0xFFFF) ? 3 : 5;

  // move content when needed
  if (expected !== actual) {
    this.buffer.copy(this.buffer, this.offset + actual, start, start + length);
  }

  // write header
  var type = (actual === 1) ? (0xa0 + length) : (actual <= 3) ? 0xd7 + actual : 0xdb;
  token[type].call(this, length);

  // move cursor
  this.offset += length;
}

function object(value) {
  var that = this;
  var type;
  var ret;
  var length;
  if (value === null) {
    // nil -- 0xc0
    type = 0xc0;
    ret = token[type].call(that, value);
  } else if (value instanceof Array) {
    // fixarray -- 0x90 - 0x9f
    // array 16 -- 0xdc
    // array 32 -- 0xdd
    length = value.length;
    type = (length < 16) ? (0x90 + length) : (length <= 0xFFFF) ? 0xdc : 0xdd;
    ret = token[type].call(that, length);
    for (var i = 0; i < length; i++) {
      ret = that.encode1(value[i]);
    }
  } else if (Buffer.isBuffer(value)) {
    // bin 8 -- 0xc4
    // bin 16 -- 0xc5
    // bin 32 -- 0xc6
    length = value.length;
    type = (length < 0xFF) ? 0xc4 : (length <= 0xFFFF) ? 0xc5 : 0xc6;
    token[type].call(that, length);
    ret = that.write(value);
  } else {
    // fixmap -- 0x80 - 0x8f
    // map 16 -- 0xde
    // map 32 -- 0xdf
    var keys = Object.keys(value);
    length = keys.length;
    type = (length < 16) ? (0x80 + length) : (length <= 0xFFFF) ? 0xde : 0xdf;
    ret = token[type].call(that, length);
    keys.forEach(function(key) {
      that.encode1(key);
      ret = that.encode1(value[key]);
    });
  }
  return ret;
}
