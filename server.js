/**
 * Vericlasify - Express Server
 * All endpoints require explicit targetPath to prevent server.js deletion
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const files = require('./lib/files');
const treelist = require('./lib/treelist');

const app = express();
const PORT = 3001;
const SERVER_DIR = __dirname;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'ui')));

function readConfig() {
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function writeConfig(config) {
    fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
}

function isServerDirectory(checkPath) {
    const normalizedCheck = path.normalize(checkPath).toLowerCase();
    const normalizedServer = path.normalize(SERVER_DIR).toLowerCase();
    return normalizedCheck === normalizedServer || normalizedCheck.startsWith(normalizedServer + path.sep);
}

// Calculate content-aware hash of all files in a directory
function calculateContentHash(fileList) {
    const hashedList = [];
    for (const filePath of fileList) {
        try {
            if (fs.lstatSync(filePath).isFile()) {
                const content = fs.readFileSync(filePath);
                const hash = crypto.createHash('sha256').update(content).digest('hex');
                hashedList.push(`${filePath}:${hash}`);
            } else {
                hashedList.push(`${filePath}:dir`);
            }
        } catch (e) {
            hashedList.push(`${filePath}:error`);
        }
    }
    hashedList.sort();
    return crypto.createHash('sha256').update(JSON.stringify(hashedList)).digest('hex');
}

app.get('/api', (req, res) => {
    res.json({ name: 'Vericlasify API', version: '1.0.0' });
});

app.get('/api/status', (req, res) => {
    res.json({ success: true, serverDir: SERVER_DIR, version: '1.0.0' });
});

// Create storage unit - requires targetPath
app.post('/api/create', async (req, res) => {
    try {
        const { targetPath, name, description } = req.body;

        if (!targetPath || targetPath.trim() === '') {
            return res.json({ success: false, error: 'Directory path is required.' });
        }

        const workingDir = targetPath.trim();

        if (isServerDirectory(workingDir)) {
            return res.json({ success: false, error: 'Cannot create in server directory.' });
        }

        if (!fs.existsSync(workingDir)) {
            return res.json({ success: false, error: `Directory not found: ${workingDir}` });
        }

        const originalCwd = process.cwd();
        process.chdir(workingDir);

        try {
            if (files.fileExists('.pinesu.json')) {
                process.chdir(originalCwd);
                return res.json({ success: false, error: 'Storage unit already exists.' });
            }

            // Initialize git
            if (!fs.existsSync('.git')) {
                try {
                    const simpleGit = require('simple-git');
                    await simpleGit(workingDir).init();
                } catch (e) { }
            }

            const { v4: uuidv4 } = require('uuid');
            const uuid = uuidv4();
            const now = new Date().toISOString();

            const fileList = [];
            files.getFilelist('.', fileList);

            // Calculate hash from actual file CONTENTS
            const contentHash = calculateContentHash(fileList);

            const pinesu = {
                header: {
                    uuid, name: name || 'Storage Unit',
                    description: description || '',
                    created: now, mdtime: now
                },
                filelist: fileList,
                hash: contentHash,
                offhash: { closed: false }
            };

            await files.savePineSUJSON(pinesu);

            if (!fs.existsSync('.gitignore')) {
                fs.writeFileSync('.gitignore', 'node_modules\n.pinesu.json\n.regpinesu.json\n');
            }

            process.chdir(originalCwd);

            res.json({
                success: true,
                data: { uuid, name: pinesu.header.name, path: workingDir, files: fileList.length, hash: contentHash }
            });
        } catch (error) {
            process.chdir(originalCwd);
            throw error;
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Stage files
app.post('/api/stage', async (req, res) => {
    try {
        const { targetPath } = req.body;

        if (!targetPath || targetPath.trim() === '') {
            return res.json({ success: false, error: 'Directory path is required.' });
        }

        const workingDir = targetPath.trim();
        const originalCwd = process.cwd();
        process.chdir(workingDir);

        try {
            if (!files.fileExists('.pinesu.json')) {
                process.chdir(originalCwd);
                return res.json({ success: false, error: 'No storage unit found.' });
            }

            const pinesu = files.readPineSUFile();

            const sg = files.loadSG() || [];
            const alreadyStaged = sg.find(s => s.path === workingDir);
            if (alreadyStaged) {
                process.chdir(originalCwd);
                return res.json({ success: false, error: 'Already staged.' });
            }

            sg.push({
                path: workingDir,
                uuid: pinesu.header.uuid,
                hash: pinesu.hash,
                staged: new Date().toISOString()
            });

            files.saveSG(sg);
            process.chdir(originalCwd);

            res.json({ success: true, data: { stagedCount: sg.length, path: workingDir, hash: pinesu.hash } });
        } catch (error) {
            process.chdir(originalCwd);
            throw error;
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Sync to blockchain
app.post('/api/sync', async (req, res) => {
    try {
        const { ethHost } = req.body;
        const host = ethHost || 'http://127.0.0.1:8545';

        const config = readConfig();
        if (!config || !config.wallet1) {
            return res.json({ success: false, error: 'No wallet configured.' });
        }

        const sg = files.loadSG() || [];
        if (sg.length === 0) {
            return res.json({ success: false, error: 'Nothing staged.' });
        }

        const ethLogic = require('./logic/ethLogic');
        ethLogic.connect(config.wallet1, config.wallet2, config.pkey || '', host);
        const mc = files.loadTree();

        const [openRoot, closedRoot, openL, closedL] = files.createSGTrees(sg);

        if (openRoot == null) {
            return res.json({ success: false, error: 'No open storage units.' });
        }

        try {
            const today = new Date();
            const [openWitness, openSG] = ethLogic.addToTree(openRoot, mc, false, today, openL);
            const [mkcHash, receipt, bktimestamp] = await ethLogic.registerMC(mc);

            const gitLogic = require('./logic/gitLogic');
            for (let el of openL) {
                try {
                    files.createRegistration({
                        path: el.path,
                        type: "synchronization",
                        mkcalroot: mkcHash,
                        mkcaltimestamp: today.toISOString(),
                        txhash: receipt.transactionHash,
                        bkhash: receipt.blockHash,
                        bkheight: receipt.blockNumber,
                        bktimestamp,
                        witness: openWitness,
                        openstoragegroup: openSG
                    });
                    try { await gitLogic.makeRegistrationCommit(el.path); } catch (e) { }
                } catch (e) { }
            }

            gitLogic.changeDir('.');
            files.flushSG();
            files.saveTree(mc);

            res.json({
                success: true,
                data: { txHash: receipt.transactionHash, blockNumber: receipt.blockNumber, unitssynced: openL.length }
            });
        } catch (syncError) {
            return res.json({ success: false, error: `Sync failed: ${syncError.message}` });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Check blockchain - NOW DETECTS CONTENT CHANGES
app.post('/api/checkbc', async (req, res) => {
    try {
        const { targetPath, ethHost } = req.body;

        if (!targetPath || targetPath.trim() === '') {
            return res.json({ success: false, error: 'Directory path is required.' });
        }

        const workingDir = targetPath.trim();

        if (!fs.existsSync(workingDir)) {
            return res.json({ success: false, error: `Directory not found: ${workingDir}` });
        }

        const originalCwd = process.cwd();
        process.chdir(workingDir);

        try {
            if (!files.fileExists('.pinesu.json')) {
                process.chdir(originalCwd);
                return res.json({ success: false, error: 'No storage unit found.' });
            }

            const reg = files.readRegistrationFile();
            if (reg[0] === "null" || !reg.txhash) {
                process.chdir(originalCwd);
                return res.json({ success: false, error: 'No registration found. Sync first.' });
            }

            const pinesu = files.readPineSUFile();

            // Get current file list and calculate CONTENT hash
            const currentFileList = [];
            files.getFilelist('.', currentFileList);
            const currentHash = calculateContentHash(currentFileList);

            // Compare with registered hash
            const registeredHash = pinesu.hash;
            const filesMatch = (currentHash === registeredHash);

            process.chdir(originalCwd);

            res.json({
                success: true,
                data: {
                    filesMatch,
                    currentHash,
                    registeredHash,
                    txHash: reg.txhash,
                    block: reg.bkheight,
                    files: currentFileList.length,
                    closed: pinesu.offhash?.closed || false,
                    message: filesMatch ?
                        '✓ Files unchanged since registration' :
                        '⚠️ FILES HAVE BEEN MODIFIED!'
                }
            });
        } catch (error) {
            process.chdir(originalCwd);
            throw error;
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Settings
app.get('/api/settings', (req, res) => {
    const config = readConfig();
    if (!config) return res.json({ success: true, data: { configured: false } });
    res.json({
        success: true,
        data: {
            configured: true,
            wallet1: config.wallet1 ? `${config.wallet1.slice(0, 10)}...${config.wallet1.slice(-6)}` : null,
            wallet2: config.wallet2 ? `${config.wallet2.slice(0, 10)}...${config.wallet2.slice(-6)}` : null,
            hasPrivateKey: !!config.pkey
        }
    });
});

app.post('/api/settings', (req, res) => {
    const { wallet1, wallet2, privateKey, pkey } = req.body;
    const w1 = wallet1 ? wallet1.trim() : '';
    const pk = (privateKey || pkey) ? (privateKey || pkey).trim() : '';

    if (!w1 || !w1.startsWith('0x') || w1.length !== 42) {
        return res.json({ success: false, error: 'Invalid wallet format.' });
    }

    writeConfig({ wallet1: w1, wallet2: wallet2?.trim() || w1, pkey: pk });
    res.json({ success: true, data: { message: 'Saved' } });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'ui', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║   🚀 Vericlasify Server - http://localhost:${PORT}         ║
╚══════════════════════════════════════════════════════════╝`);
});

module.exports = app;
