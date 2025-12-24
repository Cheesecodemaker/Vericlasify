# Vericlasify - Blockchain Git Protection

Combines Git with Ethereum blockchain for integrity protection.


```bash
# Start blockchain (separate terminal)
ganache-cli

# Run Blockchain + Ui
npm run server

# Run AI backend
npm run ai
```

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

1. Select: create / update
2. Select: stage
3. Select: syncwbc
4. Enter blockchain URL: http://localhost:7545 or http://127.0.0.1:8545 (CLI)
5. Select: checkbc (to verify)

## Security

⚠️ Never commit `config.json` - contains private keys!
