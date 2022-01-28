const {resolve} = require('path');
const {existsSync, writeFileSync} = require('fs');
const {execSync} = require('child_process');
const inquirer = require('inquirer');
const replaceInFile = require('replace-in-file');
const open = require('open');
const {capitalize} = require('@jaspero/utils');
const conf = require('../config');
const {
    execute,
    errorMessage,
    infoMessage,
    successMessage,
    pressEnter
} = require('../utils');

let token;

async function deployFunctions(route = process.cwd(), token, projectId) {
    route = JSON.stringify(route || {}) === '{}' ? process.cwd() : route;
    const path = resolve(route, 'functions');

    if (!existsSync(path)) {
        return errorMessage(`Function deployment needs to run in an JMS project, but the functions folder couldn't be found.`);
    }

    return execute({command: `cd ${path} && npm ci && npm run build && firebase deploy --only functions --project ${projectId} --token ${token}`, options: {}});
}

async function deployFirestoreRules(route = process.cwd(), token, projectId) {
    route = JSON.stringify(route || {}) === '{}' ? process.cwd() : route;
    const path = resolve(route);

    if (!existsSync(path)) {
        return errorMessage(`Rules deployment needs to run in an JMS project.`);
    }

    return execute({command: `cd ${path} && firebase deploy --only firestore:rules --project ${projectId} --token ${token}`, options: {}});
}

async function deployStorageRules(route = process.cwd(), token, projectId) {
    route = JSON.stringify(route || {}) === '{}' ? process.cwd() : route;
    const path = resolve(route);

    if (!existsSync(path)) {
        return errorMessage(`Storage rules deployment needs to run in an JMS project.`);
    }

    return execute({command: `cd ${path} && firebase deploy --only storage --project ${projectId} --token ${token}`, options: {}});
}

async function setup(route = process.cwd()) {
    route = JSON.stringify(route || {}) === '{}' ? process.cwd() : route;
    const setupPath = resolve(route, 'setup');

    if (!existsSync(setupPath)) {
        return errorMessage(`The setup command needs to be run in an JMS project, but a project setup couldn't be found.`);
    }

    return execute({command: `cd ${setupPath} && npm ci && ts-node setup.ts p`, options: {}});
}

async function login() {
    const tokenExecute = await execute({command: 'firebase login:ci --interactive'});

    if (!tokenExecute.success) {
        return errorMessage(tokenExecute.message);
    } else {
        const lines = tokenExecute.message.split('\n').filter(item => item);
        const successLine = lines.findIndex(line => line.includes('Success! Use this token to login on a CI server:'));
        token = lines[successLine + 1].slice(4, -5);

        conf.set({token});
    }
}

