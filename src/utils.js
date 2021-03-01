const {execSync} = require('child_process');
const jsonPackage = require('../package.json');
const inquirer = require('inquirer');

function successMessage(message) {
  return console.log('\x1b[32m%s\x1b[0m', message);
}

function errorMessage(message) {
  return console.log('\x1b[31m%s\x1b[0m', message);
}

function infoMessage(message) {
  return console.log('\x1b[36m%s\x1b[0m', message);
}

function pressEnter() {
  return inquirer.prompt({name: 'enter', message: 'Press Enter to continue...', prefix: ''});
}

function execute(opts, info) {
  return new Promise(async (resolve) => {

    if (info) {
      infoMessage(info);
    }

    const command = opts.command;
    const options = opts.options || {stdio: ['pipe', 'pipe', 'ignore']};

    try {
      const stdout = await execSync(command, options);

      return resolve({
        success: true,
        message: stdout.toString()
      });
    } catch (error) {
      return resolve({
        success: false,
        message: error.stdout.toString()
      });
    }
  });
}

async function checkForUpdates() {
  const newVersion = await execute({command: `npm show @jaspero/cli version`});

  if (!newVersion.success) {
    return;
  }

  const VERSION = newVersion.message.replace('\n', '');

  if (VERSION !== jsonPackage.version) {
    successMessage(`Update for CLI is available! (${jsonPackage.version} -> ${VERSION})\n`);
  }
}

module.exports = {
  successMessage,
  errorMessage,
  infoMessage,
  execute,
  pressEnter,
  checkForUpdates
};
