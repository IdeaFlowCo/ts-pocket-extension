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
const preSaveTagsInput = document.getElementById('preSaveTagsInput');
const recentList = document.getElementById('recentList');
const saveStatus = document.getElementById('saveStatus');
const authStatus = document.getElementById('authStatus');
const postSaveOptions = document.getElementById('postSaveOptions');
const addTagsBtn = document.getElementById('addTagsBtn');
const searchInput = document.getElementById('searchInput');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const importProgress = document.getElementById('importProgress');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');
const confirmOkBtn = document.getElementById('confirmOkBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');

// State
let currentTags = [];
let isAuthenticated = false;
let lastSavedNoteId = null;
let allSavedArticles = [];
let pendingAction = null;

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
  try {
    const savedArticles = await storageService.getSavedArticles();
    allSavedArticles = savedArticles || [];
    displayRecentSaves(allSavedArticles);
  } catch (error) {
    console.error('Failed to load saved articles:', error);
    allSavedArticles = [];
    displayRecentSaves(allSavedArticles);
  }
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
      // Invalid URL - silently skip
    }
    
    // Escape tags to prevent XSS
    const tags = article.tags?.length > 0 
      ? `<div class="recent-item-tags">${article.tags.map(t => escapeHtml(t.startsWith('#') ? t : `#${t}`)).join(' ')}</div>` 
      : '';
    
    const articleId = article.noteId || article.id || article.url;
    
    // Add highlight indicator if this is a text selection
    const highlightIndicator = article.isHighlight ? '<span class="highlight-indicator" title="Text selection">📌</span>' : '';
    
    return `
      <div class="recent-item ${article.isHighlight ? 'is-highlight' : ''}" data-url="${escapeHtml(article.url)}" data-note-id="${escapeHtml(articleId)}">
        <div class="recent-item-title">${highlightIndicator}${escapeHtml(article.title)}</div>
        <div class="recent-item-url">${escapeHtml(domain)}</div>
        ${tags}
        <div class="recent-item-time">${escapeHtml(timeAgo)}</div>
        <button class="delete-btn" data-note-id="${escapeHtml(articleId)}" title="Delete">×</button>
      </div>
    `;
  }).join('');
}

