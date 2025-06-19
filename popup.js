// Popup script for TsPocket
import CONFIG from './config.js';
import storageService from './storage-service.js';
import chromeApi from './chrome-api.js';

// DOM Elements
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const quickSaveBtn = document.getElementById('quickSaveBtn');
const settingsBtn = document.getElementById('settingsBtn');
const backBtn = document.getElementById('backBtn');
const authBtn = document.getElementById('authBtn');
const tagsInput = document.getElementById('tagsInput');
const recentList = document.getElementById('recentList');
const saveStatus = document.getElementById('saveStatus');
const authStatus = document.getElementById('authStatus');
const postSaveOptions = document.getElementById('postSaveOptions');
const addTagsBtn = document.getElementById('addTagsBtn');
const searchInput = document.getElementById('searchInput');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const importProgress = document.getElementById('importProgress');

// State
let currentTags = [];
let isAuthenticated = false;
let lastSavedNoteId = null;
let allSavedArticles = [];

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication status
  await checkAuthStatus();
  
  // Load recent saves
  loadRecentSaves();
  
  // Set up event listeners
  setupEventListeners();
});

// Check authentication status
async function checkAuthStatus() {
  try {
    // Check with background script
    const response = await chromeApi.runtime.sendMessage({ action: 'checkAuth' });
    isAuthenticated = response.isLoggedIn;
    
    if (isAuthenticated) {
      // Load user info
      const stored = await storageService.get(['userEmail', 'userName']);
    }
    
    updateAuthDisplay();
    
    // Check if this is first use
    const hasSeenSetup = await storageService.get(['hasSeenSetup']);
    if (!isAuthenticated && !hasSeenSetup.hasSeenSetup) {
      showStatus('Please login to get started', 'error');
      showView('settings');
      await storageService.set({ hasSeenSetup: true });
    }
  } catch (error) {
    console.error('Failed to check auth status:', error);
    isAuthenticated = false;
    updateAuthDisplay();
  }
}

// Update auth display
async function updateAuthDisplay() {
  const statusText = authStatus.querySelector('.status-text');
  if (isAuthenticated) {
    authStatus.classList.add('authenticated');
    
    // Show user email if available
    const stored = await chrome.storage.local.get(['userEmail']);
    if (stored.userEmail) {
      statusText.textContent = stored.userEmail;
    } else {
      statusText.textContent = 'Authenticated';
    }
    
    authBtn.textContent = 'Logout';
  } else {
    authStatus.classList.remove('authenticated');
    statusText.textContent = 'Not authenticated';
    authBtn.textContent = 'Login with Thoughtstream';
  }
}

// Load recent saves
async function loadRecentSaves() {
  chrome.runtime.sendMessage({ action: 'getHistory' }, (savedArticles) => {
    allSavedArticles = savedArticles || [];
    displayRecentSaves(allSavedArticles);
  });
}

// Search articles
function searchArticles(query) {
  if (!query.trim()) {
    return allSavedArticles;
  }
  
  const searchTerm = query.toLowerCase();
  return allSavedArticles.filter(article => {
    const searchableText = [
      article.title || '',
      article.description || '',
      article.content || '',
      article.domain || '',
      ...(article.tags || [])
    ].join(' ').toLowerCase();
    
    return searchableText.includes(searchTerm);
  });
}

