const { expect } = require('chai');
const { ethers } = require('ethers');
const ganache = require('ganache');
const EthConnector = require('../connectors/ethConnector');

describe('Blockchain Integration Tests with Ethers.js', function () {
    this.timeout(20000); // 20 seconds timeout

    let provider;
    let ethConnector;
    let server;

    const HOST = 'http://127.0.0.1:8546';
    // Using a standard test mnemonic
    const MNEMONIC = 'test test test test test test test test test test test junk';

    let w1Address, w2Address, privateKey1;

    before(async function () {
        // 1. Start a local Ganache server instance specifically for tests
        server = ganache.server({
            wallet: { mnemonic: MNEMONIC },
            logging: { quiet: true } // Suppress verbose ganache logs
        });
        await server.listen(8546);

        // 2. Wrap it with Ethers.js JsonRpcProvider
        provider = new ethers.JsonRpcProvider(HOST);

        // 3. Setup wallets using known private keys for the test mnemonic
        const privateKey1Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
        const privateKey2Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

        const wallet1 = new ethers.Wallet(privateKey1Hex, provider);
        const wallet2 = new ethers.Wallet(privateKey2Hex, provider);

        w1Address = wallet1.address;
        w2Address = wallet2.address;
        privateKey1 = wallet1.privateKey;

        // 4. Initialize EthConnector
        ethConnector = new EthConnector(HOST, w1Address, w2Address, privateKey1);
    });

    after(async function () {
        if (server) {
            await server.close();
        }
    });

    it('should deploy a dummy Merkle root to the blockchain', async function () {
        const dummyHashRoot = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

        // Use ethConnector to deploy the hash root
        const receipt = await ethConnector.deploy(dummyHashRoot);

        expect(receipt).to.exist;
        expect(receipt.transactionHash).to.be.a('string');
        expect(receipt.status).to.be.true; // Transaction success status
    });

    it('should verify the hash transaction on the blockchain', async function () {
        const dummyHashRoot = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
        const receipt = await ethConnector.deploy(dummyHashRoot);

        // Fetch the transaction using Ethers.js
        const tx = await provider.getTransaction(receipt.transactionHash);

        // Verify transaction data contains the hash root
        expect(tx).to.not.be.null;

        // Verify with Ethers.js directly
        expect(tx.from.toLowerCase()).to.equal(w1Address.toLowerCase());
        expect(tx.to.toLowerCase()).to.equal(w2Address.toLowerCase());

        // The data in tx.data should be "0x" + our dummyHashRoot
        expect(tx.data).to.equal('0x' + dummyHashRoot);

        // Verify with ethConnector's built-in verifyHash method
        const [ownerInfo, isValid] = await ethConnector.verifyHash(
            receipt.transactionHash,
            receipt.blockNumber,
            dummyHashRoot,
            w1Address
        );

        expect(isValid).to.be.true;
        expect(ownerInfo.toLowerCase()).to.equal((w1Address + w1Address).toLowerCase());
    });

    it('should fetch the block details successfully', async function () {
        const dummyHashRoot = '1111111111111111111111111111111111111111111111111111111111111111';
        const receipt = await ethConnector.deploy(dummyHashRoot);

        const block = await ethConnector.getBlock(receipt.blockNumber);

        expect(block).to.not.be.null;
        expect(block.number).to.equal(receipt.blockNumber);
        expect(block.transactions).to.include(receipt.transactionHash);
        expect(block.timestamp).to.be.a('number'); // Web3 returns number for timestamps
    });

    it('should fail to verify if the root does not match', async function () {
        const actualHashRoot = '2222222222222222222222222222222222222222222222222222222222222222';
        const wrongHashRoot = '3333333333333333333333333333333333333333333333333333333333333333';

        const receipt = await ethConnector.deploy(actualHashRoot);

        const [ownerInfo, isValid] = await ethConnector.verifyHash(
            receipt.transactionHash,
            receipt.blockNumber,
            wrongHashRoot,
            w1Address
        );

        expect(isValid).to.be.false;
    });

    it('should fail to verify if the sender address does not match', async function () {
        const dummyHashRoot = '4444444444444444444444444444444444444444444444444444444444444444';
        const receipt = await ethConnector.deploy(dummyHashRoot);

        // Try to verify with a different wallet address
        const wrongAddress = '0x1111111111111111111111111111111111111111';

        const [ownerInfo, isValid] = await ethConnector.verifyHash(
            receipt.transactionHash,
            receipt.blockNumber,
            dummyHashRoot,
            wrongAddress
        );

        expect(isValid).to.be.false;
    });

    it('should fail to verify if the transaction is not in the block', async function () {
        const dummyHashRoot = '5555555555555555555555555555555555555555555555555555555555555555';
        const receipt = await ethConnector.deploy(dummyHashRoot);

        // A fabricated transaction hash
        // It must be 32 bytes (64 hex characters) long, starting with 0x
        const wrongTxHash = '0x0000000000000000000000000000000000000000000000000000000000000000';

        const [ownerInfo, isValid] = await ethConnector.verifyHash(
            wrongTxHash,
            receipt.blockNumber,
            dummyHashRoot,
            w1Address
        );

        expect(isValid).to.be.false;
    });
});
