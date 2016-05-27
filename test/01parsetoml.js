var toml = require('toml');
var concat = require('concat-stream');
var fs = require('fs');

fs.createReadStream('config.toml', 'utf8').pipe(concat(function(data) {
  var parsed = toml.parse(data);
  console.log(parsed)
}));
