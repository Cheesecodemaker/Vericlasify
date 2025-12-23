const fs = require('fs');
const path = require('path');
const touch = require('touch');
const _und = require("underscore");
// inquirer removed - CLI functions no longer supported
const treelist = require('./treelist');
const hidefile = require('hidefile');
const ethLogic = require('../logic/ethLogic')
const AdmZip = require('adm-zip');

// Vericl file names
const VERICL_FILE = '.vericl.json';
const REG_VERICL_FILE = '.regvericl.json';
const VERICL_HISTORY = '.vericlhistory';

// Legacy file names (for backwards compatibility)
const LEGACY_FILE = '.pinesu.json';
const LEGACY_REG_FILE = '.regpinesu.json';
const LEGACY_HISTORY = '.pinesuhistory';

// Helper to get the active config file (prefer new, fallback to legacy)
function getConfigFile() {
    const cwd = process.cwd().replace(/\\/g, "/");
    if (fs.existsSync(cwd + "/" + VERICL_FILE)) return VERICL_FILE;
    if (fs.existsSync(cwd + "/" + LEGACY_FILE)) return LEGACY_FILE;
    return VERICL_FILE; // Default to new name
}

function getRegFile() {
    const cwd = process.cwd().replace(/\\/g, "/");
    if (fs.existsSync(cwd + "/" + REG_VERICL_FILE)) return REG_VERICL_FILE;
    if (fs.existsSync(cwd + "/" + LEGACY_REG_FILE)) return LEGACY_REG_FILE;
    return REG_VERICL_FILE;
}

function getHistoryDir() {
    const cwd = process.cwd().replace(/\\/g, "/");
    if (fs.existsSync(cwd + "/" + VERICL_HISTORY)) return VERICL_HISTORY;
    if (fs.existsSync(cwd + "/" + LEGACY_HISTORY)) return LEGACY_HISTORY;
    return VERICL_HISTORY;
}

