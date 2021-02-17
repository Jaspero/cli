#!/usr/bin/env node

const {execSync} = require('child_process');
const replaceInFile = require('replace-in-file');
const {Command} = require('commander');
const inquirer = require('inquirer');
const adm = require('adm-zip');
const open = require('open');
const path = require('path');
const fs = require('fs');

const program = new Command();

function pressEnter() {
    return inquirer.prompt({name: 'enter', message: 'Press Enter to continue...', prefix: ''});
}

function errorMessage(message) {
    return console.log('\x1b[31m%s\x1b[0m', message);
}

function execute(opts) {
    return new Promise(async (resolve) => {
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

function downloadFile(link, file) {
    return execute({command: `curl -L ${link} > ${file}`});
}

const modular = {
    init: async () => {
        if (!fs.existsSync(path.resolve(process.cwd(), 'angular.json'))) {
            return errorMessage('The init command requires to be run in an Angular project, but a project definition could not be found.');
        }

        let srcPath = '';

        const single = fs.existsSync(path.resolve(process.cwd(), 'src', 'index.html'));
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

            srcPath = path.resolve(process.cwd(), 'projects', projects[0], 'src');
        } else {
            srcPath = path.resolve(process.cwd(), 'src');
        }

        await downloadFile('http://github.com/Jaspero/modular-style/archive/master.zip', 'modular.zip');
        const zip = new adm('./modular.zip');

        zip.getEntries().forEach(entry => {
            if (entry.entryName === 'modular-style-master/scss/') {
                zip.extractEntryTo(entry, srcPath, true, true, 'scss');
            }
        });

        fs.renameSync(path.resolve(srcPath, 'modular-style-master', 'scss'), path.resolve(srcPath, 'scss'));

        fs.rmdirSync(path.resolve(srcPath, 'modular-style-master'), {recursive: true});
        fs.unlinkSync('modular.zip');

        const styleFiles = ['styles.scss', 'global.scss'];

        const mainStyle = styleFiles.find(file => {
           return fs.existsSync(path.resolve(srcPath, file));
        });

        fs.appendFileSync(path.resolve(srcPath, mainStyle), '@import "scss/modular";\n');
    }
};

const jms = {
    token: '',
    setup: async (route = process.cwd()) => {
        route = JSON.stringify(route || {}) === '{}' ? process.cwd() : route;
        const setupPath = path.resolve(route, 'setup');
        if (!fs.existsSync(setupPath)) {
            return errorMessage('The setup command requires to be run in an JMS project, but a project setup could not be found.');
        }

        return execute({command: `cd ${setupPath} && npm i && ts-node setup.ts`, options: {}});
    },
    init: async () => {
        const tokenExecute = await execute({command: 'firebase login:ci --interactive'});
        if (!tokenExecute.success) {
            return errorMessage(tokenExecute.message);
        } else {
            const lines = tokenExecute.message.split('\n').filter(item => item);
            const successLine = lines.findIndex(line => line.includes('Success! Use this token to login on a CI server:'));
            jms.token = lines[successLine + 1].slice(4, -5);
        }

        const projects = [];
        const projectsExecute = await execute({command: `firebase projects:list --token ${jms.token}`});
        if (!projectsExecute.success) {
            return errorMessage(projectsExecute.message);
        } else {
            const lines = projectsExecute.message
                .split('\n')
                .map(line => {
                    const left = line.indexOf('│', 1);
                    const right = line.indexOf('│', left + 1);
                    return line.slice(left, right).replace(/│/g, '').trim();
                })
                .filter(item => item && item !== 'Project ID');

            projects.push(...lines);
        }

        const data = await inquirer.prompt([
            {
                name: 'newFirebase',
                message: 'Create new Firebase Project:',
                type: 'confirm',
                default: false
            },
            {
                name: 'projectId',
                message: 'Firebase Project ID:',
                default: 'jaspero-jms',
                when: (data) => data.newFirebase,
                validate: (id) => {
                    if (id.length > 30) {
                        return 'ID must have 30 or less characters!';
                    }

                    if (id.toLowerCase() !== id) {
                        return 'ID must contain only lowercase characters!';
                    }

                    if (id[0].toUpperCase() === id[0].toLowerCase()) {
                        return 'ID must start with a letter!';
                    }

                    if (id[id.length - 1] === '-') {
                        return 'ID must not have a trailing hyphen!';
                    }

                    return true;
                }
            },
            {
                name: 'projectName',
                message: 'Firebase Project Display Name:',
                default: 'JMS',
                when: (data) => data.newFirebase,
                validate: (name) => {
                    if (name.length > 30) {
                        return 'Project Name must have 30 or less characters';
                    }

                    return true;
                }
            },
            {
                name: 'projectId',
                message: 'Firebase Project ID:',
                when: (data) => !data.newFirebase,
                type: 'list',
                choices: projects,
                loop: false
            },
            {
                name: 'cloudRegion',
                type: 'list',
                message: 'Firebase Cloud Region:',
                choices: [
                    {
                        value: 'us-central', name: 'nam5 (us-central)'
                    },
                    {
                        value: 'europe-west', name: 'eur3 (europe-west)'
                    },
                    'asia-northeast3',
                    'asia-northeast2',
                    'europe-west6',
                    'asia-east2',
                    'us-west2',
                    'europe-west3',
                    'europe-west2',
                    'us-east1',
                    'us-east4',
                    'asia-northeast1',
                    'asia-south1',
                    'australia-southeast1',
                    'southamerica-east1',
                    'northamerica-northeast1',
                    'us-west3',
                    'us-west4',
                    'asia-southeast2'
                ],
                loop: false
            },
            {
                name: 'github',
                message: 'GitHub Username/Repository:',
                default: 'Jaspero/JMS',
            },
            {
                name: 'multiple',
                message: 'Setup JMS for multiple projects?',
                type: 'confirm'
            }
        ]);

        if (data.newFirebase) {
            const createProjectExecute = await execute({command: `firebase projects:create ${data.projectId} -n "${data.projectName}" --token ${jms.token}`});
            if (!createProjectExecute.success) {
                return errorMessage(createProjectExecute.message);
            } else {
                console.log('\x1b[32m%s\x1b[0m', 'Your Firebase project is ready!');
            }
        }

        const flavor = data.multiple ? '-b flavor/mw' : '';

        const [githubUsername, githubProject] = data.github.split('/');

        const quickRemoteExecute = await execute({command: `npx @jaspero/quick-remote r Jaspero/jms -p ${data.github} -f ${flavor}`});

        if (!quickRemoteExecute.success) {
            if (fs.existsSync(path.resolve(process.cwd(), githubProject))) {
                return errorMessage(`Error: Directory '${githubProject}' already exists!`);
            }

            return errorMessage(`Error: Failed to fetch '${data.github}' repository.\nCheck for misspellings and access permission to this repository.`);
        }

        await execute({command: `cd ${path.resolve(process.cwd(), githubProject)}`});

        setTimeout(() => {
            open(`https://console.firebase.google.com/project/${data.projectId}/settings/serviceaccounts/adminsdk`);
        }, 1500);

        console.log('\x1b[36m%s\x1b[0m', `\nGenerate and download a new private key from Project settings.\nMove file to '${githubProject}/setup/serviceAccountKey.json'.\n`);

        let serviceAccountKey = false;
        while (!serviceAccountKey) {
            await pressEnter();

            serviceAccountKey = fs.existsSync(`${path.resolve(process.cwd(), githubProject, 'setup', 'serviceAccountKey.json')}`);
            if (!serviceAccountKey) {
                console.log('\x1b[31m%s\x1b[0m', `\nFile 'serviceAccountKey.json' not found. Please check '${githubProject}/setup' directory.\n`);
            }
        }

        replaceInFile.sync({
            files: [
                `${process.cwd()}/${githubProject}/**/*.*`,
                `${process.cwd()}/${githubProject}/**/.firebaserc`,
                `${process.cwd()}/${githubProject}/**/.github/workflows/*`
            ],
            from: /jaspero-jms/g,
            to: data.projectId,
            ignore: [
                `${process.cwd()}/${githubProject}/index.js`,
                `${process.cwd()}/${githubProject}/**/env-config.ts`,
                `${process.cwd()}/${githubProject}/**/node_modules/**/*`,
            ],
        });

        replaceInFile.sync({
            files: `${process.cwd()}/${githubProject}/**/fb.module.ts`,
            from: `useValue: 'us-central1'`,
            to: `useValue: '${data.cloudRegion}'`
        });

        replaceInFile.sync({
            files: `${process.cwd()}/${githubProject}/**/static-config.const.ts`,
            from: `cloudRegion: 'us-central1',`,
            to: `cloudRegion: '${data.cloudRegion}',`
        });

        let config;
        const configExecute = await execute({command: `firebase apps:sdkconfig Web --project ${data.projectId} --token ${jms.token}`});
        if (!configExecute.success) {
            if (configExecute.message.includes('has multiple apps, must specify an app id.')) {


                const createAppExecute = await execute({command: `firebase apps:create Web ${githubProject} --project ${data.projectId} --token ${jms.token}`});
                if (!createAppExecute.success) {
                    return errorMessage(createAppExecute.message);
                } else {
                    const createApp = createAppExecute.message.split('\n').filter(item => item);
                    const configCommand = createApp[createApp.length - 1].trim();

                    const sdkConfig = execSync(`${configCommand} --project ${projectId} --token ${jms.token}`, {stdio: ['pipe', 'pipe', 'ignore']}).toString();
                    config = sdkConfig.substring(sdkConfig.indexOf('{'), sdkConfig.indexOf('}') + 1);
                }
            }
        } else {
            const sdkConfig = execSync(`firebase apps:sdkconfig Web --project ${data.projectId} --token ${jms.token}`, {stdio: ['pipe', 'pipe', 'ignore']}).toString();
            config = sdkConfig.substring(sdkConfig.indexOf('{'), sdkConfig.indexOf('}') + 1);
        }

        replaceInFile.sync({
            files: `${process.cwd()}/${githubProject}/**/env-config.ts`,
            from: `{\n    apiKey: "AIzaSyBpOVW-c-ExPTUHRAXRO8-yTUVPq0pKS1g",\n    authDomain: "jaspero-jms.firebaseapp.com",\n    databaseURL: "https://jaspero-jms.firebaseio.com",\n    projectId: "jaspero-jms",\n    storageBucket: "jaspero-jms.appspot.com",\n    messagingSenderId: "82190793734",\n    appId: "1:82190793734:web:e6abf3c3a3bbb744"\n  }`,
            to: config
        });

        setTimeout(() => {
            open(`https://console.firebase.google.com/project/${data.projectId}/firestore`);
        }, 1500);

        console.log('\x1b[36m%s\x1b[0m', '\nPlease Enable Firestore for this project.\n');
        await pressEnter();


        const setup = await inquirer.prompt({
            name: 'run',
            message: 'Run Setup script?',
            type: 'confirm'
        });

        if (setup.run) {
            return jms.setup(path.resolve(process.cwd(), githubProject));
        }

        console.log('\x1b[32m%s\x1b[0m', 'Successfully created JMS project!');
    }
};

const commands = {};
commands.jms = program.command('jms');
commands.jms.description('Commands for managing JMS Project');
commands.jms.helpOption(false);
commands.jms.addCommand(new Command('init').description('Creates a new workspace and an initial JMS Application').action(jms.init));
commands.jms.addCommand(new Command('setup').description('Runs JMS setup script').action(jms.setup));

commands.modular = program.command('modular');
commands.modular.description('Commands for Jaspero Modular Style');
commands.modular.helpOption(false);
commands.modular.addCommand(new Command('init').description('Initializes Modular in current Angular Project.').action(modular.init));

program.name('jaspero');
program.helpOption(false);
program.parse(process.argv);
