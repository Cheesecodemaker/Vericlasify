const chalk = require('chalk');
const files = require("../lib/files");
const gitLogic = require("../logic/gitLogic");

async function run() {
    try {
        const vericl = files.readVericlFile();
        let sg = files.loadSG();

        const found = sg.some(el => el.hash === vericl.hash);
        if (found) {
            sg = sg.filter(obj => obj.hash !== vericl.hash);
        }

        sg.push({
            uuid: vericl.header.uuid,
            hash: vericl.hash,
            path: files.getCurrentDirectoryABS(),
            closed: vericl.offhash.closed || false
        });

        sg.sort((a, b) => (a.uuid > b.uuid ? 1 : -1));
        files.saveSG(sg);

        console.log(chalk.green('✔ Staged for blockchain registration'));
        console.log(chalk.gray('  Path: ') + files.getCurrentDirectoryABS());
        console.log(chalk.gray('  UUID: ') + vericl.header.uuid);

    } catch (error) {
        console.error(chalk.red('✖ Stage failed:'), error.message);
    }
}

module.exports = { run };