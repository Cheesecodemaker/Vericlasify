/**
 * Encryption Module - AES-256-GCM
 * Password-protected stored key approach
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;
const ENCRYPTED_EXT = '.enc';

/**
 * Derive a key from password using PBKDF2
 * @param {string} password - User password
 * @param {Buffer} salt - Random salt
 * @returns {Buffer} - 256-bit key
 */
function deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Generate a random AES-256 key
 * @returns {Buffer} - Random 256-bit key
 */
function generateRandomKey() {
    return crypto.randomBytes(KEY_LENGTH);
}

/**
 * Generate a random salt
 * @returns {Buffer} - Random salt
 */
function generateSalt() {
    return crypto.randomBytes(SALT_LENGTH);
}

/**
 * Encrypt the AES key with a password (for storage)
 * @param {Buffer} aesKey - The AES key to encrypt
 * @param {string} password - User password
 * @returns {object} - { encryptedKey, salt } (both as hex strings)
 */
function encryptKeyWithPassword(aesKey, password) {
    const salt = generateSalt();
    const derivedKey = deriveKey(password, salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    const encrypted = Buffer.concat([cipher.update(aesKey), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: iv(16) + authTag(16) + encrypted(32)
    const encryptedKey = Buffer.concat([iv, authTag, encrypted]);

    return {
        encryptedKey: encryptedKey.toString('hex'),
        salt: salt.toString('hex')
    };
}

/**
 * Decrypt the stored AES key with password
 * @param {string} encryptedKeyHex - Encrypted key as hex string
 * @param {string} saltHex - Salt as hex string
 * @param {string} password - User password
 * @returns {Buffer|null} - Decrypted AES key or null if failed
 */
function decryptKeyWithPassword(encryptedKeyHex, saltHex, password) {
    try {
        const encryptedKey = Buffer.from(encryptedKeyHex, 'hex');
        const salt = Buffer.from(saltHex, 'hex');
        const derivedKey = deriveKey(password, salt);

        const iv = encryptedKey.subarray(0, IV_LENGTH);
        const authTag = encryptedKey.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = encryptedKey.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted;
    } catch (error) {
        // Wrong password or corrupted data
        return null;
    }
}

/**
 * Encrypt a file with AES-256-GCM
 * @param {string} filePath - Path to file to encrypt
 * @param {Buffer} key - AES-256 key
 * @returns {string} - Path to encrypted file
 */
function encryptFile(filePath, key) {
    const data = fs.readFileSync(filePath);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: iv(16) + authTag(16) + encrypted data
    const encryptedData = Buffer.concat([iv, authTag, encrypted]);

    const encryptedPath = filePath + ENCRYPTED_EXT;
    fs.writeFileSync(encryptedPath, encryptedData);

    // Remove original file
    fs.unlinkSync(filePath);

    return encryptedPath;
}

/**
 * Decrypt a file with AES-256-GCM
 * @param {string} encryptedPath - Path to encrypted file
 * @param {Buffer} key - AES-256 key
 * @returns {string} - Path to decrypted file
 */
function decryptFile(encryptedPath, key) {
    if (!encryptedPath.endsWith(ENCRYPTED_EXT)) {
        throw new Error('File is not encrypted');
    }

    const encryptedData = fs.readFileSync(encryptedPath);

    const iv = encryptedData.subarray(0, IV_LENGTH);
    const authTag = encryptedData.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = encryptedData.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    // Restore original path (remove .enc extension)
    const originalPath = encryptedPath.slice(0, -ENCRYPTED_EXT.length);
    fs.writeFileSync(originalPath, decrypted);

    // Remove encrypted file
    fs.unlinkSync(encryptedPath);

    return originalPath;
}

/**
 * Get all files in a directory (recursive)
 * @param {string} dirPath - Directory path
 * @param {string[]} excludePatterns - Patterns to exclude (e.g., ['.vericl.json'])
 * @returns {string[]} - Array of file paths
 */
function getAllFiles(dirPath, excludePatterns = []) {
    const files = [];
    const defaultExcludes = ['.vericl.json', '.regvericl.json', '.pinesu.json', '.regpinesu.json', '.vericl-encryption.json', '.git', 'node_modules', '.vericlhistory', '.pinesuhistory'];
    const excludes = [...defaultExcludes, ...excludePatterns];

    function scan(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(dirPath, fullPath);

            // Check if should be excluded
            const shouldExclude = excludes.some(pattern => {
                return entry.name === pattern || relativePath.startsWith(pattern);
            });

            if (shouldExclude) continue;

            if (entry.isDirectory()) {
                scan(fullPath);
            } else if (entry.isFile()) {
                files.push(fullPath);
            }
        }
    }

    scan(dirPath);
    return files;
}

/**
 * Encrypt multiple files
 * @param {string[]} filePaths - Array of file paths
 * @param {Buffer} key - AES-256 key
 * @returns {object} - { success: string[], failed: string[] }
 */
function encryptFiles(filePaths, key) {
    const results = { success: [], failed: [] };

    for (const filePath of filePaths) {
        try {
            // Skip already encrypted files
            if (filePath.endsWith(ENCRYPTED_EXT)) {
                continue;
            }
            encryptFile(filePath, key);
            results.success.push(filePath);
        } catch (error) {
            results.failed.push({ path: filePath, error: error.message });
        }
    }

    return results;
}

/**
 * Decrypt multiple files
 * @param {string[]} filePaths - Array of encrypted file paths
 * @param {Buffer} key - AES-256 key
 * @returns {object} - { success: string[], failed: string[] }
 */
function decryptFiles(filePaths, key) {
    const results = { success: [], failed: [] };

    for (const filePath of filePaths) {
        try {
            // Skip non-encrypted files
            if (!filePath.endsWith(ENCRYPTED_EXT)) {
                continue;
            }
            decryptFile(filePath, key);
            results.success.push(filePath);
        } catch (error) {
            results.failed.push({ path: filePath, error: error.message });
        }
    }

    return results;
}

/**
 * Check if a directory has encryption configured
 * @param {string} dirPath - Directory path
 * @returns {object|null} - Encryption config or null
 */
function getEncryptionConfig(dirPath) {
    const configPath = path.join(dirPath, '.vericl-encryption.json');
    if (fs.existsSync(configPath)) {
        try {
            return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Save encryption config to directory
 * @param {string} dirPath - Directory path
 * @param {object} config - { encryptedKey, salt }
 */
function saveEncryptionConfig(dirPath, config) {
    const configPath = path.join(dirPath, '.vericl-encryption.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Get encryption status of files in a directory
 * @param {string} dirPath - Directory path
 * @returns {object} - { encrypted: string[], decrypted: string[], total: number }
 */
function getEncryptionStatus(dirPath) {
    const files = getAllFiles(dirPath);
    const encrypted = files.filter(f => f.endsWith(ENCRYPTED_EXT));
    const decrypted = files.filter(f => !f.endsWith(ENCRYPTED_EXT));

    return {
        encrypted: encrypted.map(f => path.relative(dirPath, f)),
        decrypted: decrypted.map(f => path.relative(dirPath, f)),
        total: files.length,
        hasEncryptionConfig: getEncryptionConfig(dirPath) !== null
    };
}

module.exports = {
    // Key management
    generateRandomKey,
    generateSalt,
    deriveKey,
    encryptKeyWithPassword,
    decryptKeyWithPassword,

    // File operations
    encryptFile,
    decryptFile,
    encryptFiles,
    decryptFiles,
    getAllFiles,

    // Config
    getEncryptionConfig,
    saveEncryptionConfig,
    getEncryptionStatus,

    // Constants
    ENCRYPTED_EXT
};
