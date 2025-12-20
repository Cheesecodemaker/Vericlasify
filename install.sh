#!/bin/bash
echo "Installing Vericlasify..."
npm install
mkdir -p merkles commands logic lib connectors
echo "{}" > merkles/merkleCalendar.json
echo "[]" > merkles/storageGroup.json
chmod +x index.js
echo "✓ Done! Run: node index.js"