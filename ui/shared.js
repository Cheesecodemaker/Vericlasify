// Shared utilities for all command pages
const API_BASE = 'http://localhost:3001/api';

// API call helper
async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, error: 'Server not running. Start with: npm run server' };
  }
}

function log(message, type = '') {
  const consoleBody = document.getElementById('consoleBody');
  if (!consoleBody) return;

  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="log-msg ${type}">${escapeHtml(message)}</span>
  `;
  consoleBody.appendChild(entry);
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function clearConsole() {
  const consoleBody = document.getElementById('consoleBody');
  if (consoleBody) {
    consoleBody.innerHTML = '';
    log('Console cleared', 'info');
  }
}

function setStatus(text, type = 'success') {
  const statusText = document.getElementById('statusText');
  const statusIndicator = document.getElementById('statusIndicator');

  if (statusText) statusText.textContent = text;
  if (statusIndicator) {
    statusIndicator.className = 'status-indicator';
    if (type === 'warning') statusIndicator.classList.add('warning');
    if (type === 'error') statusIndicator.classList.add('error');
  }
}

function setButtonLoading(btn, loading, originalText) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Executing...';
  } else {
    btn.disabled = false;
    btn.innerHTML = originalText || btn.dataset.originalText || 'Execute';
  }
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function randomHex(length) {
  return [...Array(length)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

// Storage unit path persistence helpers
function getSavedStorageUnitPath() {
  return localStorage.getItem('vericlasify_lastPath') || '';
}

function saveStorageUnitPath(path) {
  if (path && path.trim()) {
    localStorage.setItem('vericlasify_lastPath', path.trim());
  }
}

// Auto-fill targetPath input if exists on page (unless data-no-autofill is set)
function initTargetPathInput() {
  const targetPathInput = document.getElementById('targetPath');
  if (targetPathInput) {
    // Skip auto-fill if data-no-autofill is set (for Create page)
    if (!targetPathInput.dataset.noAutofill) {
      const savedPath = getSavedStorageUnitPath();
      if (savedPath) {
        targetPathInput.value = savedPath;
      }
    }
    // Save path on change (always save, even on Create page)
    targetPathInput.addEventListener('change', () => {
      saveStorageUnitPath(targetPathInput.value);
    });
  }
}

// Check server status on page load
async function checkServerStatus() {
  const result = await apiCall('/status');
  if (result.success === false) {
    log('⚠️ Server not running!', 'error');
    log('Start with: npm run server', 'warning');
    setStatus('Offline', 'error');
    return false;
  } else {
    log('✔ Connected to server', 'success');

    // Show user's selected storage unit path, not server directory
    const savedPath = getSavedStorageUnitPath();
    if (savedPath) {
      log(`📁 Storage Unit: ${savedPath}`, 'info');
    } else {
      log('📁 No storage unit selected - enter path to start', 'warning');
    }

    if (result.hasPinesu) {
      log('📦 Storage unit found', 'info');
    }
    return true;
  }
}

// Initialize console on page load
document.addEventListener('DOMContentLoaded', () => {
  checkServerStatus();
  initTargetPathInput();
});