// Set up event listeners
function setupEventListeners() {
  // Event delegation for recent list (handles both article clicks and delete buttons)
  recentList.addEventListener('click', async (e) => {
    // Handle delete button clicks
    if (e.target.classList.contains('delete-btn')) {
      e.stopPropagation();
      e.preventDefault();
      
      const noteId = e.target.dataset.noteId;
      if (!noteId || noteId === 'undefined') {
        showStatus('Cannot delete: Article ID not found', 'error');
        return;
      }
      
      // Show confirmation modal
      showConfirmation('Are you sure you want to delete this article?', async () => {
        try {
          const deleted = await storageService.deleteSavedArticle(noteId);
          if (deleted) {
            await loadRecentSaves();
            showStatus('Article deleted', 'success');
          } else {
            showStatus('Article not found', 'error');
          }
        } catch (error) {
          console.error('Delete error:', error);
          showStatus('Failed to delete article', 'error');
        }
      });
      return;
    }
    
    // Handle article clicks (open in new tab)
    const recentItem = e.target.closest('.recent-item');
    if (recentItem) {
      const url = recentItem.dataset.url;
      if (url && url !== 'undefined') {
        chromeApi.tabs.create({ url: url });
      }
    }
  });
  
  // Quick save button
  quickSaveBtn.addEventListener('click', handleQuickSave);
  
  // Enter key on pre-save tags input
  preSaveTagsInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQuickSave();
    }
  });
  
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
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value;
    const filtered = searchArticles(query);
    displayRecentSaves(filtered);
  });
  
  // Import button
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', handlePocketImport);
  
  // Delete all button
  deleteAllBtn.addEventListener('click', () => {
    showConfirmation('Are you sure you want to delete ALL saved articles? This cannot be undone.', async () => {
      try {
        await storageService.set({ [CONFIG.storageKeys.savedArticles]: [] });
        allSavedArticles = [];
        displayRecentSaves([]);
        showStatus('All articles deleted', 'success');
      } catch (error) {
        console.error('Failed to delete all articles:', error);
        showStatus('Error deleting articles', 'error');
      }
    });
  });

  // Modal buttons
  confirmCancelBtn.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    pendingAction = null;
  });

  confirmOkBtn.addEventListener('click', () => {
    if (pendingAction) {
      pendingAction();
    }
    confirmModal.classList.add('hidden');
    pendingAction = null;
  });
  
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
        
        // Get logs from background script
        const response = await chrome.runtime.sendMessage({ action: 'getLogs' });
        const logs = response.logs || [];
        
        // Show debug info
        debugInfo.classList.remove('hidden');
        debugBtn.textContent = 'Hide Debug Logs';
        
        // Format logs without sensitive data
        let html = `<div style="margin-bottom: 10px;">
          <strong>Logs:</strong> ${logs.length}
        </div>`;
        
        // Show recent logs (newest first)
        logs.slice(-20).reverse().forEach(log => {
          const levelColors = {
            'ERROR': 'red',
            'WARN': 'orange',
            'INFO': 'green',
            'DEBUG': 'blue'
          };
          const color = levelColors[log.level] || 'black';
          
          html += `<div style="margin-bottom: 5px;">
            <span style="color: ${color}; font-weight: bold;">[${log.level}]</span>
            <span style="color: #666;">[${log.source}]</span>
            ${log.timestamp.split('T')[1].split('.')[0]} - ${log.message}
            ${log.data && Object.keys(log.data).length > 0 ? 
              `<br><span style="font-size: 11px; color: #666;">${JSON.stringify(log.data)}</span>` : ''}
          </div>`;
        });
        
        if (logs.length === 0) {
          html += '<div>No logs found. Try saving an article.</div>';
        }
        
        debugInfo.innerHTML = html;
        
      } catch (error) {
        // Debug log loading error
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
    // Get tags from pre-save input
    const preSaveTags = preSaveTagsInput.value.trim();
    const tagsArray = preSaveTags ? preSaveTags.split(/\s+/).filter(tag => tag.length > 0) : [];
    
    // Send save message to background with pre-save tags
    const response = await chromeApi.runtime.sendMessage({ 
      action: 'save',
      tags: tagsArray 
    });
    
    // Save response received
    
    if (!response) {
      // No response from background
      showStatus('No response from extension', 'error');
      quickSaveBtn.disabled = false;
      quickSaveBtn.innerHTML = '<span class="btn-icon">📌</span><span class="btn-text">Save to Thoughtstream</span>';
      return;
    }
    
    if (response && response.success) {
      lastSavedNoteId = response.noteId;
      
      // Clear pre-save tags input
      preSaveTagsInput.value = '';
      
      // Hide save button, show post-save options
      quickSaveBtn.classList.add('hidden');
      postSaveOptions.classList.remove('hidden');
        
      loadRecentSaves(); // Refresh recent saves
      
      // Show warning if there was one (e.g., extraction failed)
      if (response.warning) {
        showStatus(response.warning, 'warning');
      }
      
      // Don't close popup - let user add tags if they want
    } else {
      const errorMsg = response?.error || 'Failed to save article to Thoughtstream';
      // Save failed
      showStatus(errorMsg, 'error');
      quickSaveBtn.disabled = false;
      quickSaveBtn.innerHTML = '<span class="btn-icon">📌</span><span class="btn-text">Save to Thoughtstream</span>';
      
      // Show additional help for common errors
      if (errorMsg.includes('401') || errorMsg.includes('Authentication')) {
        setTimeout(() => {
          showStatus('Please re-login in Settings', 'error');
        }, 3000);
      }
    }
  } catch (error) {
    // Save error
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
      // Logout error
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
      // Login error
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
    
    // Reset main view UI
    quickSaveBtn.classList.remove('hidden');
    quickSaveBtn.disabled = false;
    quickSaveBtn.innerHTML = '<span class="btn-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></span><span class="btn-text">Save to Thoughtstream</span>';
    postSaveOptions.classList.add('hidden');
    preSaveTagsInput.value = '';
    tagsInput.value = '';
    
    // Refresh recent saves when returning to main view
    loadRecentSaves();
  }
}

// Show status message
function showStatus(message, type) {
  const statusIcon = saveStatus.querySelector('.status-icon');
  const statusMessage = saveStatus.querySelector('.status-message');
  
  // Remove all classes and add the appropriate ones
  saveStatus.classList.remove('hidden', 'show', 'success', 'error');
  saveStatus.classList.add(type);
  
  statusIcon.textContent = type === 'success' ? '✓' : '!';
  statusMessage.textContent = message;
  
  // Force a reflow to ensure the transition works
  saveStatus.offsetHeight;
  
  // Show the status
  saveStatus.classList.add('show');
  
  // Hide after 2.5 seconds
  setTimeout(() => {
    saveStatus.classList.remove('show');
    setTimeout(() => {
      saveStatus.classList.add('hidden');
    }, 300); // Wait for fade out transition
  }, 2500);
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
    // Import error
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

function showConfirmation(message, onConfirm) {
  confirmMessage.textContent = message;
  pendingAction = onConfirm;
  confirmModal.classList.remove('hidden');
}