module.exports = {
    // Export constants for use in other files
    VERICL_FILE,
    REG_VERICL_FILE,
    VERICL_HISTORY,

    getCurrentDirectoryBase: () => {
        return path.basename(process.cwd());
    },

    getCurrentDirectoryABS: () => {
        return process.cwd().replace(/\\/g, "/");
    },

    fileExists: (filePath) => {
        return fs.existsSync(filePath);
    },

    readFile(filePath, cod) {
        return fs.readFileSync(filePath, cod);
    },

    readWallet: async (choice) => {
        if (fs.existsSync(__dirname + '/../config.json') && !choice) {
            const data = fs.readFileSync(__dirname + '/../config.json');
            return JSON.parse(data.toString());
        } else {
            return module.exports.writeWallet();
        }
    },

    writeWallet: async () => {
        // CLI-only function, not supported in web UI
        throw new Error('writeWallet is not supported in web UI mode. Use /api/settings endpoint.');
    },

    createSGTrees: (sg) => {
        let el;
        const open = [];
        const openHashes = [];
        const closed = [];
        const closedHashes = [];
        for (el of sg) {
            if (el.closed) {
                closed.push(el);
                closedHashes.push(el.hash);
            } else {
                open.push(el);
                openHashes.push(el.hash);
            }
        }
        let openRoot = null;
        if (openHashes.length !== 0) {
            openRoot = treelist.calculateTree(openHashes);
        }
        let closedRoot = null;
        if (closedHashes.length !== 0) {
            closedRoot = treelist.calculateTree(closedHashes);
        }
        return [openRoot, closedRoot, open, closed];
    },

    flushSG: () => {
        module.exports.saveSG([]);
    },

    // New name: saveVericlJSON (with alias for backwards compatibility)
    saveVericlJSON: async (obj) => {
        const cwd = process.cwd().replace(/\\/g, "/");
        const configFile = getConfigFile();
        const historyDir = getHistoryDir();

        if (fs.existsSync(cwd + "/" + configFile)) {
            const content = module.exports.readVericlFile();
            module.exports.createVericlHistory();
            const contentJSON = JSON.stringify(content);

            // Handle missing or invalid crtime
            let contentDate;
            try {
                contentDate = content.header?.crtime ? new Date(content.header.crtime) : new Date();
                if (isNaN(contentDate.getTime())) {
                    contentDate = new Date();
                }
            } catch (e) {
                contentDate = new Date();
            }

            const dateStr = contentDate.toISOString().replace(/\W/g, "");
            fs.writeFileSync(cwd + "/" + historyDir + "/vericl_" + dateStr + "_" + (content.hash || 'unknown') + ".json", contentJSON);
        }

        const jsonContent = JSON.stringify(obj);

        // Always write to new file name
        fs.writeFile(cwd + "/" + VERICL_FILE, jsonContent, 'utf8', function (err) {
            if (err) {
                return console.log(err);
            }
        });
    },

    // Alias for backwards compatibility
    savePineSUJSON: async (obj) => {
        return module.exports.saveVericlJSON(obj);
    },

    getFilelist: (dir, filelist) => {
        if (dir === "") {
            dir = ".";
        }
        // Include both old and new file names in forbidden list
        const forbiddenFiles = [
            ".git",
            VERICL_HISTORY, LEGACY_HISTORY,
            VERICL_FILE, LEGACY_FILE,
            REG_VERICL_FILE, LEGACY_REG_FILE,
            ".gitignore", ".gitkeep"
        ];
        fs.readdirSync(dir).forEach(file => {
            if (!forbiddenFiles.includes(file)) {
                let fullPath = path.join(dir, file);
                if (fs.lstatSync(fullPath).isDirectory()) {
                    module.exports.fixDirEmpty(fullPath);
                    filelist.push(fullPath);
                    module.exports.getFilelist(fullPath, filelist);
                } else {
                    filelist.push(fullPath);
                }
            }
        });
    },

    fixDirEmpty: (dirname) => {
        if (fs.readdirSync(dirname).length === 0) {
            fs.openSync(dirname + "/.gitkeep", 'w');
        }
    },

    getDirectories: (list) => {
        let dirList = [];
        let filesList = [];
        for (let el of list) {
            if (fs.lstatSync(el).isDirectory()) {
                dirList.push(el);
            } else {
                filesList.push(el);
            }
        }
        return [dirList, filesList];
    },

    createRegistration: (el) => {
        const elPath = "" + el.path;
        delete el.path;

        const cwd = process.cwd().replace(/\\/g, "/");
        const regFile = getRegFile();
        const historyDir = getHistoryDir();

        if (fs.existsSync(cwd + "/" + regFile)) {
            const content = module.exports.readRegistrationFile();
            module.exports.createVericlHistory();
            const contentJSON = JSON.stringify(content);
            const contentDate = new Date(content.date);
            fs.writeFileSync(cwd + "/" + historyDir + "/regvericl_" + contentDate.toISOString() + "_" + content.root + ".json", contentJSON);
        }

        try {
            // Always write to new file name
            fs.writeFileSync(elPath + "/" + REG_VERICL_FILE, JSON.stringify(el));
        } catch (err) {
            console.log('There has been an error parsing your JSON.');
            console.log(err);
        }

        const configFile = getConfigFile();
        if (fs.existsSync(cwd + "/" + configFile)) {
            return module.exports.readVericlFile();
        }
    },

    // New name: createVericlHistory (with alias)
    createVericlHistory: () => {
        const cwd = process.cwd().replace(/\\/g, "/");
        if (!fs.existsSync(cwd + "/" + VERICL_HISTORY + "/")) {
            fs.mkdirSync(cwd + "/" + VERICL_HISTORY + "/");
            hidefile.hideSync(cwd + "/" + VERICL_HISTORY + "/");
        }
    },

    // Alias for backwards compatibility
    createPineSUOld: () => {
        return module.exports.createVericlHistory();
    },

    createGitignore: async () => {
        // Non-interactive version for web UI - include both old and new names
        if (!fs.existsSync('.gitignore')) {
            fs.writeFileSync('.gitignore', `node_modules
${VERICL_FILE}
${REG_VERICL_FILE}
${VERICL_HISTORY}
${LEGACY_FILE}
${LEGACY_REG_FILE}
${LEGACY_HISTORY}
`);
        }
    },

    // New name: closeVericlFile (with alias)
    closeVericlFile: () => {
        const cwd = process.cwd().replace(/\\/g, "/");
        const configFile = getConfigFile();

        if (fs.existsSync(cwd + "/" + configFile)) {
            const data = fs.readFileSync(cwd + "/" + configFile);
            try {
                const myObj = JSON.parse(data.toString());
                myObj.offhash.closed = true;
                fs.writeFileSync(VERICL_FILE, JSON.stringify(myObj));
                return myObj;
            } catch (err) {
                console.log('There has been an error parsing your JSON.');
                console.log(err);
            }
        } else {
            return [null];
        }
    },

    // Alias
    closePineSUFile: () => {
        return module.exports.closeVericlFile();
    },

    // New name: readVericlFile (with alias)
    readVericlFile: () => {
        const cwd = process.cwd().replace(/\\/g, "/");
        const configFile = getConfigFile();

        if (fs.existsSync(cwd + "/" + configFile)) {
            const data = fs.readFileSync(cwd + "/" + configFile);
            try {
                return JSON.parse(data.toString());
            } catch (err) {
                console.log('There has been an error parsing your JSON.');
                console.log(err);
            }
        } else {
            const vericlFile = {};
            vericlFile.hash = null;
            vericlFile.header = {};

            vericlFile.header.prevmkcalroot = null;
            vericlFile.header.prevsuhash = null;
            vericlFile.header.prevbcregnumber = null;
            vericlFile.header.prevbcregtime = null;
            vericlFile.header.prevclosed = null;
            vericlFile.header.merkleroot = null;

            vericlFile.filelist = null;
            vericlFile.offhash = {};

            vericlFile.offhash.bcregnumber = 0;
            vericlFile.offhash.bcregtime = null;
            vericlFile.offhash.closed = false;
            return vericlFile;
        }
    },

    // Alias for backwards compatibility
    readPineSUFile: () => {
        return module.exports.readVericlFile();
    },

    readRegistrationFile: () => {
        const cwd = process.cwd().replace(/\\/g, "/");
        const regFile = getRegFile();

        if (fs.existsSync(cwd + "/" + regFile)) {
            const data = fs.readFileSync(cwd + "/" + regFile);
            try {
                return JSON.parse(data.toString());
            } catch (err) {
                console.log('There has been an error parsing your JSON.');
                console.log(err);
            }
        } else {
            return ["null"];
        }
    },

    isClosed: () => {
        const configFile = getConfigFile();
        if (fs.existsSync(configFile)) {
            const myObj = module.exports.readVericlFile();
            return myObj.closed;
        }
        return false;
    },

    readPifile: () => {
        if (fs.existsSync(process.cwd().replace(/\\/g, "/") + "/.pifiles.json")) {
            const data = fs.readFileSync(process.cwd().replace(/\\/g, "/") + "/" + "/.pifiles.json");
            try {
                return JSON.parse(data.toString());
            } catch (err) {
                console.log('There has been an error parsing your JSON.');
                console.log(err);
            }
        } else {
            return ["null"];
        }
    },

    distributeSU: async () => {
        // In web UI mode, export all files from the filelist
        const vericl = module.exports.readVericlFile();

        if (vericl[0] === "null") {
            return ["null"];
        }

        const fileList = vericl.filelist;
        const finalList = [];
        let el;
        for (let i = 0; i < fileList.length; i++) {
            el = fileList[i].split(":")[0];
            if (typeof (el) == "undefined" || el.includes(VERICL_FILE) || el.includes(LEGACY_FILE) || el.includes(".gitignore") || fs.lstatSync(el).isDirectory()) {
                // skip
            } else {
                finalList.push(fileList[i]);
            }
        }
        return finalList.length ? finalList : ["null"];
    },

    checkRegistration: (hash) => {
        const regFile = getRegFile();
        if (fs.existsSync(regFile)) {
            const data = fs.readFileSync(regFile);
            try {
                const reg = JSON.parse(data.toString());
                const proof = treelist.validateProof(hash, reg);
                if (proof[0]) {
                    return [true, reg];
                } else {
                    return [false, null];
                }
            } catch (err) {
                console.log('There has been an error parsing your JSON.');
                console.log(err);
            }
        } else {
            return [false, null];
        }
    },

    createZIP: (list, json) => {
        const zip = new AdmZip();

        // add file directly
        const content = JSON.stringify(json);
        zip.addFile(".pifiles.json", Buffer.alloc(content.length, content));

        const regFile = getRegFile();
        if (fs.existsSync(regFile)) {
            zip.addLocalFile(regFile);
        }
        // add local file
        for (let el of list) {
            const filePath = el.split(":")[0];
            if (filePath.includes("/")) {
                const arr = filePath.split("/");
                let pathZip = "";
                for (let i = 0; i < arr.length - 1; i++) {
                    pathZip = pathZip + arr[i] + "/";
                }
                zip.addLocalFile(process.cwd().replace(/\\/g, "/") + "/" + filePath, pathZip);
            } else {
                zip.addLocalFile(process.cwd().replace(/\\/g, "/") + "/" + filePath);
            }
        }
        // write everything to disk
        zip.writeZip(process.cwd().replace(/\\/g, "/") + "/../vericlExport.zip");
    },

    loadTree: () => {
        try {
            if (fs.existsSync(__dirname + '/../merkles/merkleCalendar.json')) {
                const mcFile = fs.readFileSync(__dirname + '/../merkles/merkleCalendar.json', 'utf8');
                if (mcFile.length !== 0) {
                    return ethLogic.deserializeMC(mcFile);
                }
            }
        } catch (e) {
            console.log('Warning: Error loading merkle tree, creating new one:', e.message);
        }
        return ethLogic.returnEmptyMC();
    },

    saveTree: (mc) => {
        try {
            const mcString = ethLogic.serializeMC(mc);
            fs.writeFileSync(__dirname + '/../merkles/merkleCalendar.json', mcString);
        } catch (err) {
            console.log('There has been an error parsing your JSON.');
            console.log(err);
        }
    },

    loadSG: () => {
        const sg = [];
        let sgList;
        if (fs.existsSync(__dirname + '/../merkles/storageGroup.json')) {
            const sgFile = fs.readFileSync(__dirname + '/../merkles/storageGroup.json', 'utf8');
            if (typeof (sgFile) !== "undefined" && sgFile !== "") {
                sgList = JSON.parse(sgFile);
                for (let el of sgList) {
                    if (el.hasOwnProperty("hash")) {
                        sg.push(el);
                    }
                }
            }
        }
        return sg;
    },

    saveSG: (sg) => {
        try {
            fs.writeFileSync(__dirname + '/../merkles/storageGroup.json', JSON.stringify(sg));
        } catch (err) {
            console.log('There has been an error parsing your JSON.');
            console.log(err);
        }
    }

};
