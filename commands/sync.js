const chalk = require('chalk');
const ora = require('ora');
const files = require('../lib/files');
const ethLogic = require('../logic/ethLogic');
const gitLogic = require('../logic/gitLogic');

let w1, w2, k, mc, sg;

async function init() {
    const res = await files.readWallet(false);
    w1 = res.wallet1;
    w2 = res.wallet2;
    k = res.pkey;
    const inquirer = require('../lib/inquirer');
    const ethHost = await inquirer.ethHost();
    ethLogic.connect(w1, w2, k, ethHost.host);
    mc = files.loadTree();
    sg = files.loadSG();
}

async function run() {
    const spinner = ora('Syncing...').start();
    
    try {
        await init();
        
        if (sg.length === 0) {
            spinner.fail('Nothing staged');
            return;
        }
        
        const [openRoot, closedRoot, openL, closedL] = files.createSGTrees(sg);
        const today = new Date();
        
        let openSG, openWitness;
        if (openRoot != null) {
            [openWitness, openSG] = ethLogic.addToTree(openRoot, mc, false, today, openL);
        } else {
            spinner.fail('No open SUs');
            return;
        }
        
        const date = today.toISOString();
        const [mkcHash, receipt, bktimestamp] = await ethLogic.registerMC(mc);
        
        spinner.text = 'Creating registration files...';
        
        for (let el of openL) {
            let o = {
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
            };
            files.createRegistration(o);
            await gitLogic.makeRegistrationCommit(el.path);
        }
        
        gitLogic.changeDir('.');
        files.flushSG();
        files.saveTree(mc);
        
        spinner.succeed('Synced to blockchain!');
        console.log(chalk.cyan('\n📊 Transaction:'));
        console.log(chalk.gray('  Hash: ') + receipt.transactionHash);
        console.log(chalk.gray('  Block: ') + receipt.blockNumber);
        console.log(chalk.gray('  SUs: ') + openL.length);
        
    } catch (error) {
        spinner.fail('Sync failed');
        throw error;
    }
}

module.exports = { run };