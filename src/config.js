const {writeFileSync} = require('fs');
const {join} = require('path');
const config = require('../config.json');

function get(prop) {
  return config[prop]
}

function set(data, merge = true) {
  writeFileSync(
    join(__dirname, '../config.json'),
    JSON.stringify({...merge && config, ...data})
  )
}

module.exports = {
  get,
  set
};
