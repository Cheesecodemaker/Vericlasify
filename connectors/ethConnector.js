const Web3 = require('web3');

class EthConnector {

    #web3;
    #w1;
    #w2;
    #k;

    constructor(host, w1, w2, k) {
        this.#web3 = new Web3(host); //'HTTP://127.0.0.1:7545'
        this.#w1 = w1;
        this.#w2 = w2;
        this.#k = k;
    }

    async deploy(hashRoot) {

        const txObject = {
            from: this.#w1,
            to: this.#w2,
            data: hashRoot + ''
        };

        txObject.gas = await this.#web3.eth.estimateGas(txObject);

        console.log(txObject.gas)

        console.log('Sending a transaction from ' + this.#w1 + ' to ' + this.#w2);
        const createTransaction = await this.#web3.eth.accounts.signTransaction(txObject, this.#k);
        const receipt = await this.#web3.eth.sendSignedTransaction(createTransaction.rawTransaction);
        //console.log(receipt);
        //console.log('Transaction successfull with hash: '+createTransaction.messageHash+': '+web3.utils.utf8ToHex("Hello Worldd"));
        //console.log(web3.eth.accounts.recoverTransaction(createTransaction.rawTransaction));
        //console.log(await web3.eth.getTransaction(receipt.transactionHash));
        return receipt;
    }

    async getBlock(blockNumber) {
        return await this.#web3.eth.getBlock(blockNumber);
    }

    async verifyHash(transactionHash, blockNum, root, w1) {
        try {
            const block = await this.#web3.eth.getBlock(blockNum);

            if (!block) {
                console.log('Block not found:', blockNum);
                return [false, null];
            }

            if (block.transactions.includes(transactionHash)) {
                const res = await this.#web3.eth.getTransaction(transactionHash);

                if (res.input == "0x" + root && res.from.toUpperCase() == w1.toUpperCase()) {
                    return [true, res.from];
                } else {
                    return [false, res.from];
                }
            } else {
                console.log('Transaction not in block');
                return [false, null];
            }
        } catch (error) {
            console.log('Verify error:', error.message);
            return [false, null];
        }
    }
}

module.exports = EthConnector;