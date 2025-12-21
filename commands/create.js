const chalk = require('chalk');
const ora = require('ora');
const {v4: uuidv4} = require("uuid");
const files = require("../lib/files");
const ethLogic = require("../logic/ethLogic");
const gitLogic = require("../logic/gitLogic");
const inquirer = require("../lib/inquirer");

let w1, w2, k;

async function init() {
    const res = await files.readWallet(false);
    w1 = res.wallet1;
    w2 = res.wallet2;
    k = res.pkey;
    const ethHost = await inquirer.ethHost();
    ethLogic.connect(w1, w2, k, ethHost.host);
}

async function run() {
    try {
        await init();
        const spinner = ora('Creating...').start();
        
        if (files.fileExists('.git')) {
            spinner.info('Git exists');
        } else {
            gitLogic.init();
        }
        
        if (files.fileExists('.pinesu.json')) {
            spinner.fail('Already exists');
            return;
        }
        
        const filelist = await gitLogic.calculateSU();
        if (!filelist || filelist[0] === "null") {
            spinner.fail('No files found');
            return;
        }
        
        const merkleroot = gitLogic.calculateTree(filelist);
        let remote = await gitLogic.getRemote();
        if (!remote || remote.length === 0) remote = "localhost";
        
        spinner.stop();
        const details = await inquirer.askSUDetails(
            files.getCurrentDirectoryBase(),
            remote
        );
        
        spinner.start('Saving...');
        
        const pineSUFile = {
            hash: null,
            header: {
                uuid: uuidv4(),
                remote: details.remote,
                owner: w1,
                name: details.name,
                description: details.description || "",
                crtime: new Date().toISOString(),
                prevmkcalroot: null,
                prevsuhash: null,
                prevbcregnumber: null,
                prevbcregtime: null,
                prevclosed: null,
                merkleroot: merkleroot
            },
            filelist: filelist,
            offhash: {
                bcregnumber: 0,
                bcregtime: null,
                closed: false
            }
        };
        
        pineSUFile.hash = gitLogic.calculateHeader(pineSUFile.header);
        await files.savePineSUJSON(pineSUFile);
        
        try {
            if (details.remote !== "localhost") {
                await gitLogic.setRemote(details.remote);
            }
        } catch (e) {}
        
        await gitLogic.addAllSU();
        await gitLogic.commitSU("Storage Unit created");
        
        spinner.succeed('Created!');
        console.log(chalk.cyan('\n📊 Storage Unit:'));
        console.log(chalk.gray('  Name: ') + details.name);
        console.log(chalk.gray('  UUID: ') + pineSUFile.header.uuid);
        console.log(chalk.gray('  Files: ') + filelist.length);
        
    } catch (error) {
        spinner.fail('Failed');
        throw error;
    }
}

module.exports = { run };