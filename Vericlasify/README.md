# Vericlasify - Blockchain Git Protection

Combines Git with Ethereum blockchain for integrity protection.



# Start blockchain (separate terminal)
ganache-cli

# Run Vericlasify
node index.js


## Commands

- **create / update** - Create or update Storage Unit
- **stage** - Add to staging area
- **syncwbc** - Register on blockchain
- **close** - Close permanently
- **checkbc** - Verify integrity
- **checkfile** - Check individual file
- **export** - Create verifiable bundle
- **git** - Git operations
- **settings** - Configure wallet
- **help** - Show help

## Workflow

1. Navigate to project directory
2. Run: `node /path/to/Vericlasify/index.js`
3. Select: create / update
4. Select: stage
5. Select: syncwbc
6. Enter blockchain URL: http://localhost:7545 or http://127.0.0.1:8545 (CLI)
7. Select: checkbc (to verify)

## Security

⚠️ Never commit `config.json` - contains private keys!
