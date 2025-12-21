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
    const spinner = ora('Loading...').start();

    try {
        await init();

        if (sg.length === 0) {
            spinner.fail('Nothing staged');
            return;
        }

        spinner.stop();

        const choices = sg.map((su, idx) => ({
            name: su.path,
            value: idx
        }));

        const { toClose } = await inquirer.prompt([{
            type: 'checkbox',
            name: 'toClose',
            message: 'Select to CLOSE (others will sync):',
            choices: choices
        }]);

        const toSync = [];
        const toCloseList = [];

        sg.forEach((su, idx) => {
            if (toClose.includes(idx)) {
                toCloseList.push(su);
            } else {
                toSync.push(su);
            }
        });

        spinner.start('Processing...');

        const [openRoot, closedRoot, openL, closedL] = files.createSGTrees([
            ...toSync.map(su => ({ ...su, closed: false })),
            ...toCloseList.map(su => ({ ...su, closed: true }))
        ]);

        const today = new Date();
        let openSG, openWitness, closedSG, closedWitness;

        if (openRoot !== null) {
            [openWitness, openSG] = ethLogic.addToTree(openRoot, mc, false, today, toSync);
        }

        if (closedRoot !== null) {
            [closedWitness, closedSG] = ethLogic.addToTree(closedRoot, mc, true, today, toCloseList);
        }

        const date = today.toISOString();
        const [mkcHash, receipt, bktimestamp] = await ethLogic.registerMC(mc);

        if (openRoot !== null) {
            for (let el of toSync) {
                files.createRegistration({
                    path: el.path,
                    type: "synchronization",
                    mkcalroot: mkcHash,
                    mkcaltimestamp: date,
                    txhash: receipt.transactionHash,
                    bkhash: receipt.blockHash,
                    bkheight: receipt.blockNumber,
                    bktimestamp: bktimestamp,
                    witness: openWitness,
                    openstoragegroup: openSG
                });
                await gitLogic.makeRegistrationCommit(el.path);
            }
        }

        if (closedRoot !== null) {
            for (let el of toCloseList) {
                files.createRegistration({
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
                });

                gitLogic.changeDir(el.path);
                const vericl = files.readVericlFile();
                vericl.offhash.closed = true;
                await files.saveVericlJSON(vericl);
                await gitLogic.makeRegistrationCommit(el.path);
            }
        }

        gitLogic.changeDir('.');
        files.flushSG();
        files.saveTree(mc);

        spinner.succeed('Done!');
        console.log(chalk.gray('  Synced: ') + toSync.length);
        console.log(chalk.gray('  Closed: ') + toCloseList.length);

    } catch (error) {
        spinner.fail('Failed');
        throw error;
    }
}

module.exports = { run };