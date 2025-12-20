const chalk = require('chalk');
const inquirer = require('inquirer');
const files = require('../lib/files');
const fs = require('fs');

async function run() {
    console.log(chalk.cyan('\n⚙️  Settings\n'));
    
    try {
        const configPath = __dirname + '/../config.json';
        let config = {};
        
        if (files.fileExists(configPath)) {
            const data = fs.readFileSync(configPath);
            config = JSON.parse(data.toString());
            
            console.log(chalk.gray('Wallet 1: ') + mask(config.wallet1));
            console.log(chalk.gray('Wallet 2: ') + mask(config.wallet2));
        } else {
            console.log(chalk.yellow('No configuration'));
        }
        
        const {action} = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: 'Action:',
            choices: [
                'Change wallet',
                'View config',
                'Reset',
                'Back'
            ]
        }]);
        
        if (action === 'Change wallet') {
            await files.writeWallet();
            console.log(chalk.green('\n✔ Updated'));
        } else if (action === 'View config') {
            console.log('\nWallet 1:', config.wallet1);
            console.log('Wallet 2:', config.wallet2);
        } else if (action === 'Reset') {
            const {confirm} = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: 'Delete config?',
                default: false
            }]);
            if (confirm && files.fileExists(configPath)) {
                fs.unlinkSync(configPath);
                console.log(chalk.green('\n✔ Reset'));
            }
        }
        
    } catch (error) {
        console.error(chalk.red('✖'), error.message);
    }
}

function mask(addr) {
    if (!addr) return 'Not set';
    return addr.substring(0, 6) + '...' + addr.substring(addr.length - 4);
}

module.exports = { run };