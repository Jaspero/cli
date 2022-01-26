#!/usr/bin/env node

const {Command} = require('commander');
const program = new Command();

const jms = require('./src/commands/jms');
const modular = require('./src/commands/modular');
const config = require('./src/commands/config');
const update = require('./src/commands/update');
const jsonPackage = require('./package.json');
const {checkForUpdates} = require("./src/utils");

async function init() {

    await checkForUpdates();

    const commands = {};
    commands.jms = program.command('jms');
    commands.jms.description('Commands for managing JMS Project');
    commands.jms.helpOption(false);
    commands.jms.addCommand(new Command('init').description('Creates a new workspace and an initial JMS Application').action(jms.init));
    commands.jms.addCommand(new Command('setup').description('Runs JMS setup script').action(jms.setup));
    commands.jms.addCommand(new Command('login').description('Used for logging in to different accounts').action(jms.login));
    commands.jms.addCommand(new Command('create-module').description('Create a new module').action(jms.createModule));

    commands.modular = program.command('modular');
    commands.modular.description('Commands for Jaspero Modular Style');
    commands.modular.helpOption(false);
    commands.modular.addCommand(new Command('init').description('Initializes Modular in current Angular Project.').action(modular.init));

    commands.config = program.command('config');
    commands.config.description('Commands for CLI config');
    commands.config.helpOption(false);
    commands.config.addCommand(new Command('init').description('Resets any configurations.').action(config.clear));

    commands.update = program.command('update');
    commands.update.description('Update CLI package');
    commands.update.helpOption(false);
    commands.update.action(update.update);

    program.name('jaspero');
    program.helpOption(false);
    program.version(jsonPackage.version);
    program.parse(process.argv);
}

init();
