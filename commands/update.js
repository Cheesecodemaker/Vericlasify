const chalk = require('chalk');
const ora = require('ora');
const files = require('../lib/files');
const gitLogic = require('../logic/gitLogic');

async function run() {
    const spinner = ora('Updating...').start();
    
    try {
        if (!files.fileExists('.pinesu.json')) {
            spinner.fail('No Storage Unit');
            return;
        }
        
        const oldContent = files.readPineSUFile();
        
        if (oldContent.offhash && oldContent.offhash.closed) {
            spinner.fail('Closed - cannot update');
            return;
        }
        
        const filelist = await gitLogic.calculateSU();
        if (filelist[0] === "null") {
            spinner.fail('No files');
            return;
        }
        
        const merkleroot = gitLogic.calculateTree(filelist);
        let remote = await gitLogic.getRemote();
        if (!remote || remote.length === 0) remote = oldContent.header.remote || "localhost";
        
        const pineSUFile = {
            hash: null,
            header: {
                uuid: oldContent.header.uuid,
                remote: remote,
                owner: oldContent.header.owner,
                name: oldContent.header.name || files.getCurrentDirectoryBase(),
                description: oldContent.header.description || "",
                crtime: oldContent.header.crtime || new Date().toISOString(),
                prevmkcalroot: oldContent.header.prevmkcalroot,
                prevsuhash: oldContent.hash,
                prevbcregnumber: oldContent.offhash.bcregnumber,
                prevbcregtime: oldContent.offhash.bcregtime,
                prevclosed: oldContent.offhash.closed,
                merkleroot: merkleroot
            },
            filelist: filelist,
            offhash: {
                bcregnumber: oldContent.offhash.bcregnumber || 0,
                bcregtime: oldContent.offhash.bcregtime,
                closed: false
            }
        };
        
        pineSUFile.hash = gitLogic.calculateHeader(pineSUFile.header);
        await files.savePineSUJSON(pineSUFile);
        
        await gitLogic.addAllSU();
        await gitLogic.commitSU("Updated Storage Unit");
        
        spinner.succeed('Updated!');
        console.log(chalk.cyan('\n📊 Details:'));
        console.log(chalk.gray('  Files: ') + filelist.length);
        console.log(chalk.gray('  Hash: ') + pineSUFile.hash.substring(0, 16) + '...');
        
    } catch (error) {
        spinner.fail('Update failed');
        throw error;
    }
}

module.exports = { run };