async function init() {

    token = conf.get('token');

    if (!token) {
        await login();
    }

    const projects = [];
    const projectsExecute = await execute({command: `firebase projects:list --token ${token}`});
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
                    value: 'us-central1', name: 'nam5 (us-central)'
                },
                {
                    value: 'europe-west1', name: 'eur3 (europe-west)'
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
            name: 'protocol',
            message: 'GitHub Protocol:',
            type: 'list',
            loop: false,
            choices: [
                'HTTPS',
                'SSH'
            ]
        },
        {
            name: 'flavor',
            message: 'JMS Flavor:',
            type: 'list',
            loop: false,
            choices: [
                {
                    name: 'default (main)',
                    value: '-b main'
                },
                {
                    name: 'blog',
                    value: '-b flavor/blog'
                },
            ]
        }
    ]);

    if (data.newFirebase) {

        infoMessage(`Creating new firebase project: ${data.projectName}.`);

        const createProjectExecute = await execute({command: `firebase projects:create ${data.projectId} -n "${data.projectName}" --token ${token}`});
        if (!createProjectExecute.success) {
            return errorMessage(createProjectExecute.message);
        } else {
            successMessage('Your Firebase project is ready!');
        }
    }

    const flavor = data.flavor || '';

    const [githubUsername, githubProject] = data.github.split('/');

    const quickRemoteExecute = await execute(
        {command: `npx @jaspero/quick-remote r Jaspero/jms -p ${data.github} -f ${flavor} -c ${data.protocol}`},
        'Cloning project and setting up jms remote origin with quick-remote.'
    );

    if (!quickRemoteExecute.success) {
        if (existsSync(resolve(process.cwd(), githubProject))) {
            return errorMessage(`Error: Directory '${githubProject}' already exists!`);
        }

        return errorMessage(`Error: Failed to fetch '${data.github}' repository.\nCheck for misspellings and access permission to this repository.`);
    }

    await execute({command: `cd ${resolve(process.cwd(), githubProject)}`});

    setTimeout(() => {
        open(`https://console.firebase.google.com/project/${data.projectId}/settings/serviceaccounts/adminsdk`);
    }, 1500);

    infoMessage(`\nGenerate and download a new private key from Project settings.\nMove file to '${githubProject}/setup/serviceAccountKey.json'.\n`);

    let serviceAccountKey = false;
    while (!serviceAccountKey) {
        await pressEnter();

        serviceAccountKey = existsSync(`${resolve(process.cwd(), githubProject, 'setup', 'serviceAccountKey.json')}`);
        if (!serviceAccountKey) {
            errorMessage(`\nFile 'serviceAccountKey.json' not found. Please check '${githubProject}/setup' directory.\n`);
        }
    }

    infoMessage(`Replacing JMS references in the project configuration.`);

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

    infoMessage('Creating web app in your firebase project.');

    let config;
    const configExecute = await execute({command: `firebase apps:sdkconfig Web --project ${data.projectId} --token ${token}`});

    if (!configExecute.success) {
        if (configExecute.message.includes('has multiple apps, must specify an app id.')) {
            const createAppExecute = await execute({command: `firebase apps:create Web ${githubProject} --project ${data.projectId} --token ${token}`});
            if (!createAppExecute.success) {
                return errorMessage(createAppExecute.message);
            } else {
                const createApp = createAppExecute.message.split('\n').filter(item => item);
                const configCommand = createApp[createApp.length - 1].trim();

                const sdkConfig = execSync(`${configCommand} --project ${data.projectId} --token ${token}`, {stdio: ['pipe', 'pipe', 'ignore']}).toString();
                config = sdkConfig.substring(sdkConfig.indexOf('{'), sdkConfig.indexOf('}') + 1);
            }
        }
    } else {
        const sdkConfig = execSync(`firebase apps:sdkconfig Web --project ${data.projectId} --token ${token}`, {stdio: ['pipe', 'pipe', 'ignore']}).toString();
        config = sdkConfig.substring(sdkConfig.indexOf('{'), sdkConfig.indexOf('}') + 1);
    }

    infoMessage(`Adding firebase public configuration to env-config.ts.`);

    replaceInFile.sync({
        files: `${process.cwd()}/${githubProject}/**/env-config.ts`,
        from: /firebase: {(.|\n)* }/,
        to: `firebase: ${config.replace(/(^)(?!^{$)/gm, '  ')}`
    });

    /**
     * Enable Firestore
     */
    setTimeout(() => {
        open(`https://console.firebase.google.com/project/${data.projectId}/firestore`);
    }, 1500);

    infoMessage('\nPlease Enable Firestore for this project.\n');
    await pressEnter();

    /**
     * Upgrade billing plan
     */
    setTimeout(() => {
        open(`https://console.firebase.google.com/project/${data.projectId}/usage/details`);
    })

    infoMessage('\nUpgrade Firebase project to Blaze plan.\n');
    await pressEnter();


    const st = await inquirer.prompt({
        name: 'run',
        message: 'Run Setup script?',
        type: 'confirm'
    });

    if (st.run) {
        await setup(resolve(process.cwd(), githubProject));
    }

    const deploys = [
        {
            message: 'Deploy Firestore rules?',
            method: deployFirestoreRules
        },
        {
            message: 'Deploy Storage rules?',
            method: deployStorageRules
        },
        {
            message: 'Deploy Functions?',
            method: deployFunctions
        }
    ];

    for (const p of deploys) {
        const prom = await inquirer.prompt({
            name: 'run',
            message: p.message,
            type: 'confirm'
        });
    
        if (prom.run) {
            await p.method(resolve(process.cwd(), githubProject), token, data.projectId)
        }
    }

    return successMessage('Successfully created JMS project!');
}

