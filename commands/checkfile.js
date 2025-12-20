const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const files = require('../lib/files');
const gitLogic = require('../logic/gitLogic');

async function run() {
    try {
        if (!files.fileExists('.pinesu.json')) {
            console.log(chalk.red('✖ Not a Storage Unit'));
            return;
        }
        
        const pinesu = files.readPineSUFile();
        
        const fileChoices = pinesu.filelist
            .filter(item => !item.endsWith(':'))
            .map(item => {
                const [filepath, hash] = item.split(':');
                return {
                    name: filepath,
                    value: { path: filepath, hash: hash }
                };
            });
        
        if (fileChoices.length === 0) {
            console.log(chalk.yellow('No files in SU'));
            return;
        }
        
        const {selectedFile} = await inquirer.prompt([{
            type: 'list',
            name: 'selectedFile',
            message: 'Select file:',
            choices: fileChoices,
            pageSize: 15
        }]);
        
        const spinner = ora('Checking...').start();
        
        if (!files.fileExists(selectedFile.path)) {
            spinner.fail('File deleted');
            return;
        }
        
        const currentHash = gitLogic.fileHashSync(selectedFile.path);
        
        if (currentHash !== selectedFile.hash) {
            spinner.fail('File modified');
            console.log(chalk.red('\n✖ Hash mismatch'));
            console.log(chalk.gray('  Expected: ') + selectedFile.hash);
            console.log(chalk.gray('  Current: ') + currentHash);
            return;
        }
        
        spinner.succeed('File is valid!');
        console.log(chalk.green('\n✔ ' + selectedFile.path));
        console.log(chalk.gray('  Hash: ') + selectedFile.hash.substring(0, 20) + '...');
        
    } catch (error) {
        console.error(chalk.red('✖'), error.message);
    }
}

module.exports = { run };