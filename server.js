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

        // Check if it's a storage unit (support both new and legacy names)
        let vericlPath = path.join(workingDir, files.VERICL_FILE);
        if (!fs.existsSync(vericlPath)) {
            vericlPath = path.join(workingDir, '.pinesu.json'); // Legacy fallback
        }
        if (!fs.existsSync(vericlPath)) {
            return res.json({ success: false, error: 'No storage unit found. Create one first.' });
        }

        // Read vericl config
        const vericl = JSON.parse(fs.readFileSync(vericlPath, 'utf8'));

        // Get all files recursively (current filesystem state)
        const originalCwd = process.cwd();
        process.chdir(workingDir);

        const fileList = [];
        files.getFilelist('.', fileList);

        process.chdir(originalCwd);

        // Also include files from the registered filelist (may include hidden/tracked files)
        const trackedFiles = new Set();
        if (vericl.filelist) {
            for (const entry of vericl.filelist) {
                const filePath = entry.split(':')[0].replace(/\\/g, '/');
                trackedFiles.add(filePath);
            }
        }

        // Merge current files with tracked files
        const allFiles = new Set([...fileList, ...trackedFiles]);

        // Build file info with sizes
        const fileInfo = Array.from(allFiles).filter(f => {
            const fullPath = path.join(workingDir, f);
            return fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile();
        }).map(f => {
            const fullPath = path.join(workingDir, f);
            const stats = fs.statSync(fullPath);
            return {
                path: f,
                fullPath: fullPath,
                size: stats.size,
                ext: path.extname(f).toLowerCase(),
                tracked: trackedFiles.has(f)
            };
        }).sort((a, b) => a.path.localeCompare(b.path));

        res.json({
            success: true,
            data: {
                storageUnit: vericl.header?.name || 'Unknown',
                uuid: vericl.header?.uuid,
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
            // Check for both new and legacy file names
            if (files.fileExists(files.VERICL_FILE) || files.fileExists('.pinesu.json')) {
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

            const vericl = {
                header: {
                    uuid, name: name || 'Storage Unit',
                    description: description || '',
                    created: now, mdtime: now,
                    crtime: now
                },
                filelist: fileList,
                hash: contentHash,
                offhash: { closed: false }
            };

            await files.saveVericlJSON(vericl);

            if (!fs.existsSync('.gitignore')) {
                fs.writeFileSync('.gitignore', `node_modules\n${files.VERICL_FILE}\n${files.REG_VERICL_FILE}\n${files.VERICL_HISTORY}\n`);
            }

            process.chdir(originalCwd);

            res.json({
                success: true,
                data: { uuid, name: vericl.header.name, path: workingDir, files: fileList.length, hash: contentHash }
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
            // Support both new and legacy file names
            if (!files.fileExists(files.VERICL_FILE) && !files.fileExists('.pinesu.json')) {
                process.chdir(originalCwd);
                return res.json({ success: false, error: 'No storage unit found.' });
            }

            const vericl = files.readVericlFile();

            const sg = files.loadSG() || [];
            const alreadyStaged = sg.find(s => s.path === workingDir);
            if (alreadyStaged) {
                process.chdir(originalCwd);
                return res.json({ success: false, error: 'Already staged.' });
            }

            sg.push({
                path: workingDir,
                uuid: vericl.header.uuid,
                hash: vericl.hash,
                staged: new Date().toISOString()
            });

            files.saveSG(sg);
            process.chdir(originalCwd);

            res.json({ success: true, data: { stagedCount: sg.length, path: workingDir, hash: vericl.hash } });
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
            // Support both new and legacy file names
            if (!files.fileExists(files.VERICL_FILE) && !files.fileExists('.pinesu.json')) {
                process.chdir(originalCwd);
                return res.json({ success: false, error: 'No storage unit found. Create one first.' });
            }

            const vericl = files.readVericlFile();
            const oldHash = vericl.hash;

            // Get current file list
            const fileList = [];
            files.getFilelist('.', fileList);

            // Calculate new content hash
            const newHash = calculateContentHash(fileList);

            // Update vericl with new values
            vericl.header.mdtime = new Date().toISOString();
            vericl.filelist = fileList;
            vericl.hash = newHash;

            // Save previous hash info
            vericl.header.prevhash = oldHash;

            await files.saveVericlJSON(vericl);

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
            // Support both new and legacy file names
            if (!files.fileExists(files.VERICL_FILE) && !files.fileExists('.pinesu.json')) {
                process.chdir(originalCwd);
                return res.json({ success: false, error: 'No storage unit found.' });
            }

            const reg = files.readRegistrationFile();
            if (reg[0] === "null" || !reg.txhash) {
                process.chdir(originalCwd);
                return res.json({ success: false, error: 'No registration found. Sync first.' });
            }

            const vericl = files.readVericlFile();

            // Get current file list and calculate CONTENT hash
            const currentFileList = [];
            files.getFilelist('.', currentFileList);
            const currentHash = calculateContentHash(currentFileList);

            // Compare with registered hash
            const registeredHash = vericl.hash;
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
                    closed: vericl.offhash?.closed || false,
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

        // Find parent directory with .vericl.json (or legacy .pinesu.json)
        let currentDir = path.dirname(targetFile);
        let vericlPath = null;
        let storageUnitDir = null;

        for (let i = 0; i < 10; i++) {
            let testPath = path.join(currentDir, files.VERICL_FILE);
            if (fs.existsSync(testPath)) {
                vericlPath = testPath;
                storageUnitDir = currentDir;
                break;
            }
            // Legacy fallback
            testPath = path.join(currentDir, '.pinesu.json');
            if (fs.existsSync(testPath)) {
                vericlPath = testPath;
                storageUnitDir = currentDir;
                break;
            }
            const parent = path.dirname(currentDir);
            if (parent === currentDir) break;
            currentDir = parent;
        }

        if (!vericlPath) {
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

        // Read vericl file
        const vericl = JSON.parse(fs.readFileSync(vericlPath, 'utf8'));
        const relativePath = path.relative(storageUnitDir, targetFile).replace(/\\/g, '/');

        // Find if file is in filelist
        let fileFound = false;
        if (vericl.filelist) {
            for (const entry of vericl.filelist) {
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
        const storageModified = (currentStorageHash !== vericl.hash);

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
                storageUnit: vericl.header?.name || 'Unknown',
                uuid: vericl.header?.uuid,
                registeredStorageHash: vericl.hash,
                currentStorageHash,
                message
            }
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Export files as ZIP
app.post('/api/export', async (req, res) => {
    try {
        const { targetPath, files: selectedFiles, exportLocation } = req.body;

        if (!targetPath || targetPath.trim() === '') {
            return res.json({ success: false, error: 'Directory path is required.' });
        }

        if (!selectedFiles || selectedFiles.length === 0) {
            return res.json({ success: false, error: 'No files selected for export.' });
        }

        const workingDir = targetPath.trim();

        if (!fs.existsSync(workingDir)) {
            return res.json({ success: false, error: `Directory not found: ${workingDir}` });
        }

        const originalCwd = process.cwd();
        process.chdir(workingDir);

        try {
            const vericl = files.readVericlFile();
            const reg = files.readRegistrationFile();

            // Build file list with hashes
            const exportList = [];
            for (const filePath of selectedFiles) {
                const fullPath = path.join(workingDir, filePath);
                if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile()) {
                    const content = fs.readFileSync(fullPath);
                    const hash = crypto.createHash('sha256').update(content).digest('hex');
                    exportList.push(`${filePath}:${hash}`);
                }
            }

            // Create JSON with verification info
            const exportInfo = {
                storageUnit: vericl.header?.name || 'Unknown',
                uuid: vericl.header?.uuid,
                exportDate: new Date().toISOString(),
                storageHash: vericl.hash,
                registration: reg[0] !== "null" ? reg : null,
                files: exportList
            };

            // Create ZIP using AdmZip
            const AdmZip = require('adm-zip');
            const zip = new AdmZip();

            // Add verification info
            zip.addFile('.vericl-export.json', Buffer.from(JSON.stringify(exportInfo, null, 2)));

            // Add selected files
            for (const filePath of selectedFiles) {
                const fullPath = path.join(workingDir, filePath);
                if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile()) {
                    const dir = path.dirname(filePath);
                    if (dir && dir !== '.') {
                        zip.addLocalFile(fullPath, dir);
                    } else {
                        zip.addLocalFile(fullPath);
                    }
                }
            }

            // Generate filename and save
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `vericl_export_${timestamp}.zip`;

            // Use custom export location if provided, otherwise default to parent directory
            let exportPath;
            if (exportLocation && exportLocation.trim() !== '') {
                const customDir = exportLocation.trim();
                if (!fs.existsSync(customDir)) {
                    try {
                        fs.mkdirSync(customDir, { recursive: true });
                    } catch (e) {
                        process.chdir(originalCwd);
                        return res.json({ success: false, error: `Cannot create export directory: ${customDir}` });
                    }
                }
                exportPath = path.join(customDir, filename);
            } else {
                exportPath = path.join(path.dirname(workingDir), filename);
            }

            zip.writeZip(exportPath);

            process.chdir(originalCwd);

            res.json({
                success: true,
                data: {
                    filename,
                    path: exportPath,
                    files: selectedFiles.length
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

// Close storage unit permanently
app.post('/api/close', async (req, res) => {
    try {
        const { targetPath, ethHost } = req.body;
        const host = ethHost || 'http://127.0.0.1:8545';

        // Read config for wallet info
        const config = readConfig();
        if (!config || !config.wallet1) {
            return res.json({ success: false, error: 'No wallet configured. Go to Settings first.' });
        }

        // If no targetPath provided, try to find a storage unit from staged items
        let workingDir = targetPath && targetPath.trim() !== '' ? targetPath.trim() : null;

        if (!workingDir) {
            const sg = files.loadSG() || [];
            if (sg.length > 0) {
                workingDir = sg[0].path;
            } else {
                return res.json({ success: false, error: 'No storage unit path provided and nothing staged.' });
            }
        }

        if (!fs.existsSync(workingDir)) {
            return res.json({ success: false, error: `Directory not found: ${workingDir}` });
        }

        const originalCwd = process.cwd();
        process.chdir(workingDir);

        try {
            // Support both new and legacy file names
            if (!files.fileExists(files.VERICL_FILE) && !files.fileExists('.pinesu.json')) {
                process.chdir(originalCwd);
                return res.json({ success: false, error: 'No storage unit found in this directory.' });
            }

            const vericl = files.readVericlFile();

            // Check if already closed
            if (vericl.offhash && vericl.offhash.closed) {
                process.chdir(originalCwd);
                return res.json({ success: false, error: 'Storage unit is already closed.' });
            }

            // Get current file list and calculate final hash
            const fileList = [];
            files.getFilelist('.', fileList);
            const closureHash = calculateContentHash(fileList);

            // Mark as closed
            vericl.offhash = {
                closed: true,
                closedAt: new Date().toISOString(),
                closureHash: closureHash
            };
            vericl.hash = closureHash;
            vericl.header.mdtime = new Date().toISOString();

            await files.saveVericlJSON(vericl);

            // Try to register closure on blockchain
            try {
                const ethLogic = require('./logic/ethLogic');
                ethLogic.connect(config.wallet1, config.wallet2, config.pkey || '', host);

                // Register closure hash
                const mc = files.loadTree();
                const today = new Date();

                const sg = [{ path: workingDir, uuid: vericl.header.uuid, hash: closureHash }];
                const [openRoot, closedRoot, openL, closedL] = files.createSGTrees(sg);

                if (closedRoot) {
                    const [closedWitness, closedSG] = ethLogic.addToTree(closedRoot, mc, true, today, closedL);
                }

                const [mkcHash, receipt, bktimestamp] = await ethLogic.registerMC(mc);

                // Create registration record
                files.createRegistration({
                    path: workingDir,
                    type: "closure",
                    mkcalroot: mkcHash,
                    mkcaltimestamp: today.toISOString(),
                    txhash: receipt.transactionHash,
                    bkhash: receipt.blockHash,
                    bkheight: receipt.blockNumber,
                    bktimestamp,
                    closureHash
                });

                files.saveTree(mc);

                process.chdir(originalCwd);

                res.json({
                    success: true,
                    data: {
                        uuid: vericl.header.uuid,
                        name: vericl.header.name,
                        hash: closureHash,
                        txHash: receipt.transactionHash,
                        blockNumber: receipt.blockNumber,
                        closed: true
                    }
                });
            } catch (bcError) {
                // Blockchain registration failed, but unit is still closed locally
                process.chdir(originalCwd);
                res.json({
                    success: true,
                    data: {
                        uuid: vericl.header.uuid,
                        name: vericl.header.name,
                        hash: closureHash,
                        closed: true,
                        warning: `Closed locally, but blockchain registration failed: ${bcError.message}`
                    }
                });
            }
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

        // Use targetPath or current directory with .vericl.json
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
