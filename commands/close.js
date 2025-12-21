const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const files = require('../lib/files');
const ethLogic = require('../logic/ethLogic');
const gitLogic = require('../logic/gitLogic');

let w1, w2, k, mc, sg;

async function init() {
    const res = await files.readWallet(false);
    w1 = res.wallet1;
    w2 = res.wallet2;
    k = res.pkey;
    const inq = require('../lib/inquirer');
    const ethHost = await inq.ethHost();
    ethLogic.connect(w1, w2, k, ethHost.host);
    mc = files.loadTree();
    sg = files.loadSG();
}

async function run() {
    const spinner = ora('Closing...').start();

    try {
        await init();

        if (sg.length === 0) {
            spinner.fail('Nothing staged');
            return;
        }

        spinner.stop();
        const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: `Close ${sg.length} Storage Units permanently?`,
            default: false
        }]);

        if (!confirm) {
            console.log(chalk.yellow('Cancelled'));
            return;
        }

        spinner.start('Processing...');

        const [openRoot, closedRoot, openL, closedL] = files.createSGTrees(
            sg.map(su => ({ ...su, closed: true }))
        );

        const today = new Date();
        let closedWitness, closedSG;

        if (closedRoot !== null) {
            [closedWitness, closedSG] = ethLogic.addToTree(closedRoot, mc, true, today, sg);
        } else {
            spinner.fail('Failed');
            return;
        }

        const date = today.toISOString();
        const [mkcHash, receipt, bktimestamp] = await ethLogic.registerMC(mc);

        for (let el of sg) {
            let o = {
                path: el.path,
                type: "closing",
                mkcalroot: mkcHash,
                mkcaltimestamp: date,
                txhash: receipt.transactionHash,
                bkhash: receipt.blockHash,
                bkheight: receipt.blockNumber,
                bktimestamp: bktimestamp,
                witness: closedWitness,
                closedstoragegroup: closedSG
            };
            files.createRegistration(o);

            gitLogic.changeDir(el.path);
            const vericl = files.readVericlFile();
            vericl.offhash.closed = true;
            vericl.offhash.bcregnumber = (vericl.offhash.bcregnumber || 0) + 1;
            vericl.offhash.bcregtime = bktimestamp;
            await files.saveVericlJSON(vericl);

            await gitLogic.makeRegistrationCommit(el.path);
        }

        gitLogic.changeDir('.');
        files.flushSG();
        files.saveTree(mc);

        spinner.succeed('Closed!');
        console.log(chalk.yellow('\n⚠️  These SUs are now immutable'));

    } catch (error) {
        spinner.fail('Close failed');
        throw error;
    }
}

module.exports = { run };