// Popup script for TsPocket
import CONFIG from './config.js';
import storageService from './storage-service.js';
import chromeApi from './chrome-api.js';
import logger from './logger.js';
import Fuse from './fuse.mjs';

// DOM Elements
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const quickSaveBtn = document.getElementById('quickSaveBtn');
const thoughtstreamBtn = document.getElementById('thoughtstreamBtn');
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
let fuse = null; // Fuse.js instance

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  logger.info('Popup loaded', { fuseAvailable: typeof Fuse !== 'undefined' });
  
  // Display version from manifest
  const manifest = chrome.runtime.getManifest();
  const versionElement = document.getElementById('app-version');
  if (versionElement) {
    versionElement.textContent = `TsPocket v${manifest.version}`;
  }
  
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
    logger.error('Failed to check auth status:', { error: error.message });
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
    
    // Initialize Fuse.js with weighted search configuration
    if (allSavedArticles.length > 0 && typeof Fuse !== 'undefined') {
      const fuseOptions = {
        keys: [
          { name: 'title', weight: 0.4 },
          { name: 'url', weight: 0.3 },
          { name: 'tags', weight: 0.2 },
          { name: 'content', weight: 0.05 },
          { name: 'description', weight: 0.05 }
        ],
        threshold: 0.4, // Increased from 0.3 for more fuzzy matches
        ignoreLocation: true,
        includeScore: true,
        shouldSort: true,
        minMatchCharLength: 2, // Minimum character length to match
        findAllMatches: true, // Find all matches in the string
        distance: 100 // Maximum distance between matched characters
      };
      fuse = new Fuse(allSavedArticles, fuseOptions);
      logger.info('Fuse.js initialized', { 
        articleCount: allSavedArticles.length,
        threshold: fuseOptions.threshold 
      });
    }
    
    displayRecentSaves(allSavedArticles);
  } catch (error) {
    logger.error('Failed to load saved articles:', { error: error.message });
    allSavedArticles = [];
    displayRecentSaves(allSavedArticles);
  }
}

// Search articles
function searchArticles(query) {
  if (!query.trim()) {
    return allSavedArticles;
  }
  
  // Use Fuse.js for fuzzy search if available
  if (fuse) {
    logger.debug('Searching with Fuse.js', { query });
    const results = fuse.search(query);
    logger.debug('Search results', { 
      query,
      resultCount: results.length,
      topResults: results.slice(0, 3).map(r => ({
        title: r.item.title,
        score: r.score
      }))
    });
    // Return the original items from the search results
    return results.map(result => result.item);
  }
  
  // Fallback to basic search if Fuse.js is not initialized
  logger.debug('Using basic search (Fuse not available)');
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
    
    // Add link indicator if highlight contains links
    const linkIndicator = article.hasLinks ? '<span class="link-indicator" title="Contains links">🔗</span>' : '';
    
    // Show description for highlights instead of URL
    const displayContent = article.isHighlight && article.description
      ? `<div class="recent-item-description">${escapeHtml(article.description)}</div>`
      : `<div class="recent-item-url">${escapeHtml(domain)}</div>`;
    
    return `
      <div class="recent-item ${article.isHighlight ? 'is-highlight' : ''} ${article.hasLinks ? 'has-links' : ''}" data-url="${escapeHtml(article.url)}" data-note-id="${escapeHtml(articleId)}">
        <div class="recent-item-title">${highlightIndicator}${linkIndicator}${escapeHtml(article.title)}</div>
        ${displayContent}
        ${tags}
        <div class="recent-item-time">${escapeHtml(timeAgo)}</div>
        <button class="open-note-btn" data-note-id="${escapeHtml(articleId)}" title="Open in Thoughtstream">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </button>
        <button class="delete-btn" data-note-id="${escapeHtml(articleId)}" title="Delete">×</button>
      </div>
    `;
  }).join('');
}

// Set up event listeners
function setupEventListeners() {
  // Event delegation for recent list (handles both article clicks and delete buttons)
  recentList.addEventListener('click', async (e) => {
    // Handle open note button clicks
    if (e.target.closest('.open-note-btn')) {
      e.stopPropagation();
      e.preventDefault();
      
      const btn = e.target.closest('.open-note-btn');
      const noteId = btn.dataset.noteId;
      if (!noteId || noteId === 'undefined') {
        showStatus('Cannot open: Note ID not found', 'error');
        return;
      }
      
      // Open the note in Thoughtstream app (internal link)
      // Format: https://ideaflow.app/?noteIdList=%5B%22noteId%22%5D
      const noteIdArray = JSON.stringify([noteId]);
      const encodedNoteIdList = encodeURIComponent(noteIdArray);
      const thoughtstreamNoteUrl = `https://ideaflow.app/?noteIdList=${encodedNoteIdList}`;
      await chrome.tabs.create({ url: thoughtstreamNoteUrl, active: true });
      return;
    }
    
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
          logger.error('Delete error:', { error: error.message });
          showStatus('Failed to delete article', 'error');
        }
      });
      return;
    }
    
    // Handle article clicks (open in new tab)
    const recentItem = e.target.closest('.recent-item');
    if (recentItem && !e.target.closest('.open-note-btn') && !e.target.closest('.delete-btn')) {
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
  
  // Thoughtstream button
  thoughtstreamBtn.addEventListener('click', async () => {
    const thoughtstreamUrl = 'https://ideaflow.app';
    await chrome.tabs.create({ url: thoughtstreamUrl, active: true });
    window.close(); // Close the popup after opening
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
      logger.error('Failed to update tags:', { error: error.message });
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
  
  // Search input with debouncing for better performance
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value;
    
    searchTimeout = setTimeout(() => {
      const filtered = searchArticles(query);
      displayRecentSaves(filtered);
    }, 150); // 150ms debounce
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
        logger.error('Failed to delete all articles:', { error: error.message });
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
