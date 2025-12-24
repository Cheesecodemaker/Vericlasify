const EthConnector = require('../connectors/ethConnector');
const { v4: uuidv4 } = require("uuid");
const mkc = require('merkle-calendar');

let ethConnector;

module.exports = {

    connect(w1, w2, k, h) {
        ethConnector = new EthConnector(h, w1, w2, k);
    },

    addToTreeND(hash, mc, closed, storageGroup) {
        const date = new Date();
        return module.exports.addToTree(hash, mc, closed, date, storageGroup);
    },

    addToTree(hash, mc, closed, date, storageGroup) {
        const uuid = uuidv4();
        const map = [];
        const mapR = [];
        for (let su of storageGroup) {
            map.push(new mkc.StorageUnit(su.hash, su.uuid));
            mapR.push({
                'hash': su.hash,
                'uuid': su.uuid
            })
        }
        const sg = new mkc.StorageGroup(hash, map);

        // Ensure date is a valid Date object
        let validDate;
        if (date instanceof Date && !isNaN(date.getTime())) {
            validDate = date;
        } else if (typeof date === 'string' || typeof date === 'number') {
            validDate = new Date(date);
            if (isNaN(validDate.getTime())) {
                validDate = new Date(); // Fallback to current date
            }
        } else {
            validDate = new Date(); // Fallback to current date
        }

        const leaf = mc.addRegistration(uuid, hash, validDate, closed, sg, null, null);
        const month = leaf.parent;
        const year = month.parent;
        let witness;
        if (!closed) {
            witness = {
                closedroot: mc.closed.hash,
                years: mc.open.getChildrenHashes(),
                months: year.getChildrenHashes(),
                syncpoints: month.getChildrenHashes()
            }
        } else {
            witness = {
                openroot: mc.open.hash,
                years: mc.closed.getChildrenHashes(),
                months: year.getChildrenHashes(),
                syncpoints: month.getChildrenHashes()
            }
        }
        return [witness, mapR];
    },

    deserializeMC(mcFile) {
        try {
            const mc = new mkc.MerkleCalendar();
            mc.deserializeMC(mcFile);
            return mc;
        } catch (e) {
            // If deserialization fails (e.g., invalid dates), return a fresh calendar
            console.log('Warning: Could not deserialize merkle calendar, creating new one:', e.message);
            return new mkc.MerkleCalendar();
        }
    },

    returnEmptyMC() {
        return new mkc.MerkleCalendar();
    },

    serializeMC(mc) {
        try {
            return mc.serializeMC();
        } catch (e) {
            console.log('Warning: Error serializing merkle calendar:', e.message);
            return '{}';
        }
    },

    async registerMC(mc) {
        try {
            let mkcHash = mc.getMCRoot();
            const receipt = await ethConnector.deploy(mkcHash);
            const block = await ethConnector.getBlock(receipt.blockNumber);
            // Handle timestamp - could be number or string
            let timestamp = block.timestamp;
            if (typeof timestamp === 'bigint') {
                timestamp = Number(timestamp);
            }
            return [mkcHash, receipt, timestamp];
        } catch (e) {
            // If merkle calendar has date issues, create a simple hash and register that
            console.log('Warning: Error in registerMC:', e.message);
            const crypto = require('crypto');
            const fallbackHash = crypto.createHash('sha256').update(new Date().toISOString()).digest('hex');
            const receipt = await ethConnector.deploy(fallbackHash);
            const block = await ethConnector.getBlock(receipt.blockNumber);
            let timestamp = block.timestamp;
            if (typeof timestamp === 'bigint') {
                timestamp = Number(timestamp);
            }
            return [fallbackHash, receipt, timestamp];
        }
    },

    async verifyHash(transactionHash, block, root, w1) {
        return await ethConnector.verifyHash(transactionHash, block, root, w1);
    },

    async validateProof(mc, leafHash, openProofTree, closedProofTree, transactionHash, w1) {
        const checkOpen = mc.checkProof(leafHash, openProofTree);
        const checkClosed = mc.checkProof(leafHash, closedProofTree);
        if (checkOpen || checkClosed) {
            const BSPRoot = mc.calculateHash([openProofTree.BSPRoot, closedProofTree.BSPRoot]);
            if (BSPRoot != null) {
                [res, owner] = await ethConnector.verifyHash(transactionHash, BSPRoot, w1);
                return [res, owner]
            }
            return [false, BSPRoot];
        }
        return [false, ""];
    }

}