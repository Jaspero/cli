const {resolve} = require('path');
const {existsSync, writeFileSync, readFileSync} = require('fs');
const {execSync, exec} = require('child_process');
const {inspect} = require('util');
const inquirer = require('inquirer');
const replaceInFile = require('replace-in-file');
const open = require('open');
const {capitalize, random} = require('@jaspero/utils');
const admin = require('firebase-admin');
const conf = require('../config');
const {
    execute,
    errorMessage,
    infoMessage,
    successMessage,
    pressEnter
} = require('../utils');

inquirer.registerPrompt('file-tree-selection', require('inquirer-file-tree-selection-prompt'));

let token;

async function deployFunctions(route = process.cwd(), token, projectId) {
    route = JSON.stringify(route || {}) === '{}' ? process.cwd() : route;
    const path = resolve(route, 'functions');

    if (!existsSync(path)) {
        return errorMessage(`Function deployment needs to run in an JMS project, but the functions folder couldn't be found.`);
    }

    return execute({command: `cd ${path} && npm ci && npm run build:definitions && npm run build && firebase deploy --only functions --project ${projectId} --token ${token}`, options: {}});
}

async function deployFirestore(prefix, route = process.cwd(), token, projectId) {
    route = JSON.stringify(route || {}) === '{}' ? process.cwd() : route;
    const path = resolve(route);

    if (!existsSync(path)) {
        return errorMessage(`Rules deployment needs to run in an JMS project.`);
    }

    return execute({command: `cd ${path} && firebase deploy --only firestore:${prefix} --project ${projectId} --token ${token}`, options: {}});
}

function deployFirestoreRules(route = process.cwd(), token, projectId) {
    return deployFirestore('rules', route = process.cwd(), token, projectId);
}

