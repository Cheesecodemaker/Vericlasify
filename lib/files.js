const fs = require('fs');
const path = require('path');
const touch = require('touch');
const _und = require("underscore");
const inquirer = require('./inquirer');
const treelist = require('./treelist');
const hidefile = require('hidefile');
const ethLogic = require('../logic/ethLogic')
const AdmZip = require('adm-zip');

module.exports = {
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
        const answers = await inquirer.chooseAddresses();
        const o = {
            wallet1: answers.wallet1,
            wallet2: answers.wallet2,
            pkey: answers.pkey
        };
        fs.writeFileSync(__dirname + '/../config.json', JSON.stringify(o));
        return o;
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

    saveVericlJSON: async (obj) => {

        if (fs.existsSync(process.cwd().replace(/\\/g, "/") + "/.vericl.json")) {
            const content = module.exports.readVericlFile();
            module.exports.createVericlOld();
            const contentJSON = JSON.stringify(content);
            const contentDate = new Date(content.header.crtime);
            fs.writeFileSync(process.cwd().replace(/\\/g, "/") + "/.vericlhistory/vericl_" + contentDate.toISOString().replace(/\W/g, "") + "_" + content.hash + ".json", contentJSON);
        }

        const jsonContent = JSON.stringify(obj);

        fs.writeFile(process.cwd() + "/.vericl.json", jsonContent, 'utf8', function (err) {
            if (err) {
                return console.log(err);
            }
        });

    },

    getFilelist: (dir, filelist) => {
        if (dir === "") {
            dir = ".";
        }
        const forbiddenFiles = [".git", ".vericlhistory", ".vericl.json", ".regvericl.json", ".gitignore", ".gitkeep"];
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
        const filePath = "" + el.path
        delete el.path

        const regVericlPath = path.join(process.cwd(), '.regvericl.json');
        if (fs.existsSync(regVericlPath)) {
            const content = module.exports.readRegistrationFile();
            module.exports.createVericlOld();
            const contentJSON = JSON.stringify(content);
            const contentDate = content.mkcaltimestamp ? new Date(content.mkcaltimestamp) : new Date();
            const rootIdentifier = content.mkcalroot || 'unknown';
            const historyFileName = 'regvericl' + contentDate.toISOString().replace(/:/g, '-') + '_' + rootIdentifier + '.json';
            fs.writeFileSync(path.join(process.cwd(), '.vericlhistory', historyFileName), contentJSON);
        }

        try {
            fs.writeFileSync(filePath + "/.regvericl.json", JSON.stringify(el));
        } catch (err) {
            console.log('There has been an error parsing your JSON.')
            console.log(err);
        }

        if (fs.existsSync(process.cwd().replace(/\\/g, "/") + "/.vericl.json")) {
            return module.exports.readVericlFile();
        }
    },

    createVericlOld: () => {
        const historyDir = path.join(process.cwd(), '.vericlhistory');
        if (!fs.existsSync(historyDir)) {
            fs.mkdirSync(historyDir, { recursive: true });
            try {
                hidefile.hideSync(historyDir);
            } catch (e) {
                // Ignore hide errors on some systems
            }
        }
    },

    createGitignore: async () => {
        const treeList = _und.without(fs.readdirSync(process.cwd()), '.git', '.gitignore');

        if (treeList.length) {
            const answers = await inquirer.askIgnoreFiles(treeList);

            if (answers.ignore.length) {
                fs.writeFileSync('.gitignore', answers.ignore.join('\n'));
            } else {
                await touch('.gitignore');
            }
        } else {
            touch('.gitignore');
        }
    },

    closeVericlFile: () => {
        if (fs.existsSync(process.cwd().replace(/\\/g, "/") + "/.vericl.json")) {
            const data = fs.readFileSync(process.cwd().replace(/\\/g, "/") + "/.vericl.json");
            try {
                const myObj = JSON.parse(data.toString());
                myObj.offhash.closed = true;
                fs.writeFileSync('.vericl.json', JSON.stringify(myObj));
                return myObj;
            } catch (err) {
                console.log('There has been an error parsing your JSON.')
                console.log(err);
            }
        } else {
            return [null];
        }
    },

    readVericlFile: () => {
        if (fs.existsSync(process.cwd().replace(/\\/g, "/") + "/.vericl.json")) {
            const data = fs.readFileSync(process.cwd().replace(/\\/g, "/") + "/.vericl.json");
            try {
                return JSON.parse(data.toString());
            } catch (err) {
                console.log('There has been an error parsing your JSON.')
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

    readRegistrationFile: () => {
        if (fs.existsSync(process.cwd().replace(/\\/g, "/") + "/.regvericl.json")) {
            const data = fs.readFileSync(process.cwd().replace(/\\/g, "/") + "/.regvericl.json");
            try {
                return JSON.parse(data.toString());
            } catch (err) {
                console.log('There has been an error parsing your JSON.')
                console.log(err);
            }
        } else {
            return ["null"];
        }
    },

    isClosed: () => {
        if (fs.existsSync('.vericl.json')) {
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
                console.log('There has been an error parsing your JSON.')
                console.log(err);
            }
        } else {
            return ["null"];
        }
    },

    distributeSU: async () => {
        const vericl = module.exports.readVericlFile();

        if (vericl[0] === "null") {
            return ["null"];
        }

        const fileList = vericl.filelist;
        const finalList = [];
        let el;
        for (let i = 0; i < fileList.length; i++) {
            el = fileList[i].split(":")[0];
            if (typeof (el) == "undefined" || el.includes(".vericl.json") || el.includes(".gitignore") || fs.lstatSync(el).isDirectory()) {

            } else {
                finalList.push(fileList[i])
            }
        }

        if (finalList[0] !== "null") {
            if (finalList.length) {
                const answers = await inquirer.askSUExport(finalList);

                if (answers.export.length) {
                    return answers.export;
                }
            }
        }
        return ["null"];
    },

    checkRegistration: (hash) => {
        if (fs.existsSync(".regvericl.json")) {
            const data = fs.readFileSync(".regvericl.json");
            try {
                const reg = JSON.parse(data.toString());
                const proof = treelist.validateProof(hash, reg);
                if (proof[0]) {
                    return [true, reg];
                } else {
                    return [false, null];
                }
            } catch (err) {
                console.log('There has been an error parsing your JSON.')
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
        if (fs.existsSync(".regvericl.json")) {
            zip.addLocalFile(".regvericl.json");
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
        if (fs.existsSync(__dirname + '/../merkles/merkleCalendar.json')) {
            const mcFile = fs.readFileSync(__dirname + '/../merkles/merkleCalendar.json', 'utf8');
            if (mcFile.length !== 0) {
                return ethLogic.deserializeMC(mcFile);
            }
        }
        return ethLogic.returnEmptyMC();
    },

    saveTree: (mc) => {
        try {
            const mcString = ethLogic.serializeMC(mc);
            fs.writeFileSync(__dirname + '/../merkles/merkleCalendar.json', mcString);
        } catch (err) {
            console.log('There has been an error parsing your JSON.')
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
            console.log('There has been an error parsing your JSON.')
            console.log(err);
        }
    }

};
