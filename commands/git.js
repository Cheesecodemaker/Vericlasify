const chalk = require('chalk');
const inquirer = require('inquirer');
const gitLogic = require('../logic/gitLogic');
const ora = require('ora');

async function run() {
    console.log(chalk.cyan('\n📦 Git Operations\n'));
    
    try {
        const {action} = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: 'Select operation:',
            choices: [
                'Custom command',
                'View remote',
                'Set remote',
                'Push',
                'Back'
            ]
        }]);
        
        if (action === 'Custom command') {
            const {cmd} = await inquirer.prompt([{
                type: 'input',
                name: 'cmd',
                message: 'Git command (without "git"):',
            }]);
            await gitLogic.customGit(cmd);
            console.log(chalk.green('✔ Done'));
            
        } else if (action === 'View remote') {
            const remote = await gitLogic.getRemote();
            console.log(chalk.cyan('\nRemote: ') + remote.trim());
            
        } else if (action === 'Set remote') {
            const {url} = await inquirer.prompt([{
                type: 'input',
                name: 'url',
                message: 'Remote URL:',
            }]);
            await gitLogic.setRemote(url);
            console.log(chalk.green('✔ Set'));
            
        } else if (action === 'Push') {
            const spinner = ora('Pushing...').start();
            await gitLogic.pushSU();
            spinner.succeed('Pushed!');
        }
        
    } catch (error) {
        console.error(chalk.red('✖'), error.message);
    }
}

module.exports = { run };