// Display recent saves
function displayRecentSaves(articles) {
  if (articles.length === 0) {
    recentList.innerHTML = '<div class="loading">No saved articles yet</div>';
    return;
  }
  
  const searchQuery = searchInput?.value || '';
  const filtered = searchQuery ? searchArticles(searchQuery) : articles;
  
  if (filtered.length === 0) {
    recentList.innerHTML = '<div class="loading">No matching articles found</div>';
    return;
  }
  
  recentList.innerHTML = filtered.slice(0, searchQuery ? 20 : 5).map(article => {
    const timeAgo = getTimeAgo(new Date(article.savedAt));
    
    // Safely extract domain with validation
    let domain = 'unknown';
    try {
      const url = new URL(article.url);
      domain = url.hostname.replace('www.', '');
    } catch (e) {
      console.error('Invalid URL:', article.url);
    }
    
    // Escape tags to prevent XSS
    const tags = article.tags?.length > 0 
      ? `<div class="recent-item-tags">${article.tags.map(t => escapeHtml(`#${t}`)).join(' ')}</div>` 
      : '';
    
    return `
      <div class="recent-item" data-url="${escapeHtml(article.url)}">
        <div class="recent-item-title">${escapeHtml(article.title)}</div>
        <div class="recent-item-url">${escapeHtml(domain)}</div>
        ${tags}
        <div class="recent-item-time">${escapeHtml(timeAgo)}</div>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  document.querySelectorAll('.recent-item').forEach(item => {
    item.addEventListener('click', () => {
      // Get the original URL from the data attribute (it's been HTML escaped)
      const url = item.dataset.url;
      if (url && url !== 'undefined') {
        chromeApi.tabs.create({ url: url });
      }
    });
  });
}

// Set up event listeners
function setupEventListeners() {
  // Quick save button
  quickSaveBtn.addEventListener('click', handleQuickSave);
  
  // Settings navigation
  settingsBtn.addEventListener('click', () => showView('settings'));
  backBtn.addEventListener('click', () => showView('main'));
  
  // Auth button
  authBtn.addEventListener('click', handleAuth);
  
  // Add tags button
  addTagsBtn.addEventListener('click', async () => {
    const tagsText = tagsInput.value.trim();
    if (!tagsText || !lastSavedNoteId) return;
    
    const tags = tagsText.split(/\s+/).filter(t => t.length > 0);
    
    // Disable button while updating
    addTagsBtn.disabled = true;
    addTagsBtn.textContent = 'Adding...';
    
    // Send update request to background
    try {
      const response = await chromeApi.runtime.sendMessage({
        action: 'updateTags',
        noteId: lastSavedNoteId,
        tags: tags
      });
      
      if (response.success) {
        showStatus('Tags added!', 'success');
        setTimeout(() => {
          window.close();
        }, 1000);
      } else {
        showStatus(response.error || 'Failed to add tags', 'error');
        addTagsBtn.disabled = false;
        addTagsBtn.textContent = 'Add Tags';
      }
    } catch (error) {
      console.error('Failed to update tags:', error);
      showStatus('Failed to add tags', 'error');
      addTagsBtn.disabled = false;
      addTagsBtn.textContent = 'Add Tags';
    }
  });
  
  // Enter key on tags input
  tagsInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTagsBtn.click();
    }
  });
  
  // Authentication is handled via OAuth login
  
  // Search input
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      displayRecentSaves(allSavedArticles);
    }, 300); // Debounce search
  });
  
  // Import button
  importBtn.addEventListener('click', () => {
    importFile.click();
  });
  
  // Import file handler
  importFile.addEventListener('change', handlePocketImport);
  
  // Debug button - only show in development
  const debugBtn = document.getElementById('debugBtn');
  const debugInfo = document.getElementById('debugInfo');
  const debugSection = debugBtn?.closest('.setting-item');
  
  // Check if running in development
  const IS_DEV = !('update_url' in chrome.runtime.getManifest());
  
  // Hide debug section in production
  if (debugSection && !IS_DEV) {
    debugSection.style.display = 'none';
  }
  
  if (debugBtn && IS_DEV) {
    debugBtn.addEventListener('click', async () => {
      try {
        // Toggle debug info visibility
        if (!debugInfo.classList.contains('hidden')) {
          debugInfo.classList.add('hidden');
          debugBtn.textContent = 'View Debug Logs';
          return;
        }
        
        // Load debug logs from storage
        const result = await chrome.storage.local.get(['debugLogs', 'authToken', 'userId']);
        const logs = result.debugLogs || [];
        
        // Show debug info
        debugInfo.classList.remove('hidden');
        debugBtn.textContent = 'Hide Debug Logs';
        
        // Format logs
        let html = `<div style="margin-bottom: 10px;">
          <strong>Auth:</strong> ${result.authToken ? '✅' : '❌'} 
          <strong>UserID:</strong> ${result.userId || 'None'}
          <strong>Logs:</strong> ${logs.length}
        </div>`;
        
        // Show recent logs (newest first)
        logs.slice(-10).reverse().forEach(log => {
          const isError = log.message.includes('error') || log.message.includes('fail') || log.message.includes('❌');
          html += `<div style="color: ${isError ? 'red' : 'black'}; margin-bottom: 5px;">
            ${log.timestamp.split('T')[1].split('.')[0]} - ${log.message}
            ${log.data && Object.keys(log.data).length > 0 ? 
              `<br><span style="font-size: 11px; color: #666;">${JSON.stringify(log.data)}</span>` : ''}
          </div>`;
        });
        
        if (logs.length === 0) {
          html += '<div>No debug logs found. Try saving an article.</div>';
        }
        
        debugInfo.innerHTML = html;
        
      } catch (error) {
        console.error('Failed to load debug logs:', error);
        debugInfo.innerHTML = `<div style="color: red;">Error loading logs: ${error.message}</div>`;
        debugInfo.classList.remove('hidden');
      }
    });
  }
}

// Handle quick save
async function handleQuickSave() {
  if (!isAuthenticated) {
    showStatus('Please login first', 'error');
    showView('settings');
    return;
  }
  
  // Disable button and show loading state
  quickSaveBtn.disabled = true;
  quickSaveBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Saving...</span>';
  
  try {
    // Send save message to background (no tags for quick save)
    const response = await chromeApi.runtime.sendMessage({ 
      action: 'save',
      tags: [] 
    });
    
    console.log('Save response:', response);
    if (response && response.success) {
      lastSavedNoteId = response.noteId;
      
      // Hide save button, show post-save options
      quickSaveBtn.classList.add('hidden');
      postSaveOptions.classList.remove('hidden');
        
      loadRecentSaves(); // Refresh recent saves
      
      // Don't close popup - let user add tags if they want
    } else {
      showStatus(response.error || 'Failed to save', 'error');
      quickSaveBtn.disabled = false;
      quickSaveBtn.innerHTML = '<span class="btn-icon">📌</span><span class="btn-text">Save to Thoughtstream</span>';
    }
  } catch (error) {
    console.error('Save failed:', error);
    showStatus('Failed to save', 'error');
    quickSaveBtn.disabled = false;
    quickSaveBtn.innerHTML = '<span class="btn-icon">📌</span><span class="btn-text">Save to Thoughtstream</span>';
  }
}

// Handle auth
async function handleAuth() {
  if (isAuthenticated) {
    // Logout
    authBtn.disabled = true;
    authBtn.textContent = 'Logging out...';
    
    try {
      const response = await chromeApi.runtime.sendMessage({ action: 'logout' });
      isAuthenticated = false;
      await updateAuthDisplay();
      showStatus('Logged out', 'success');
      authBtn.disabled = false;
    } catch (error) {
      console.error('Logout failed:', error);
      showStatus('Logout failed', 'error');
      authBtn.disabled = false;
    }
  } else {
    // Login
    authBtn.disabled = true;
    authBtn.textContent = 'Logging in...';
    
    try {
      const response = await chromeApi.runtime.sendMessage({ action: 'login' });
      authBtn.disabled = false;
      
      if (response.success) {
        isAuthenticated = true;
        
        // Get user info
        const stored = await storageService.get([CONFIG.storageKeys.userId, 'userEmail']);
        
        await updateAuthDisplay();
        showStatus(`Logged in as ${stored.userEmail || 'user'}`, 'success');
        
        // Switch back to main view
        showView('main');
      } else {
        await updateAuthDisplay();
        showStatus(response.error || 'Login failed', 'error');
      }
    } catch (error) {
      console.error('Login failed:', error);
      authBtn.disabled = false;
      await updateAuthDisplay();
      showStatus('Login failed', 'error');
    }
  }
}

// Show view
function showView(view) {
  if (view === 'settings') {
    mainView.classList.add('hidden');
    settingsView.classList.remove('hidden');
  } else {
    settingsView.classList.add('hidden');
    mainView.classList.remove('hidden');
  }
}

// Show status message
function showStatus(message, type) {
  const statusIcon = saveStatus.querySelector('.status-icon');
  const statusMessage = saveStatus.querySelector('.status-message');
  
  saveStatus.classList.remove('hidden', 'success', 'error');
  saveStatus.classList.add(type);
  
  statusIcon.textContent = type === 'success' ? '✓' : '!';
  statusMessage.textContent = message;
  
  setTimeout(() => {
    saveStatus.classList.add('hidden');
  }, 3000);
}


// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  
  return date.toLocaleDateString();
}

// Parse Pocket export HTML
function parsePocketExport(htmlContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  
  const articles = [];
  doc.querySelectorAll('a').forEach(link => {
    const timeAdded = link.getAttribute('time_added');
    const tags = link.getAttribute('tags');
    
    articles.push({
      url: link.href,
      title: link.textContent || 'Untitled',
      addedAt: timeAdded ? new Date(parseInt(timeAdded) * 1000) : new Date(),
      tags: tags ? tags.split(',').filter(t => t.trim()) : []
    });
  });
  
  return articles;
}

// Handle Pocket import
async function handlePocketImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!isAuthenticated) {
    showImportStatus('Please login first', 'error');
    return;
  }
  
  try {
    const content = await file.text();
    const articles = parsePocketExport(content);
    
    if (articles.length === 0) {
      showImportStatus('No articles found in export file', 'error');
      return;
    }
    
    showImportStatus(`Found ${articles.length} articles. Importing...`, '');
    
    // Send to background for processing
    const response = await chromeApi.runtime.sendMessage({
      action: 'importPocket',
      articles: articles
    });
    
    if (response.success) {
      showImportStatus(
        `Successfully imported ${response.imported} of ${response.total} articles`, 
        'success'
      );
      loadRecentSaves(); // Refresh the list
    } else {
      showImportStatus(response.error || 'Import failed', 'error');
    }
    
  } catch (error) {
    console.error('Import failed:', error);
    showImportStatus(error.message || 'Failed to import', 'error');
  }
  
  // Reset file input
  event.target.value = '';
}

// Show import status
function showImportStatus(message, type) {
  importProgress.textContent = message;
  importProgress.classList.remove('hidden', 'success', 'error');
  if (type) {
    importProgress.classList.add(type);
  }
  
  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      importProgress.classList.add('hidden');
    }, 5000);
  }
}