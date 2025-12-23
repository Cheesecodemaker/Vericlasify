#!/usr/bin/env node
const clear = require('clear');
const chalk = require('chalk');
const figlet = require('figlet');
const inquirer = require('./lib/inquirer');
const files = require('./lib/files');

const createCommand = require('./commands/create');
const updateCommand = require('./commands/update');
const stageCommand = require('./commands/stage');
const syncCommand = require('./commands/sync');
const closeCommand = require('./commands/close');
const syncloseCommand = require('./commands/synclose');
const checkbcCommand = require('./commands/checkbc');
const exportCommand = require('./commands/export');
const checkfileCommand = require('./commands/checkfile');
const settingsCommand = require('./commands/settings');
const gitCommand = require('./commands/git');
const helpCommand = require('./commands/help');

async function createOrUpdateCommand() {
    if (files.fileExists('.vericl.json')) {
        const vericl = files.readVericlFile();
        if (vericl.offhash && vericl.offhash.closed) {
            console.log(chalk.red('✖ Closed - cannot modify'));
            return;
        }
        await updateCommand.run();
    } else {
        await createCommand.run();
    }
}

const commandMap = {
    'create / update': createOrUpdateCommand,
    'stage': stageCommand.run,
    'close': closeCommand.run,
    'syncwbc': syncCommand.run,
    'checkbc': checkbcCommand.run,
    'checkfile': checkfileCommand.run,
    'export': exportCommand.run,
    'git': gitCommand.run,
    'settings': settingsCommand.run,
    'help': helpCommand.run,
    'exit': () => { console.log(chalk.green('Goodbye!')); process.exit(0); }
};

async function main() {
    clear();
    console.log(chalk.cyan(figlet.textSync('Vericlasify', { horizontalLayout: 'full' })));
    console.log(chalk.yellow('Blockchain Git Protection\n'));

    if (!files.fileExists(__dirname + '/config.json')) {
        console.log(chalk.yellow('⚠️  Setup required\n'));
        await files.writeWallet();
    }

    while (true) {
        try {
            const answers = await inquirer.startAction();
            const command = commandMap[answers.startans];
            if (command) await command();
            if (answers.startans === 'exit') break;
            console.log('\n');
        } catch (error) {
            console.error(chalk.red('✖'), error.message);
            console.error(chalk.gray(error.stack));
        }
    }
}

if (require.main === module) main();
module.exports = { main };