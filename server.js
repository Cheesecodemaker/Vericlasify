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

// List files in a storage unit directory
app.post('/api/listfiles', (req, res) => {
    try {
        const { targetPath } = req.body;

        if (!targetPath || targetPath.trim() === '') {
            return res.json({ success: false, error: 'Directory path is required.' });
        }

        const workingDir = targetPath.trim();

        if (!fs.existsSync(workingDir)) {
            return res.json({ success: false, error: `Directory not found: ${workingDir}` });
        }

        // Check if it's a storage unit
        const pinesuPath = path.join(workingDir, '.pinesu.json');
        if (!fs.existsSync(pinesuPath)) {
            return res.json({ success: false, error: 'No storage unit found. Create one first.' });
        }

        // Read pinesu to get storage unit info
        const pinesu = JSON.parse(fs.readFileSync(pinesuPath, 'utf8'));

        // Get all files recursively
        const originalCwd = process.cwd();
        process.chdir(workingDir);

        const fileList = [];
        files.getFilelist('.', fileList);

        process.chdir(originalCwd);

        // Build file info with sizes
        const fileInfo = fileList.filter(f => {
            const fullPath = path.join(workingDir, f);
            return fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile();
        }).map(f => {
            const fullPath = path.join(workingDir, f);
            const stats = fs.statSync(fullPath);
            return {
                path: f,
                fullPath: fullPath,
                size: stats.size,
                ext: path.extname(f).toLowerCase()
            };
        });

        res.json({
            success: true,
            data: {
                storageUnit: pinesu.header?.name || 'Unknown',
                uuid: pinesu.header?.uuid,
                totalFiles: fileInfo.length,
                files: fileInfo
            }
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
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

// Update storage unit (recalculate hashes after modifications)
app.post('/api/update', async (req, res) => {
    try {
        const { targetPath } = req.body;

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
                return res.json({ success: false, error: 'No storage unit found. Create one first.' });
            }

            const pinesu = files.readPineSUFile();
            const oldHash = pinesu.hash;

            // Get current file list
            const fileList = [];
            files.getFilelist('.', fileList);

            // Calculate new content hash
            const newHash = calculateContentHash(fileList);

            // Update pinesu with new values
            pinesu.header.mdtime = new Date().toISOString();
            pinesu.filelist = fileList;
            pinesu.hash = newHash;

            // Save previous hash info
            pinesu.header.prevhash = oldHash;

            await files.savePineSUJSON(pinesu);

            process.chdir(originalCwd);

            const hasChanged = oldHash !== newHash;

            res.json({
                success: true,
                data: {
                    files: fileList.length,
                    oldHash,
                    newMerkleroot: newHash,
                    changed: hasChanged,
                    message: hasChanged
                        ? 'Storage unit updated with new changes.'
                        : 'No changes detected, hash unchanged.'
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

// Check individual file integrity
app.post('/api/checkfile', async (req, res) => {
    try {
        const { filePath, ethHost } = req.body;

        if (!filePath || filePath.trim() === '') {
            return res.json({ success: false, error: 'File path is required.' });
        }

        const targetFile = path.resolve(filePath.trim());

        if (!fs.existsSync(targetFile)) {
            return res.json({ success: false, error: `File not found: ${targetFile}` });
        }

        if (!fs.lstatSync(targetFile).isFile()) {
            return res.json({ success: false, error: 'Path is not a file.' });
        }

        // Calculate current file hash
        const content = fs.readFileSync(targetFile);
        const currentHash = crypto.createHash('sha256').update(content).digest('hex');

        // Find parent directory with .pinesu.json
        let currentDir = path.dirname(targetFile);
        let pinesuPath = null;
        let storageUnitDir = null;

        for (let i = 0; i < 10; i++) {
            const testPath = path.join(currentDir, '.pinesu.json');
            if (fs.existsSync(testPath)) {
                pinesuPath = testPath;
                storageUnitDir = currentDir;
                break;
            }
            const parent = path.dirname(currentDir);
            if (parent === currentDir) break;
            currentDir = parent;
        }

        if (!pinesuPath) {
            return res.json({
                success: true,
                data: {
                    path: targetFile,
                    currentHash,
                    inStorageUnit: false,
                    modified: null,
                    message: 'File is not part of any registered storage unit.'
                }
            });
        }

        // Read pinesu file
        const pinesu = JSON.parse(fs.readFileSync(pinesuPath, 'utf8'));
        const relativePath = path.relative(storageUnitDir, targetFile).replace(/\\/g, '/');

        // Find if file is in filelist
        let fileFound = false;
        if (pinesu.filelist) {
            for (const entry of pinesu.filelist) {
                const entryPath = entry.split(':')[0].replace(/\\/g, '/');
                if (entryPath === relativePath ||
                    entryPath === './' + relativePath ||
                    entryPath === relativePath.replace(/^\.\//, '') ||
                    relativePath.endsWith(entryPath) ||
                    entryPath.endsWith(relativePath)) {
                    fileFound = true;
                    break;
                }
            }
        }

        // Recalculate storage unit hash with current files to detect any changes
        const originalCwd = process.cwd();
        process.chdir(storageUnitDir);

        const fileList = [];
        files.getFilelist('.', fileList);
        const currentStorageHash = calculateContentHash(fileList);

        process.chdir(originalCwd);

        // Compare current storage hash with registered hash
        const storageModified = (currentStorageHash !== pinesu.hash);

        let message = '';
        if (fileFound) {
            if (storageModified) {
                message = '⚠️ FILES HAVE BEEN MODIFIED! Storage unit hash mismatch.';
            } else {
                message = '✓ File integrity verified - no modifications detected.';
            }
        } else {
            message = '⚠️ File not found in registered file list - may be a new file.';
        }

        res.json({
            success: true,
            data: {
                path: targetFile,
                currentHash,
                inStorageUnit: fileFound,
                modified: storageModified,
                storageUnit: pinesu.header?.name || 'Unknown',
                uuid: pinesu.header?.uuid,
                registeredStorageHash: pinesu.hash,
                currentStorageHash,
                message
            }
        });
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
    const w2 = wallet2 ? wallet2.trim() : w1;
    const pk = (privateKey || pkey) ? (privateKey || pkey).trim() : '';

    if (!w1 || !w1.startsWith('0x') || w1.length !== 42) {
        return res.json({ success: false, error: 'Invalid wallet format.' });
    }

    writeConfig({ wallet1: w1, wallet2: w2, pkey: pk });
    res.json({
        success: true,
        data: {
            message: 'Saved',
            wallet1: `${w1.slice(0, 10)}...${w1.slice(-6)}`,
            wallet2: `${w2.slice(0, 10)}...${w2.slice(-6)}`,
            hasPrivateKey: !!pk
        }
    });
});

// Git commands endpoint
app.post('/api/git', async (req, res) => {
    try {
        const { command, targetPath } = req.body;

        if (!command) {
            return res.json({ success: false, error: 'Command required.' });
        }

        // Use targetPath or current directory with .pinesu.json
        let workingDir = targetPath && targetPath.trim() !== '' ? targetPath.trim() : process.cwd();

        if (!fs.existsSync(workingDir)) {
            return res.json({ success: false, error: `Directory not found: ${workingDir}` });
        }

        // Parse the git command
        const args = command.split(' ').filter(s => s.trim() !== '');

        const simpleGit = require('simple-git');
        const git = simpleGit(workingDir);

        let output = '';

        try {
            // Execute the git command
            output = await git.raw(args);
        } catch (gitError) {
            output = gitError.message || 'Git command failed';
        }

        res.json({ success: true, output: output || 'Command executed (no output)' });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'ui', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║   🚀 Vericlasify Server - http://localhost:${PORT}       ║
╚══════════════════════════════════════════════════════════╝`);
});

module.exports = app;
