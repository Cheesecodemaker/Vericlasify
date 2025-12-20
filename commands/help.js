const chalk = require('chalk');

async function run() {
    console.log(chalk.cyan('\n📚 Vericlasify Help\n'));

    console.log(chalk.bold('Commands:\n'));

    console.log(chalk.cyan('  create / update'));
    console.log('    Create new SU or update existing one\n');

    console.log(chalk.cyan('  stage'));
    console.log('    Add SU to staging area for batching\n');

    console.log(chalk.cyan('  syncwbc'));
    console.log('    Synchronize open SUs with blockchain\n');

    console.log(chalk.cyan('  close'));
    console.log('    Close SUs permanently (immutable)\n');

    console.log(chalk.cyan('  checkbc'));
    console.log('    Verify integrity against blockchain\n');

    console.log(chalk.cyan('  checkfile'));
    console.log('    Verify individual file\n');

    console.log(chalk.cyan('  export'));
    console.log('    Create verifiable bundle\n');

    console.log(chalk.cyan('  git'));
    console.log('    Git operations\n');

    console.log(chalk.cyan('  settings'));
    console.log('    Configure wallet and blockchain\n');

    console.log(chalk.bold('Workflow:\n'));
    console.log('  1. create   → Initialize directory');
    console.log('  2. stage    → Add to staging');
    console.log('  3. syncwbc  → Register on blockchain');
    console.log('  4. checkbc  → Verify integrity\n');
}

module.exports = { run };