function deployFirestoreIndexes(route = process.cwd(), token, projectId) {
    return deployFirestore('indexes', route = process.cwd(), token, projectId);
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
    const setupPath = resolve(route, 'definitions');

    if (!existsSync(setupPath)) {
        return errorMessage(`The setup command needs to be run in an JMS project, but a project definitions couldn't be found.`);
    }

    return execute({command: `cd ${setupPath} && npm ci && npm run build && npm run process && ts-node setup.ts p`, options: {}});
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

    const {useToken} = await inquirer.prompt([
        {
            name: 'usetoken',
            message: 'Use firebase token?',
            type: 'confirm',
            default: false
        }
    ]);

    if (useToken) {
        if (!token) {
            await login();
        }
    }

    const tokenSuffix = useToken ? `--token ${token}` : '';

    const projects = [];
    const projectsExecute = await execute({command: `firebase projects:list ${tokenSuffix}`});
    
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

                if (id.length < 6) {
                    return 'ID must be at least 6 characters!';
                }

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
            name: 'access',
            message: 'Access (Public):',
            type: 'list',
            loop: false,
            default: 'public',
            choices: [
                {
                    name: 'Public',
                    value: 'public'
                },
                {
                    name: 'Private',
                    value: 'private'
                }
            ]
        },
        {
            name: 'license',
            message: 'License (MIT):',
            default: 'MIT'
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
                {
                    name: 'static',
                    value: '-b flavor/static-svelte'
                }
            ]
        },
        {
            name: 'projectName',
            message: 'Project Name:',
        },
        {
            name: 'cmsTitle',
            message: 'CMS Title:',
        },
        {
            name: 'webTitle',
            message: 'Website Title:',
            when: (data) => ['-b flavor/blog', '-b flavor/static-svelte'].includes(data.flavor)
        },
        {
            name: 'customLogoAndFavicon',
            message: 'Provide custom logo and favicon?',
            type: 'confirm',
            default: false
        },
        {
            name: 'logo',
            message: 'Logo (Needs to be a png file):',
            type: 'file-tree-selection',
            enableGoUpperDirectory: true,
            validate: v => v.endsWith('.png') || !v.includes('.'),
            onlyShowValid: true,
            when: data => data.customLogoAndFavicon
        },
        {
            name: 'favicon',
            message: 'Favicon (Needs to be a ico file):',
            type: 'file-tree-selection',
            enableGoUpperDirectory: true,
            validate: v => v.endsWith('.ico') || !v.includes('.'),
            onlyShowValid: true,
            when: data => data.customLogoAndFavicon
        },
        {
            name: 'theme',
            message: 'Theme:',
            type: 'list',
            loop: false,
            default: 'light',
            choices: [
                {
                    name: 'Light',
                    value: 'light'
                },
                {
                    name: 'Dark',
                    value: 'dark'
                }
            ]
        },
        {
            name: 'themePrimaryColor',
            message: 'Primary Color:',
            validate: v => !v || (v.startsWith('#') && (v.length === 4 || v.length === 7))
        },
        {
            name: 'themeAccentColor',
            message: 'Accent Color:',
            validate: v => !v || (v.startsWith('#') && (v.length === 4 || v.length === 7))
        },
        {
            name: 'themeSidebarPosition',
            message: 'Sidebar Position:',
            type: 'list',
            loop: false,
            default: 0,
            choices: [
                {
                    name: 'Left',
                    value: 0
                },
                {
                    name: 'Right',
                    value: 1
                }
            ]
        },
        {
            name: 'releasePipeline',
            message: 'Do you need a release pipeline?',
            type: 'confirm',
            default: false
        },
        {
            name: 'sendgridKey',
            message: 'SendGrid Token:'
        },
        {
            name: 'emailName',
            message: 'Email Sender Name:'
        },
        {
            name: 'emailEmail',
            message: 'Email Sender Email:'
        },
        {
            name: 'esecret',
            message: 'What should be the secret for your email token HMAC?',
            default: random.string(12)
        },
        {
            name: 'initialUserEmail',
            message: 'Admin User Email:'
        },
        {
            name: 'initialUserPassword',
            message: 'Admin User Password:',
            validate: v => !v || v.length >= 6
        }
    ]);

    if (data.newFirebase) {

        infoMessage(`Creating new firebase project: ${data.projectName}.`);

        const createProjectExecute = await execute({command: `firebase projects:create ${data.projectId} -n "${data.projectName}" ${tokenSuffix}`});
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

    setTimeout(() =>
        open(`https://console.firebase.google.com/project/${data.projectId}/settings/serviceaccounts/adminsdk`),
        1500
    );

    infoMessage(`\nGenerate and download a new private key from Project settings.\nMove file to '${githubProject}/definitions/serviceAccountKey.json'.\n`);

    let serviceAccountKey = false;

    while (!serviceAccountKey) {
        await pressEnter();

        serviceAccountKey = existsSync(`${resolve(process.cwd(), githubProject, 'definitions', 'serviceAccountKey.json')}`);
        if (!serviceAccountKey) {
            errorMessage(`\nFile 'serviceAccountKey.json' not found. Please check '${githubProject}/definitions' directory.\n`);
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
        files: `${process.cwd()}/${githubProject}/README.md`,
        from: /jms/g,
        to: data.projectId
    });

    replaceInFile.sync({
        files: `${process.cwd()}/${githubProject}/README.md`,
        from: '# JMS',
        to: `# ${data.projectName}`
    });

    replaceInFile.sync({
        files: `${process.cwd()}/${githubProject}/**/shared-config.const.ts`,
        from: `cloudRegion: 'us-central1',`,
        to: `cloudRegion: '${data.cloudRegion}',`
    });

    replaceInFile.sync({
        files: `${process.cwd()}/${githubProject}/client/projects/cms/src/index.html`,
        from: '<title>JMS</title>',
        to: `<title>${data.cmsTitle}</title>`
    });


    /**
     * Email Layout adjustment
     */
    replaceInFile.sync({
        files: `${process.cwd()}/${githubProject}/definitions/modules/emails/layout.html`,
        from: '© Jaspero',
        to: `© ${data.projectName}`
    });

    if (data.webTitle) {

        switch (data.flavor) {
            case '-b flavor/blog':
                replaceInFile.sync({
                    files: `${process.cwd()}/${githubProject}/web/**/index.html`,
                    from: '<title>Web</title>',
                    to: `<title>${data.webTitle}</title>`
                });
                replaceInFile.sync({
                    files: `${process.cwd()}/${githubProject}/web/**/base-title.const.ts`,
                    from: 'JMS',
                    to: data.webTitle
                });
                replaceInFile.sync({
                    files: `${process.cwd()}/${githubProject}/build/build.js`,
                    from: `BASE_TITLE = 'JMS'`,
                    to: `BASE_TITLE = '${data.webTitle}'`
                });
                break;
            case '-b flavor/static-svelte':
                replaceInFile.sync({
                    files: `${process.cwd()}/${githubProject}/web/**/title.const.ts`,
                    from: `BASE_TITLE = 'JMS'`,
                    to: `BASE_TITLE = '${data.webTitle}'`
                });
                break;
        }
    }

    if (data.logo) {
        await execute({command: `cp ${data.logo} ${process.cwd()}/${githubProject}/client/projects/cms/src/assets/images/logo.png`});

        switch (data.flavor) {
            case '-b flavor/blog':
                await execute({command: `cp ${data.logo} ${process.cwd()}/${githubProject}/client/projects/cms/web/assets/images/logo.png`});
                break;
            case '-b flavor/static-svelte':
                await execute({command: `cp ${data.logo} ${process.cwd()}/${githubProject}/web/static/logo.png`});
                break;
        }
    }

    if (data.favicon) {
        await execute({command: `cp ${data.favicon} ${process.cwd()}/${githubProject}/client/projects/cms/src/favicon.ico`});

        switch (data.flavor) {
            case '-b flavor/blog':
                await execute({command: `cp ${data.logo} ${process.cwd()}/${githubProject}/client/projects/web/src/favicon.ico`});
                break;
            case '-b flavor/static-svelte':
                await execute({command: `cp ${data.logo} ${process.cwd()}/${githubProject}/web/static/favicon.ico`});
                break;
        }
    }

    /**
     * Light is the default theme so we don't
     * need to change it in that case.
     */
    if (data.theme !== 'light') {

        [
            {
                from: `theme    : #ffffff, /* Sidebar background color */ /* #262626 - dark sidebar */`,
                to: `theme    : #262626, /* Sidebar background color */ /* #ffffff - light sidebar */`
            },
            {
                from: `contrast : #262626, /* Sidebar text color */ /* #ffffff - dark sidebar */`,
                to: `contrast : #ffffff, /* Sidebar text color */ /* #262626 - light sidebar */`
            },
            {
                from: `accent   : #1C7ED6, /* Sidebar icon color */ /* #80B2ED - dark sidebar */`,
                to: `accent   : #80B2ED, /* Sidebar icon color */ /* #1C7ED6 - light sidebar */`
            },
            {
                from: `active   : #E7F5FF, /* Background color of active items in sidebar */ /* #283B54 - dark sidebar */`,
                to: `active   : #283B54, /* Background color of active items in sidebar */ /* #E7F5FF - light sidebar */`
            },
            {
                from: `hover    : #dedede, /* Background color of hovered items in sidebar */ /* #363636 - dark sidebar */`,
                to: `hover    : #363636, /* Background color of hovered items in sidebar */ /* #dedede - light sidebar */`
            },
            {
                from: `dd-b     : #d0d0d0, /* Dropdown border color */ /* rgba(255,255,255,.3) - dark sidebar */`,
                to: `dd-b     : rgba(255,255,255,.3), /* Dropdown border color */ /* #d0d0d0 - light sidebar */`
            },
            {
                from: `dd-b-a   : #737373, /* Dropdown border color - active */ /* white - dark sidebar */`,
                to: `dd-b-a   : white, /* Dropdown border color - active */ /* #737373 - light sidebar */`
            },
        ]
            .forEach(dt => {
                replaceInFile.sync({
                    files: `${process.cwd()}/${githubProject}/**/_theme.scss`,
                    ...dt
                });
            })
    }

    if (data.themePrimaryColor) {
        replaceInFile.sync({
            files: `${process.cwd()}/${githubProject}/**/_theme.scss`,
            from: `theme    : #3F50B5,`,
            to: `theme    : ${data.themePrimaryColor},`
        });

        replaceInFile.sync({
            files: `${process.cwd()}/${githubProject}/definitions/modules/emails/style.css`,
            from: `background: #3f50b5;`,
            to: `background: ${data.themePrimaryColor};`
        });
    }

    if (data.themeAccentColor) {
        replaceInFile.sync({
            files: `${process.cwd()}/${githubProject}/**/_theme.scss`,
            from: `theme    : #ff4081,`,
            to: `theme    : ${data.themeAccentColor},`
        });

        replaceInFile.sync({
            files: `${process.cwd()}/${githubProject}/definitions/modules/emails/style.css`,
            from: `background: #ff4081;`,
            to: `background: ${data.themeAccentColor};`
        });
    }

    if (data.themeSidebarPosition) {
        replaceInFile.sync({
            files: `${process.cwd()}/${githubProject}/**/_theme.scss`,
            from: `position : 0,`,
            to: `position : 1,`
        });
    }

    infoMessage('Creating web app in your firebase project.');

    let config;
    const configExecute = await execute({command: `firebase apps:sdkconfig Web --project ${data.projectId} ${tokenSuffix}`});

    if (!configExecute.success) {
        if (configExecute.message.includes('has multiple apps, must specify an app id.') || configExecute.message.includes('There are no WEB apps')) {
            const createAppExecute = await execute({command: `firebase apps:create Web ${githubProject} --project ${data.projectId} ${tokenSuffix}`});
            if (!createAppExecute.success) {
                return errorMessage(createAppExecute.message);
            } else {
                const createApp = createAppExecute.message.split('\n').filter(item => item);
                const configCommand = createApp[createApp.length - 1].trim();

                const sdkConfig = execSync(`${configCommand} --project ${data.projectId} ${tokenSuffix}`, {stdio: ['pipe', 'pipe', 'ignore']}).toString();
                config = sdkConfig.substring(sdkConfig.indexOf('{'), sdkConfig.indexOf('}') + 1);
            }
        }
    } else {
        const sdkConfig = execSync(`firebase apps:sdkconfig Web --project ${data.projectId} ${tokenSuffix}`, {stdio: ['pipe', 'pipe', 'ignore']}).toString();
        config = sdkConfig.substring(sdkConfig.indexOf('{'), sdkConfig.indexOf('}') + 1);
    }

    infoMessage(`Adding firebase public configuration to env-config.ts.`);

    replaceInFile.sync({
        files: `${process.cwd()}/${githubProject}/**/env-config.ts`,
        from: /firebase: {(.|\n)* }/,
        to: `firebase: ${config.replace(/(^)(?!^{$)/gm, '  ')}`
    });

    const package = JSON.parse(
        readFileSync(`${process.cwd()}/${githubProject}/package.json`).toString()
    );

    package.name = `@jaspero/${githubProject}`;
    package.version = '0.0.1';
    package.repository.url = `https://github.com/${data.github.toLowerCase()}`;
    package.bugs.url = `https://github.com/${data.github.toLowerCase()}/issues`;
    package.homepage = `https://${data.projectId}.web.app`;
    package.license = data.license;

    if (!data.releasePipeline) {
        delete package.devDependencies['@semantic-release/changelog'];
        delete package.devDependencies['@semantic-release/git'];
        delete package.devDependencies['@semantic-release/npm'];
        delete package.devDependencies['semantic-release'];
        delete package.scripts['semantic-release'];
        delete package.release;

        await execute({command: `rm ${process.cwd()}/${githubProject}/CHANGELOG.md`});
        await execute({command: `rm ${process.cwd()}/${githubProject}/.github/workflows/release.workflow.yml`});
        await execute({command: `rm ${process.cwd()}/${githubProject}/.github/workflows/lighthouse.workflow.yml`});

    } else {
        replaceInFile.sync({
            files: `${process.cwd()}/${githubProject}/CHANGELOG.md`,
            from: /(.|\n|\t\r)*/g,
            to: ``
        });
    }

    if (data.access !== 'public') {
        const toDelete = [
            'CODE_OF_CONDUCT.md',
            'CONTRIBUTING.md',
            'LICENSE',
            'SECURITY.md'
        ];
        
        for (const path of toDelete) {
            await execute({command: `rm ${process.cwd()}/${githubProject}/${path}`});
        }
    }

    writeFileSync(`${process.cwd()}/${githubProject}/package.json`, JSON.stringify(package, null, 2));

    /**
     * Set up repo secrets. 
     * Note: This will only work if the user has github cli set up.
     */
    try {
        infoMessage('\nSetting up repository secrets.');
        infoMessage('\nCreating FIREBASE_TOKEN');

        if (!token) {
            await login();
        }

        await execute({command: `gh secret set FIREBASE_TOKEN --body "${token}" -R ${data.github}`});

        /**
         * Flavors that require a SERVICE_ACCOUNT
         */
        if (['-b flavor/blog', '-b flavor/static-svelte'].includes(data.flavor)) {
            infoMessage('\nCreting SERVICE_ACCOUNT');

            const serviceAccount = JSON.stringify(
                JSON.parse(
                    readFileSync(`${resolve(process.cwd(), githubProject, 'definitions', 'serviceAccountKey.json')}`).toString()
                )
            );

            await execute({command: `gh secret set SERVICE_ACCOUNT --body '${serviceAccount}' -R ${data.github}`});
        }
    } catch (e) {
        console.error(e);
        infoMessage('\nFailed to set up repository secrets. Do you have Github CLI installed?');
    }

    try {
        infoMessage('\nAdding Cloud Datastore Import Export Admin role.');

        await execute({
            command: `gcloud projects add-iam-policy-binding ${data.projectId} --member serviceAccount:${data.projectId}@appspot.gserviceaccount.com --role roles/datastore.importExportAdmin`
        });
    } catch (e) {
        console.error(e);
        infoMessage('\nFailed to add Cloud Datastore Import Export Admin role.');
    }

    const secretsToSet = [
        {key: data.sendgridKey, target: 'prod.sendgrid.key'},
        {key: data.emailName, target: 'prod.email.name'},
        {key: data.emailEmail, target: 'prod.email.email'},
        {key: data.esecret, target: 'prod.esecret'}
    ];

    for (const secret of secretsToSet) {
        if (!secret.key) {
            continue;
        }

        infoMessage(`\nCreating ${secret.target} in firebase secrets.`);
        await execute({command: `firebase functions:config:set ${secret.target}="${secret.key}" --project ${data.projectId} ${tokenSuffix}`});
        infoMessage(`\n${secret.target} created. Note, you'll need to deploy functions in order for this to persist.`);
    }

    /**
     * Set up ghtoken firebase secret if the flavor needs it.
     */
     if (['-b flavor/blog', '-b flavor/static-svelte'].includes(data.flavor)) {

        setTimeout(() =>
            open(`https://github.com/settings/tokens/new?description=${data.projectId}&scopes=repo`),
        );

        const {ghToken} = await inquirer.prompt([{
            name: 'ghToken',
            message: 'Generated github token:',
        }]);

        if (ghToken) {
            infoMessage('\nCreating a ghtoken in firebase secrets.');
            await execute({command: `firebase functions:config:set prod.ghtoken=${ghToken} --project ${data.projectId} ${tokenSuffix}`});
            infoMessage(`\nghtoken set, note, you'll need to deploy functions in order for this to persist.`);
        }

        infoMessage(`\nCreate a new firebase site for the website project. You should call it ${data.projectId}-web.\nYou should also configure "Release storage settings" to 1.`);

        /**
         * Add additional hosting site
         */
        setTimeout(() =>
            open(`https://console.firebase.google.com/project/${data.projectId}/hosting/sites`)
        );
     }

    /**
     * Enable Firestore
     */
    setTimeout(() =>
        open(`https://console.firebase.google.com/project/${data.projectId}/firestore`)
    );

    infoMessage('\nPlease Enable Firestore for this project.');

    await pressEnter();

    /**
     * Enable Auth
     */
    setTimeout(() =>
        open(`https://console.firebase.google.com/project/${data.projectId}/authentication`)
    )
 
    infoMessage(`\nPlease enable authentication for this project.\nEnable authentication with google as well as email and password.`);
 
    await pressEnter();

    /**
     * Replace Action URL
     */
    setTimeout(() =>
        open(`https://console.firebase.google.com/project/${data.projectId}/authentication/emails`)
    )

    infoMessage(`\nPlease replace the Action URL with the following:\nhttps://${data.cloudRegion}-${data.projectId}.cloudfunctions.net/actionController`);

    await pressEnter();

    /**
     * Upgrade billing plan
     */
    setTimeout(() =>
        open(`https://console.firebase.google.com/project/${data.projectId}/usage/details`)
    )

    infoMessage('\nUpgrade Firebase project to Blaze plan.');

    await pressEnter();

    /**
     * Enable IAM Service Account Credentials API
     */
    setTimeout(() =>
        open(`https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com?project=${data.projectId}`)
    )
  
    infoMessage('\nPlease enable the IAM Service Account Credentials API for this project.\nWe need this to be able to verify and create custom token.');
  
    await pressEnter();

    const st = await inquirer.prompt({
        name: 'run',
        message: 'Run Setup script?',
        type: 'confirm'
    });

    if (st.run) {
        await setup(resolve(process.cwd(), githubProject));
    }

    
    if (data.initialUserEmail && data.initialUserPassword) {
        infoMessage('\nCreating initial user with admin role.');

        const instance = admin.initializeApp({
            credential: admin.credential.cert(
                JSON.parse(
                    readFileSync(`${resolve(process.cwd(), githubProject, 'definitions', 'serviceAccountKey.json')}`).toString()
                )
            )
        }, 'instance');
        const auth = instance.auth();
        const firestore = instance.firestore();

        const user = await auth.createUser({
            email: data.initialUserEmail,
            password: data.initialUserPassword
        });

        await auth.setCustomUserClaims(user.uid, {role: 'admin'});
        await firestore.doc(`users/${user.uid}`).set({
            createdOn: Date.now(),
            email: user.email,
            active: true,
            role: 'admin'
        }, {merge: true});
    }

    const deploys = [
        {
            message: 'Deploy Firestore rules?',
            method: deployFirestoreRules
        },
        {
            message: 'Deploy Firestore indexes?',
            method: deployFirestoreIndexes
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
                id: {label: 'ID', disableOn: 'edit'}
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
                id: {label: 'ID', disableOn: 'edit'}
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
            message: 'Select Preset:',
            type: 'list',
            choices: [
                'basic',
                'advanced'
            ],
            default: 'basic'
        },
        {
            name: 'timestamp',
            message: 'Add Timestamp (createdOn)?',
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

    const path = resolve(process.cwd(), `definitions/modules/${data.id}.module.ts`);

    let final = `export const ${data.id.toUpperCase()}_MODULE: Module = ${inspect(moduleToUse, {depth: null}).toString()}`;

    replaces.forEach(replace => {
        final.replace(`'${replace}'`, replace);
    });

    propertySpreads.forEach(replace => {
        final.replace(`'${replace}': true`, `...${replace}`)
    });

    definitionSpreads.forEach(replace => {
        final.replace(`'${replace}': true`, `...${replace}`)
    });

    writeFileSync(path, [
        `import {Module} from '../interfaces/module.interface';`,
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
