const conf = require('../config');
const {successMessage, errorMessage} = require('../utils');

function clear() {
  try {
    conf.set({}, false);
    successMessage('Configurations cleared successfully.')
  } catch (e) {
    errorMessage(e.toString());
  }
}

module.exports = {
  clear
};
