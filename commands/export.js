const chalk = require('chalk');
const ora = require('ora');
const files = require('../lib/files');
const gitLogic = require('../logic/gitLogic');

async function run() {
    const spinner = ora('Exporting...').start();

    try {
        if (!files.fileExists('.vericl.json')) {
            spinner.fail('No Storage Unit');
            return;
        }

        if (!files.fileExists('.regvericl.json')) {
            spinner.fail('Not registered');
            return;
        }

        spinner.stop();
        const list = await files.distributeSU();

        if (list[0] === "null" || list.length === 0) {
            console.log(chalk.yellow('No files selected'));
            return;
        }

        spinner.start('Creating bundle...');

        const filesJSON = gitLogic.createFilesJSON(list);
        files.createZIP(list, filesJSON);

        spinner.succeed('Bundle created!');

        console.log(chalk.green('\n✔ Exported to: ../vericlExport.zip'));
        console.log(chalk.gray('  Files: ') + list.length);

    } catch (error) {
        spinner.fail('Export failed');
        throw error;
    }
}

module.exports = { run };