async function createModule() {
    const modules = {
        basic: {
            id: '',
            name: '',
            layout: {
                table: {
                    tableColumns: []
                }
            },
            schema: {
                properties: {
                    id: {type: 'string'}
                }
            },
            definitions: {
                id: {label: 'GENERAL.ID', disableOn: 'edit'}
            }
        },
        advanced: {
            id: '',
            name: '',
            layout: {
                table: {
                    tableColumns: []
                }
            },
            schema: {
                properties: {
                    id: {type: 'string'}
                }
            },
            definitions: {
                id: {label: 'GENERAL.ID', disableOn: 'edit'}
            }
        }
    };

    /**
     * Things we replace in string. This is because
     * some imports aren't available here but will be
     * in JMS.
     */
    const replaces = [];
    const propertySpreads = [];
    const definitionSpreads = [];

    const data = await inquirer.prompt([
        {
            name: 'name',
            message: 'Module Name:',
        },
        {
            name: 'id',
            message: 'Module ID:'
        },
        {
            name: 'preset',
            message: 'Select Preset',
            type: 'list',
            choices: [
                'basic',
                'advanced'
            ],
            default: 'basic'
        },
        {
            name: 'timestamp',
            message: 'Add timestamp?',
            type: 'confirm',
            default: true,
        },
        {
            name: 'properties',
            message: 'Added Properties? (e.g. "firstName,lastName,age|number")',
        }
    ]);

    const moduleToUse = modules[data.preset];

    moduleToUse.name = data.name;
    moduleToUse.id = data.id;

    if (data.timestamp) {
        replaces.push('CREATED_ON.sort', 'CREATED_ON.column()');
        propertySpreads.push('CREATED_ON.property');
        definitionSpreads.push('CREATED_ON.definition()');

        moduleToUse.layout.sort = 'CREATED_ON.sort';

        /**
         * Will be replaced with spreads
         */
        moduleToUse.schema.properties['CREATED_ON.property'] = true;
        moduleToUse.definitions['CREATED_ON.definition()'] = true;
        moduleToUse.layout.table.tableColumns.unshift('CREATED_ON.column()');
    }

    if (data.properties) {
        data.properties.split(',').forEach(prop => {
            const [key, type = 'string'] = prop.split('|');
            const label = capitalize(key);
            const pointer = '/' + key;

            moduleToUse.schema.properties[key] = {type};
            moduleToUse.layout.table.tableColumns.push({key: pointer, label});
            moduleToUse.definitions[key] = {label};
        })
    }

    const path = resolve(process.cwd(), `setup/modules/${data.id}.module.ts`);

    let final = `export const ${data.id.toUpperCase()}_MODULE: Module = ${JSON.stringify(moduleToUse, null, 2)}`;

    replaces.forEach(replace => {
        final.replace(`'${replace}'`, replace);
    });

    propertySpreads.forEach(replace => {
        final.replace(`"${replace}": true`, `...${replace}`)
    });

    definitionSpreads.forEach(replace => {
        final.replace(`"${replace}": true`, `...${replace}`)
    });

    writeFileSync(path, [
        `import {Module} from './shared/module.type';`,
        ...data.timestamp ? [`import {CREATED_ON} from './shared/created-on';`] : [],
        '',
        final
    ].join('\n'));
}

module.exports = {
    setup,
    init,
    login,
    createModule
};
