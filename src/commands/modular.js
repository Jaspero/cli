const {
  existsSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  appendFileSync
} = require('fs');
const {resolve} = require('path');
const inquirer = require('inquirer');
const adm = require('adm-zip');
const {
  errorMessage,
  successMessage,
  infoMessage,
  execute
} = require('../utils');

function downloadFile(link, file) {
  return execute({command: `curl -L ${link} > ${file}`});
}

async function init() {
  if (!existsSync(resolve(process.cwd(), 'angular.json'))) {
    return errorMessage('The init command requires to be run in an Angular project, but a project definition could not be found.');
  }

  let srcPath = '';

  const single = existsSync(resolve(process.cwd(), 'src', 'index.html'));
  if (!single) {
    const projects = [];
    const lsExec = await execute({command: `cd projects && ls`});
    if (!lsExec.success) {
      return errorMessage(`Failed to find 'projects' directory.`);
    } else {
      projects.push(...lsExec.message.split('\n').filter(item => item));
    }

    if (projects.length > 1) {
      const data = await inquirer.prompt([
        {
          name: 'project',
          message: 'For which project would you like to initialize Modular?',
          type: 'list',
          loop: false,
          choices: projects
        },
      ]);

      projects.splice(0, projects.length, data.project);
    }

    srcPath = resolve(process.cwd(), 'projects', projects[0], 'src');
  } else {
    srcPath = resolve(process.cwd(), 'src');
  }

  await downloadFile('http://github.com/Jaspero/modular-style/archive/master.zip', 'modular.zip');
  const zip = new adm('./modular.zip');

  zip.getEntries().forEach(entry => {
    if (entry.entryName === 'modular-style-master/scss/') {
      zip.extractEntryTo(entry, srcPath, true, true, 'scss');
    }
  });

  renameSync(resolve(srcPath, 'modular-style-master', 'scss'), resolve(srcPath, 'scss'));

  rmdirSync(resolve(srcPath, 'modular-style-master'), {recursive: true});
  unlinkSync('modular.zip');

  const styleFiles = ['styles.scss', 'global.scss'];

  const mainStyle = styleFiles.find(file => {
    return existsSync(resolve(srcPath, file));
  });

  if (!mainStyle) {
    infoMessage('\nMain style file could not be found! Please import _modular.scss manually.\n')
  } else {
    appendFileSync(resolve(srcPath, mainStyle), '@import "scss/modular";\n');
  }

  return successMessage('Successfully initialized Modular!');
}

module.exports = {
  init
};
