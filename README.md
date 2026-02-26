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

---

## Setup Guide

This section provides all the necessary steps and dependencies to set up and run the Vericlasify project on a new machine after pulling from Git.

### 1. System Requirements

Before installing dependencies, ensure your system has the following:
- **Node.js**: Version 14.0.0 or higher.
- **Python**: Version 3.8 or higher.
- **Git**: Installed and configured.
- **Ganache**: Either `ganache-cli` (global npm package) or the Ganache GUI.

### 2. Global Dependencies

Install the essential global tools:

```bash
# Install Ganache CLI (if not using the GUI)
npm install -g ganache-cli
```

### 3. Project Installation

Clone the repository and install local dependencies:

```bash
# Clone the repository
git clone <repository_url>
cd Vericlasify(AI)

# Install Node.js dependencies (Main Backend & CLI)
npm install
```

> **Note:** `npm install` automatically runs `patch-package` to fix compatibility issues in the `merkle-calendar` library.

### 4. AI API Setup (Python)

The AI classification component requires several Python libraries. It is recommended to use a virtual environment.

```bash
# Optional: Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install required Python packages
pip install flask flask-cors huggingface_hub pdfplumber python-docx python-dotenv werkzeug requests
```

#### Environment Configuration
Create a `.env` file in the root directory and add your Hugging Face token:

```env
HF_TOKEN=your_huggingface_token_here
```

### 5. Execution Commands

To run the full system, you need to start three separate components (ideally in different terminals):

#### Terminal 1: Blockchain
```bash
# Start Ganache
npm run ganache
# or simply: ganache-cli
```

#### Terminal 2: Main Backend & Dashboard
```bash
# Start the Express server (Port 3001)
npm run server
```

#### Terminal 3: AI Classification API
```bash
# Start the Python AI API (Port 5050)
npm run ai
```

### 6. Verification
Once all servers are running:
- **Dashboard**: Open `http://localhost:3001` in your browser.
- **AI Health Check**: Visit `http://localhost:5050/health`.
- **Blockchain**: Ensure Ganache is listening on `http://127.0.0.1:8545`.

### 7. Selenium Testing

Automated UI tests are included using **Selenium + pytest**.

#### Install Test Dependencies
```bash
pip install selenium pytest webdriver-manager pytest-html
```

#### Run Tests

```bash
# Terminal 1 — start the server
node server.js

# Terminal 2 — run tests + generate report
python -m pytest tests/selenium_test.py -v --html=tests/test_report.html --self-contained-html
```

The generated `tests/test_report.html` is a self-contained HTML file — open it in any browser to view results.
### 8. Viewing the Report

You can open the generated HTML report with the default browser:

```bash
start .\tests\test_report.html
```

This command launches `test_report.html` in your system’s default web browser (Chrome, Edge, etc.). No additional server is required because the report is self‑contained.
