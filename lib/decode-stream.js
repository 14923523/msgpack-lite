// decode-stream.js

exports.createDecodeStream = DecodeStream;

var util = require("util");
var Transform = require("stream").Transform;
var Decoder = require("./decoder").Decoder;

util.inherits(DecodeStream, Transform);

function DecodeStream() {
  if (!(this instanceof DecodeStream)) return new DecodeStream();
  Transform.call(this, {objectMode: true});
  var decoder = new Decoder();
  decoder.push = this.push.bind(this);
  this._transform = decoder._transform.bind(decoder);
}
