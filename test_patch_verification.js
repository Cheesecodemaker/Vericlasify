const { MerkleTree } = require('merkletreejs');
const crypto = require('crypto');

const sha256Fn = function (d) { return crypto.createHash('sha256').update(d).digest(); };

try {
    console.log('Creating MerkleTree...');
    const tree = new MerkleTree([], sha256Fn);
    console.log('Tree created.');

    console.log('Adding leaves...');
    // Simulate what MerkleTools does: addLeaves([bufferify(value)])
    const value = "test";
    const leaf = tree.bufferify(value);

    tree.addLeaves([leaf]);
    console.log('Leaves added.');

    const root = tree.getRoot();
    console.log('Root:', tree.bufferToHex(root));

} catch (error) {
    console.error('CRASHED:', error);
    console.error(error.stack);
}
