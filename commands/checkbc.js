const chalk = require('chalk');
const ora = require('ora');
const files = require('../lib/files');
const gitLogic = require('../logic/gitLogic');
const ethLogic = require('../logic/ethLogic');
const treelist = require('../lib/treelist');

let w1, w2, k;

async function init() {
    const res = await files.readWallet(false);
    w1 = res.wallet1;
    w2 = res.wallet2;
    k = res.pkey;
    const inquirer = require('../lib/inquirer');
    const ethHost = await inquirer.ethHost();
    ethLogic.connect(w1, w2, k, ethHost.host);
}

async function run() {
    // Init first (has inquirer prompts) before starting spinner
    await init();

    const spinner = ora('Verifying...').start();

    try {

        if (!files.fileExists('.vericl.json')) {
            spinner.fail('No Storage Unit');
            return;
        }

        if (!files.fileExists('.regvericl.json')) {
            spinner.fail('Not registered');
            console.log(chalk.yellow('💡 Use syncwbc first'));
            return;
        }

        spinner.text = 'Reading files...';
        const vericl = files.readVericlFile();
        const registration = files.readRegistrationFile();

        spinner.text = 'Checking blockchain...';

        // Use wallet address (w1) for verification since owner may not be set
        const ownerAddress = vericl.header.owner || w1;

        const [isValid, owner] = await ethLogic.verifyHash(
            registration.txhash,
            registration.bkheight,
            registration.mkcalroot,
            ownerAddress
        );

        if (!isValid) {
            spinner.fail('Blockchain check failed');
            return;
        }

        spinner.text = 'Computing hashes...';

        const filelist = await gitLogic.calculateSU();
        const computedMerkleRoot = gitLogic.calculateTree(filelist);

        if (computedMerkleRoot !== vericl.header.merkleroot) {
            spinner.fail('Files modified!');
            console.log(chalk.red('✖ Integrity violation detected'));
            return;
        }

        const computedSUHash = gitLogic.calculateHeader(vericl.header);

        if (computedSUHash !== vericl.hash) {
            spinner.fail('Metadata tampered!');
            return;
        }

        spinner.text = 'Verifying proof...';

        const [proofValid, proofDetails] = treelist.validateProof(vericl.hash, registration);

        if (!proofValid) {
            spinner.fail('Proof invalid');
            return;
        }

        spinner.succeed('Integrity verified!');

        console.log(chalk.green('\n✔ Storage Unit is valid'));
        console.log(chalk.cyan('\n📊 Details:'));
        console.log(chalk.gray('  Files: ') + filelist.length);
        console.log(chalk.gray('  Block: ') + registration.bkheight);
        console.log(chalk.gray('  TX: ') + registration.txhash);

        if (vericl.offhash.closed) {
            console.log(chalk.yellow('\n🔒 CLOSED (immutable)'));
        }

    } catch (error) {
        spinner.fail('Verification failed');
        throw error;
    }
}

module.exports = { run };