// Popup script for IdeaPocket
import CONFIG from './config.ts';
import storageService from './storage-service.js';
import chromeApi from './chrome-api.js';
import Fuse from './fuse.mjs';

// Logger that sends all logs to service worker
const logger = {
  info: (message, data) => {
    chrome.runtime.sendMessage({ 
      action: 'log', 
      level: 'info', 
      message, 
      data,
      source: 'popup'
    });
  },
  error: (message, data) => {
    chrome.runtime.sendMessage({ 
      action: 'log', 
      level: 'error', 
      message, 
      data,
      source: 'popup'
    });
  },
  warn: (message, data) => {
    chrome.runtime.sendMessage({ 
      action: 'log', 
      level: 'warn', 
      message, 
      data,
      source: 'popup'
    });
  },
  debug: (message, data) => {
    chrome.runtime.sendMessage({ 
      action: 'log', 
      level: 'debug', 
      message, 
      data,
      source: 'popup'
    });
  }
};

// New helper function to prevent hangs in incompatible browsers
async function runWithTimeout(promise, timeout = 1500) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
  );
  return Promise.race([promise, timeoutPromise]);
}

// DOM Elements
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const importView = document.getElementById('importView');
const quickSaveBtn = document.getElementById('quickSaveBtn');
const ideaflowBtn = document.getElementById('ideaflowBtn');
const importBtn = document.getElementById('importBtn');
const settingsBtn = document.getElementById('settingsBtn');
const backBtn = document.getElementById('backBtn');
const authBtn = document.getElementById('authBtn');
const tagsInput = document.getElementById('tagsInput');
const recentList = document.getElementById('recentList');
const saveStatus = document.getElementById('saveStatus');
const authStatus = document.getElementById('authStatus');
const postSaveOptions = document.getElementById('postSaveOptions');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const clearTagsBtn = document.getElementById('clearTagsBtn');
const tagsPills = document.getElementById('tagsPills');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');
const confirmOkBtn = document.getElementById('confirmOkBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const changeShortcutBtn = document.getElementById('changeShortcutBtn');
const importBackBtn = document.getElementById('importBackBtn');
const importSettingsBtn = document.getElementById('importSettingsBtn');
const importFileBtn = document.getElementById('importFileBtn');
const importFileInput = document.getElementById('importFileInput');
const importStatus = document.getElementById('importStatus');
const openSavedNoteBtn = document.getElementById('openSavedNoteBtn');
const deleteSavedNoteBtn = document.getElementById('deleteSavedNoteBtn');

// Autocomplete elements
const tagsDropdown = document.getElementById('tagsDropdown');

// State
let isAuthenticated = false;
let lastSavedNoteId = null;
let allSavedArticles = [];
let pendingAction = null;
let fuse = null; // Fuse.js instance
let currentTags = [];
let saveTagsTimeout = null;
let shimmerTimeout = null;
let lastTypingTime = 0;
let allHashtags = [];

// Autocomplete state
let availableHashtags = [];
let currentFocus = -1;

// Track whether the current page has already been saved
let alreadySavedForCurrentPage = false;

// Detect if the current tab URL is already in savedArticles and switch the UI
async function checkCurrentPageAlreadySaved() {
  try {
    const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) return;
    const currentUrl = tabs[0].url;
    if (!currentUrl) return;

    const currentNorm = normalizeUrl(currentUrl);

    // Ensure we have the latest saved articles list
    if (allSavedArticles.length === 0) {
      try {
        const saved = await storageService.getSavedArticles();
        allSavedArticles = saved || [];
      } catch (e) {
        logger.error('Failed to fetch saved articles for already-saved check', { error: e.message });
      }
    }

    const match = allSavedArticles.find(a => normalizeUrl(a.url) === currentNorm);
    if (!match) return;

    alreadySavedForCurrentPage = true;
    lastSavedNoteId = match.noteId;

    // Switch view to the subdued post-save state
    quickSaveBtn.classList.add('hidden');
    postSaveOptions.classList.remove('hidden');
    postSaveOptions.classList.add('already-saved');

    // Update saved-message text to abbreviated page title
    try {
      const savedMsg = postSaveOptions.querySelector('.saved-message');
      if (savedMsg) {
        const savedTextSpan = savedMsg.querySelector('.saved-text');
        const tooltipTextSpan = savedMsg.querySelector('.tooltip-text');
        if (savedTextSpan) {
          const rawTitle = tabs[0].title || tabs[0].url || 'Saved';
          // Calculate space reserved for the open button (approximate)
          const openBtn = postSaveOptions.querySelector('.open-saved-note-btn');
          const reservedSpace = openBtn ? openBtn.offsetWidth + 20 : 60; // 20px for margins
          const truncatedTitle = truncateToFit(rawTitle, savedMsg, reservedSpace);
          savedTextSpan.textContent = truncatedTitle;
          if (tooltipTextSpan) {
            tooltipTextSpan.textContent = rawTitle;
          }
        }
      }
    } catch (e) {
      logger.error('Failed to set abbreviated saved-title', { error: e.message });
    }
  } catch (err) {
    logger.error('checkCurrentPageAlreadySaved failed', { error: err.message });
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  logger.info('Popup loaded', { fuseAvailable: typeof Fuse !== 'undefined' });

  // Display version from manifest
  try {
    const manifest = chrome.runtime.getManifest();
    const versionElement = document.getElementById('app-version');
    if (versionElement) {
      versionElement.textContent = `IdeaPocket v${manifest.version}`;
    }
  } catch (e) {
    logger.error('Failed to get manifest version', { error: e.message });
  }

  // --- Sequential, Timed Initialization ---
  try {
    await runWithTimeout(checkAuthStatus());
  } catch (e) {
    logger.error("Auth check failed or timed out", { error: e.message });
    // Continue execution even if this fails
  }

  try {
    await runWithTimeout(loadRecentSaves());
  } catch (e) {
    logger.error("Loading recent saves failed or timed out", { error: e.message });
  }

  try {
    await runWithTimeout(loadAvailableHashtags());
  } catch (e) {
    logger.error("Loading hashtags failed or timed out", { error: e.message });
  }

  try {
    await runWithTimeout(updateSaveButtonTooltip());
  } catch (e) {
    logger.error("Updating tooltip failed or timed out", { error: e.message });
  }

  // --- Check if the current page was already saved and show subdued state if so ---
  try {
    await runWithTimeout(checkCurrentPageAlreadySaved());
  } catch (e) {
    logger.error('Already-saved check failed or timed out', { error: e.message });
  }

  // This is now guaranteed to be called
  setupEventListeners();
  logger.info('Event listeners attached successfully.');

  try {
    await runWithTimeout(checkImportStatus());
  } catch (e) {
    logger.error("Checking import status failed or timed out", { error: e.message });
  }
});


// Check authentication status
async function checkAuthStatus() {
  try {
    const response = await chromeApi.runtime.sendMessage({ action: 'checkAuth' });
    isAuthenticated = response.isLoggedIn;
    
    if (isAuthenticated) {
      const stored = await storageService.get(['userEmail', 'userName']);
    }
    
    updateAuthDisplay();
    
    const hasSeenSetup = await storageService.get(['hasSeenSetup']);
    if (!isAuthenticated && !hasSeenSetup.hasSeenSetup) {
      showStatus('Please login to get started', 'info');
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
    authBtn.textContent = 'Login with Ideaflow';
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
  
  if (query.length === 1) {
    logger.debug('Using basic search for single character', { query });
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
    return results.map(result => result.item);
  }
  
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
  
  const sortedArticles = [...articles].sort((a, b) => {
    if (a.savedAt && b.savedAt) {
      return new Date(b.savedAt) - new Date(a.savedAt);
    }
    if (a.position && b.position) {
      return Number(b.position) - Number(a.position);
    }
    return 0;
  });
  
  const searchQuery = searchInput?.value || '';
  const filtered = searchQuery ? searchArticles(searchQuery) : sortedArticles;
  
  if (filtered.length === 0) {
    const message = allSavedArticles.length > 0 
      ? 'No results in recently saved' 
      : 'No saved articles yet';
    recentList.innerHTML = `<div class="loading">${message}</div>`;
    return;
  }
  
  recentList.innerHTML = filtered.map(article => {
    const timeAgo = getTimeAgo(new Date(article.savedAt));
    let domain = 'unknown';
    try {
      const url = new URL(article.url);
      domain = url.hostname.replace('www.', '');
    } catch (e) {}
    
    const tags = article.tags?.length > 0 
      ? `<div class="recent-item-tags">${article.tags.map(t => escapeHtml(t.startsWith('#') ? t : `#${t}`)).join(' ')}</div>` 
      : '';
    
    const articleId = article.noteId || article.id || article.url;
    const typeIndicator = article.isHighlight 
      ? '<div class="tooltip inline-tooltip"><span class="highlight-indicator" aria-label="Text selection">📌</span><span class="tooltip-text">Text selection</span></div>' 
      : '<div class="tooltip inline-tooltip"><span class="article-indicator" aria-label="Article">📄</span><span class="tooltip-text">Article</span></div>';
    
    const displayContent = article.isHighlight && article.description
      ? `<div class="recent-item-description">${escapeHtml(article.description)}</div>`
      : `<div class="recent-item-url">${escapeHtml(domain)}</div>`;
    
    const titleText = escapeHtml(article.isHighlight 
      ? (article.title && article.title.trim() && article.title !== 'Untitled' ? article.title : domain)
      : article.title);
    
    return `
      <div class="recent-item ${article.isHighlight ? 'is-highlight' : ''} ${article.hasLinks ? 'has-links' : ''}" data-url="${escapeHtml(article.url)}" data-note-id="${escapeHtml(articleId)}">
        <div class="recent-item-title">
          ${typeIndicator}
          <span class="title-text">${titleText}</span>
        </div>
        ${displayContent}
        ${tags}
        <div class="recent-item-time">${escapeHtml(timeAgo)}</div>
        <div class="tooltip">
          <button class="open-note-btn" data-note-id="${escapeHtml(articleId)}" aria-label="Open in My Ideaflow">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </button>
          <span class="tooltip-text">Open in My Ideaflow</span>
        </div>
        <div class="tooltip">
          <button class="delete-btn" data-note-id="${escapeHtml(articleId)}" aria-label="Delete Article">×</button>
          <span class="tooltip-text">Delete Article</span>
        </div>
      </div>
    `;
  }).join('');
}

// Set up event listeners
function setupEventListeners() {
  recentList.addEventListener('click', async (e) => {
    if (e.target.closest('.open-note-btn')) {
      e.stopPropagation();
      e.preventDefault();
      const btn = e.target.closest('.open-note-btn');
      const noteId = btn.dataset.noteId;
      if (!noteId || noteId === 'undefined') {
        showStatus('Cannot open: Note ID not found', 'error');
        return;
      }
      const noteIdArray = JSON.stringify([noteId]);
      const encodedNoteIdList = encodeURIComponent(noteIdArray);
      const ideaflowNoteUrl = `https://ideaflow.app/?noteIdList=${encodedNoteIdList}`;
      await chrome.tabs.create({ url: ideaflowNoteUrl, active: true });
      return;
    }
    
    if (e.target.closest('.delete-btn')) {
      e.stopPropagation();
      e.preventDefault();
      const btn = e.target.closest('.delete-btn');
      const noteId = btn.dataset.noteId;
      if (!noteId || noteId === 'undefined') {
        showStatus('Cannot delete: Article ID not found', 'error');
        return;
      }
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
    
    const recentItem = e.target.closest('.recent-item');
    if (recentItem && !e.target.closest('.open-note-btn') && !e.target.closest('.delete-btn')) {
      const url = recentItem.dataset.url;
      if (url && url !== 'undefined') {
        chromeApi.tabs.create({ url: url });
      }
    }
  });
  
  quickSaveBtn.addEventListener('click', () => {
    console.log('🔴 SAVE BUTTON CLICKED - RAW EVENT');
    logger.info('🔴 SAVE BUTTON CLICKED');
    handleQuickSave();
  });
  
  
  const ideaflowClickHandler = async () => {
    const ideaflowUrl = 'https://ideaflow.app';
    await chrome.tabs.create({ url: ideaflowUrl, active: true });
    window.close();
  };
  
  ideaflowBtn.addEventListener('click', ideaflowClickHandler);
  
  // Add keyboard support for the logo button
  ideaflowBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      ideaflowClickHandler();
    }
  });
  
  importBtn.addEventListener('click', () => showView('import'));
  settingsBtn.addEventListener('click', () => showView('settings'));
  backBtn.addEventListener('click', () => showView('main'));
  importBackBtn.addEventListener('click', () => showView('main'));
  importFileBtn.addEventListener('click', () => importFileInput.click());
  authBtn.addEventListener('click', handleAuth);
  
  openSavedNoteBtn.addEventListener('click', () => {
    if (lastSavedNoteId) {
      const ideaflowUrl = `https://ideaflow.app/?noteIdList=%5B%22${lastSavedNoteId}%22%5D`;
      chrome.tabs.create({ url: ideaflowUrl });
    }
  });

  deleteSavedNoteBtn.addEventListener('click', () => {
    if (lastSavedNoteId) {
      showConfirmation('Are you sure you want to delete this article?', async () => {
        try {
          const deleted = await storageService.deleteSavedArticle(lastSavedNoteId);
          if (deleted) {
            // Restore to pre-save state
            quickSaveBtn.classList.remove('hidden');
            quickSaveBtn.disabled = false;
            quickSaveBtn.innerHTML = '<span class="btn-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 1px; margin-bottom: 1px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></span><span class="btn-text">Save to Ideaflow</span>';
            postSaveOptions.classList.add('hidden');
            postSaveOptions.classList.remove('already-saved');
            
            // Clear tags and reset state
            tagsInput.value = '';
            currentTags.length = 0;
            renderTagPills(tagsPills, currentTags, removeCurrentTag);
            updateClearButtonVisibility();
            
            // Reset flags
            alreadySavedForCurrentPage = false;
            lastSavedNoteId = null;
            
            showStatus('Article deleted', 'success');
            // Reload recent saves to update the list
            await loadRecentSaves();
          } else {
            showStatus('Article not found', 'error');
          }
        } catch (error) {
          logger.error('Delete error:', { error: error.message });
          showStatus('Failed to delete article', 'error');
        }
      });
    }
  });
  
  
  tagsInput.addEventListener('keypress', (e) => {
    // Track typing activity (but not for Enter key, since that creates a tag)
    if (e.key !== 'Enter') {
      lastTypingTime = Date.now();
    }
    
    if (e.key === 'Enter') {
      e.preventDefault();
      const inputText = tagsInput.value.trim();
      if (inputText) {
        const normalizedTag = inputText.startsWith('#') ? inputText : `#${inputText}`;
        if (!currentTags.includes(normalizedTag)) {
          currentTags.push(normalizedTag);
          renderTagPills(tagsPills, currentTags, removeCurrentTag);
          debouncedSaveTags(); // Auto-save new tag
        }
        tagsInput.value = '';
        updateClearButtonVisibility();
      }
    }
  });
  
  tagsInput.addEventListener('input', (e) => {
    // Track typing activity
    lastTypingTime = Date.now();
    
    const value = e.target.value;
    if (value.includes(' ') || value.includes(',') || value.includes(';')) {
      const parts = value.split(/[\s,;]+/);
      const completedTags = parts.slice(0, -1).filter(tag => tag.trim().length > 0);
      const remainingText = parts[parts.length - 1] || '';
      
      let tagsAdded = false;
      completedTags.forEach(tag => {
        const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
        if (!currentTags.includes(normalizedTag)) {
          currentTags.push(normalizedTag);
          tagsAdded = true;
        }
      });
      
      if (tagsAdded) {
        renderTagPills(tagsPills, currentTags, removeCurrentTag);
        debouncedSaveTags(); // Auto-save new tags
      }
      
      tagsInput.value = remainingText;
    }
    showAutocomplete(tagsInput, tagsDropdown, tagsInput.value);
    updateClearButtonVisibility();
  });
  
  tagsInput.addEventListener('keydown', (e) => {
    if (!tagsDropdown.classList.contains('hidden')) {
      handleAutocompleteKeydown(e, tagsInput, tagsDropdown);
    }
  });
  
  tagsDropdown.addEventListener('click', (e) => {
    if (e.target.classList.contains('autocomplete-item')) {
      const selectedHashtag = e.target.dataset.hashtag;
      addTag(currentTags, tagsPills, selectedHashtag, removeCurrentTag);
      tagsInput.value = '';
      updateClearButtonVisibility();
      hideAutocomplete(tagsDropdown);
      tagsInput.focus();
      debouncedSaveTags(); // Auto-save selected tag
    }
  });
  
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value;
    if (query.trim()) {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }
    searchTimeout = setTimeout(() => {
      const filtered = searchArticles(query);
      displayRecentSaves(filtered);
    }, 150);
  });
  
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    displayRecentSaves(allSavedArticles);
    searchInput.focus();
  });
  
  
  clearTagsBtn.addEventListener('click', () => {
    // Only clear the input field, not the saved tags
    tagsInput.value = '';
    updateClearButtonVisibility();
    tagsInput.focus();
  });
  
  importSettingsBtn.addEventListener('click', () => showView('import'));
  importFileInput.addEventListener('change', handleFileImport);

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.pocketImportStatus) {
      const newStatus = changes.pocketImportStatus.newValue;
      updateImportStatus(newStatus);
      if (newStatus && newStatus.status === 'running') {
        showStatus(`Import in progress: ${newStatus.imported}/${newStatus.total}`, 'info');
      } else if (newStatus && newStatus.status === 'complete') {
        showPersistentStatus(`Import complete! Imported: ${newStatus.imported}, Failed: ${newStatus.failed}`, 'success');
      } else if (newStatus && newStatus.status === 'error') {
        showStatus(`Import failed: ${newStatus.error}`, 'error');
      }
    }
  });
  
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

  changeShortcutBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

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
  
  document.addEventListener('click', (e) => {
    if (!tagsInput.contains(e.target) && !tagsDropdown.contains(e.target)) {
      hideAutocomplete(tagsDropdown);
    }
  });
}

// Handle quick save
async function handleQuickSave() {
  logger.info('🚀 handleQuickSave called');
  
  if (!isAuthenticated) {
    logger.info('❌ User not authenticated');
    showStatus('Please login first', 'success');
    showView('settings');
    return;
  }
  
  logger.info('✅ User is authenticated, proceeding with save');
  quickSaveBtn.disabled = true;
  quickSaveBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Saving...</span>';
  
  try {
    const tagsArray = [];
    
    logger.info('🚀 Sending save message to background', { 
      action: 'save',
      tags: tagsArray,
      tagCount: tagsArray.length 
    });
    
    const response = await chromeApi.runtime.sendMessage({ 
      action: 'save',
      tags: tagsArray 
    });
    
    logger.info('📡 Save response received from background', { 
      response,
      hasResponse: !!response,
      success: response?.success 
    });
    
    if (!response) {
      showStatus('No response from extension', 'error');
      quickSaveBtn.disabled = false;
      quickSaveBtn.innerHTML = '<span class="btn-icon">📌</span><span class="btn-text">Save to Ideaflow</span>';
      return;
    }
    
    if (response && response.success) {
      lastSavedNoteId = response.noteId;
      
      tagsInput.value = '';
      currentTags.length = 0;
      renderTagPills(tagsPills, currentTags, removeCurrentTag);
      clearTagsBtn.classList.add('hidden');
      
      quickSaveBtn.classList.add('hidden');
      postSaveOptions.classList.remove('hidden');
      
      // Auto-fade from "Saved!" to article title after 2 seconds
      const savedMessage = postSaveOptions.querySelector('.saved-message');
      const savedText = savedMessage.querySelector('.saved-text');
      if (savedMessage && savedText && !postSaveOptions.classList.contains('already-saved')) {
        setTimeout(() => {
          logger.info('🎭 Starting fade-to-title animation');
          // Reset animation state first
          savedMessage.classList.remove('fade-to-title');
          // Force reflow to ensure class removal takes effect
          savedMessage.offsetHeight;
          // Add the animation class
          savedMessage.classList.add('fade-to-title');
          // Change text at the fade midpoint
          setTimeout(() => {
            logger.info('🎭 Changing text at animation midpoint');
            const pageTitle = document.title || 'Current Page';
            // Calculate space reserved for the open button
            const openBtn = postSaveOptions.querySelector('.open-saved-note-btn');
            const reservedSpace = openBtn ? openBtn.offsetWidth + 20 : 60; // 20px for margins
            const savedMessageContainer = savedMessage.parentElement || savedMessage;
            const truncatedTitle = truncateToFit(pageTitle, savedMessageContainer, reservedSpace);
            savedText.textContent = truncatedTitle;
            // Update the tooltip text to show the full title
            const tooltipText = savedText.parentElement.querySelector('.tooltip-text');
            if (tooltipText) {
              tooltipText.textContent = pageTitle;
            }
            logger.info('🎭 Text changed to:', truncatedTitle);
          }, 1500); // 1.5s to midpoint
        }, 2000);
      } else {
        logger.info('🎭 Animation skipped - elements not found or already-saved state');
      }
        
      loadRecentSaves();
      
      if (response.warning) {
        showStatus(response.warning, 'warning');
      }
      
    } else {
      const errorMsg = response?.error || 'Failed to save article to Ideaflow';
      showStatus(errorMsg, 'error');
      quickSaveBtn.disabled = false;
      quickSaveBtn.innerHTML = '<span class="btn-icon">📌</span><span class="btn-text">Save to Ideaflow</span>';
      
      if (errorMsg.includes('401') || errorMsg.includes('Authentication')) {
        setTimeout(() => {
          showStatus('Please re-login in Settings', 'error');
        }, 3000);
      }
    }
  } catch (error) {
    logger.error('Save failed with exception', { error: error.message, stack: error.stack });
    showStatus('Failed to save', 'error');
    quickSaveBtn.disabled = false;
    quickSaveBtn.innerHTML = '<span class="btn-icon">📌</span><span class="btn-text">Save to Ideaflow</span>';
  }
}

// Handle auth
async function handleAuth() {
  if (isAuthenticated) {
    authBtn.disabled = true;
    authBtn.textContent = 'Logging out...';
    
    try {
      const response = await chromeApi.runtime.sendMessage({ action: 'logout' });
      isAuthenticated = false;
      await updateAuthDisplay();
      showStatus('Logged out', 'success');
      authBtn.disabled = false;
    } catch (error) {
      showStatus('Logout failed', 'error');
      authBtn.disabled = false;
    }
  } else {
    authBtn.disabled = true;
    authBtn.textContent = 'Logging in...';
    
    try {
      const response = await chromeApi.runtime.sendMessage({ action: 'login' });
      authBtn.disabled = false;
      
      if (response.success) {
        isAuthenticated = true;
        
        const stored = await storageService.get([CONFIG.storageKeys.userId, 'userEmail']);
        
        await updateAuthDisplay();
        showStatus(`Logged in as ${stored.userEmail || 'user'}`, 'success');
        
        showView('main');
      } else {
        await updateAuthDisplay();
        showStatus(response.error || 'Login failed', 'error');
      }
    } catch (error) {
      authBtn.disabled = false;
      await updateAuthDisplay();
      showStatus('Login failed', 'error');
    }
  }
}

// Show view
function showView(view) {
  mainView.classList.add('hidden');
  settingsView.classList.add('hidden');
  importView.classList.add('hidden');
  
  if (view === 'settings') {
    settingsView.classList.remove('hidden');
    updateShortcutDisplay();
  } else if (view === 'import') {
    importView.classList.remove('hidden');
  } else {
    mainView.classList.remove('hidden');
    
    quickSaveBtn.classList.remove('hidden');
    quickSaveBtn.disabled = false;
    quickSaveBtn.innerHTML = '<span class="btn-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></span><span class="btn-text">Save to Ideaflow</span>';
    postSaveOptions.classList.add('hidden');
    tagsInput.value = '';
    
    currentTags.length = 0;
    renderTagPills(tagsPills, currentTags, removeCurrentTag);
    
    loadRecentSaves();
  }
}

// Show status message
function showStatus(message, type) {
  const statusIcon = saveStatus.querySelector('.status-icon');
  const statusMessage = saveStatus.querySelector('.status-message');
  
  saveStatus.classList.remove('hidden', 'show', 'success', 'error', 'info');
  saveStatus.classList.add(type);
  
  statusIcon.textContent = type === 'success' ? '✓' : type === 'info' ? 'ℹ' : '!';
  statusMessage.textContent = message;
  
  saveStatus.offsetHeight;
  
  saveStatus.classList.add('show');
  
  setTimeout(() => {
    saveStatus.classList.remove('show');
    setTimeout(() => {
      saveStatus.classList.add('hidden');
    }, 300);
  }, 2500);
}

// Show persistent status message that stays longer and is more prominent
function showPersistentStatus(message, type) {
  const statusIcon = saveStatus.querySelector('.status-icon');
  const statusMessage = saveStatus.querySelector('.status-message');
  
  saveStatus.classList.remove('hidden', 'show', 'success', 'error', 'info');
  saveStatus.classList.add(type);
  
  statusIcon.textContent = type === 'success' ? '✓' : type === 'info' ? 'ℹ' : '!';
  statusMessage.textContent = message;
  
  saveStatus.offsetHeight;
  
  saveStatus.classList.add('show');
  
  setTimeout(() => {
    saveStatus.classList.remove('show');
    setTimeout(() => {
      saveStatus.classList.add('hidden');
    }, 300);
  }, 8000);
}

// Update shortcut display
async function updateShortcutDisplay() {
  const shortcutSpan = document.getElementById('currentShortcut');
  if (!shortcutSpan) return;

  shortcutSpan.textContent = 'Loading...';

  const isMac = /Mac|iMac|iPhone|iPod|iPad/i.test(navigator.platform);

  const keyTranslations = {
    mac: {
      '⌘': 'Command', '⇧': 'Shift', '⌃': 'Control', '⌥': 'Option',
      'Command': 'Command', 'Shift': 'Shift', 'Ctrl': 'Control', 'Alt': 'Option', 'MacCtrl': 'Control',
    },
    other: {
      'Ctrl': 'Ctrl', 'Alt': 'Alt', 'Shift': 'Shift', 'Command': 'Command',
    }
  };

  const currentTranslations = isMac ? keyTranslations.mac : keyTranslations.other;

  try {
    const commandsPromise = chrome.commands.getAll();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 500));
    const commands = await Promise.race([commandsPromise, timeoutPromise]);

    const command = commands.find(cmd => cmd.name === 'quick-save');
    if (command && command.shortcut) {
      const shortcut = command.shortcut;
      const parts = shortcut.match(/([⌘⇧⌃⌥]|MacCtrl|Command|Shift|Ctrl|Alt|Option|\w)/g) || [];
      const translatedParts = parts.map(part => currentTranslations[part] || part);
      const translated = translatedParts.join('+');
      shortcutSpan.textContent = `${shortcut} (${translated})`;
    } else {
      shortcutSpan.textContent = 'Not set';
    }
  } catch (error) {
    logger.error('Failed to get commands:', { error: error.message });
    shortcutSpan.textContent = 'Error loading shortcut';
  }
}

// Update save button tooltip with current shortcut
async function updateSaveButtonTooltip() {
  const tooltipSpan = document.getElementById('saveButtonTooltip');
  if (!tooltipSpan) return;

  tooltipSpan.textContent = 'Loading shortcut...';

  try {
    const commandsPromise = chrome.commands.getAll();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 500));
    const commands = await Promise.race([commandsPromise, timeoutPromise]);

    const command = commands.find(cmd => cmd.name === 'quick-save');
    if (command && command.shortcut) {
      const shortcut = command.shortcut;
      tooltipSpan.textContent = `Shortcut: ${shortcut}`;
    } else {
      tooltipSpan.textContent = 'No shortcut set';
    }
  } catch (error) {
    logger.error('Failed to get commands for tooltip:', { error: error.message });
    tooltipSpan.textContent = 'Save to Ideaflow'; // Fallback text
  }
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Smart truncation based on available space
function truncateToFit(text, container, reservedSpace = 0) {
  if (!text || !container) return text;
  
  // Create a temporary element to measure text width
  const measurer = document.createElement('span');
  measurer.style.visibility = 'hidden';
  measurer.style.position = 'absolute';
  measurer.style.whiteSpace = 'nowrap';
  measurer.style.font = window.getComputedStyle(container).font;
  document.body.appendChild(measurer);
  
  try {
    // Get available width (container width minus reserved space for buttons)
    const containerWidth = container.offsetWidth;
    const availableWidth = containerWidth - reservedSpace;
    
    // If full text fits, return it
    measurer.textContent = text;
    if (measurer.offsetWidth <= availableWidth) {
      return text;
    }
    
    // Binary search for the longest text that fits
    let low = 0;
    let high = text.length;
    let bestFit = '';
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = text.substring(0, mid) + '...';
      measurer.textContent = candidate;
      
      if (measurer.offsetWidth <= availableWidth) {
        bestFit = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    
    // Try to break at word boundary if possible
    if (bestFit.length > 3) {
      const withoutEllipsis = bestFit.substring(0, bestFit.length - 3);
      const lastSpaceIndex = withoutEllipsis.lastIndexOf(' ');
      if (lastSpaceIndex > withoutEllipsis.length * 0.7) { // Only if we don't lose too much
        return withoutEllipsis.substring(0, lastSpaceIndex) + '...';
      }
    }
    
    return bestFit || text;
  } finally {
    document.body.removeChild(measurer);
  }
}

// Tag Pills Management
function createTagPill(tag, onRemove) {
  const pill = document.createElement('div');
  pill.className = 'tag-pill';
  pill.innerHTML = `
    <span class="tag-pill-text">${escapeHtml(tag)}</span>
    <div class="tooltip">
      <button class="tag-pill-remove" aria-label="Remove tag">×</button>
      <span class="tooltip-text">Remove tag</span>
    </div>
  `;
  
  const removeBtn = pill.querySelector('.tag-pill-remove');
  removeBtn.addEventListener('click', () => onRemove(tag));
  
  return pill;
}

function renderTagPills(container, tags, onRemove) {
  container.innerHTML = '';
  tags.forEach(tag => {
    const pill = createTagPill(tag, onRemove);
    container.appendChild(pill);
  });
}

function addTag(tagsArray, container, tag, onRemove) {
  const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
  if (!tagsArray.includes(normalizedTag)) {
    tagsArray.push(normalizedTag);
    renderTagPills(container, tagsArray, onRemove);
  }
}

function addMultipleTags(tagsArray, container, inputText, onRemove) {
  const tags = inputText.split(/[\s,;]+/).filter(tag => tag.trim().length > 0);
  
  tags.forEach(tag => {
    const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
    if (!tagsArray.includes(normalizedTag)) {
      tagsArray.push(normalizedTag);
    }
  });
  
  renderTagPills(container, tagsArray, onRemove);
}

function removeTag(tagsArray, container, tag, onRemove) {
  const index = tagsArray.indexOf(tag);
  if (index > -1) {
    tagsArray.splice(index, 1);
    renderTagPills(container, tagsArray, onRemove);
  }
}

// Helper function for clear button visibility
function updateClearButtonVisibility() {
  if (tagsInput.value.trim()) {
    clearTagsBtn.classList.remove('hidden');
  } else {
    clearTagsBtn.classList.add('hidden');
  }
}

// Debounced tag saving function with shimmer delay
async function debouncedSaveTags() {
  if (!lastSavedNoteId) {
    logger.debug('No saved note ID - skipping tag save');
    return;
  }
  
  // Check if user was typing recently (within last 1 second)
  const timeSinceLastTyping = Date.now() - lastTypingTime;
  if (timeSinceLastTyping < 1000) {
    logger.debug('User was typing recently, extending debounce');
    // Restart the debounce timer
    setTimeout(() => debouncedSaveTags(), 1000 - timeSinceLastTyping);
    return;
  }
  
  // Clear existing timeouts
  if (saveTagsTimeout) {
    clearTimeout(saveTagsTimeout);
  }
  if (shimmerTimeout) {
    clearTimeout(shimmerTimeout);
  }
  
  // Remove any existing saving state first
  const pills = tagsPills.querySelectorAll('.tag-pill');
  pills.forEach(pill => pill.classList.remove('saving'));
  
  // Debounce the save operation - wait for user to stop typing
  saveTagsTimeout = setTimeout(async () => {
    // Start shimmer effect after a short delay to make it feel faster
    shimmerTimeout = setTimeout(() => {
      const currentPills = tagsPills.querySelectorAll('.tag-pill');
      currentPills.forEach(pill => pill.classList.add('saving'));
    }, 200); // 200ms delay before showing shimmer
    
    try {
      const tags = currentTags.map(tag => tag.startsWith('#') ? tag.slice(1) : tag);
      
      const response = await chromeApi.runtime.sendMessage({
        action: 'updateTags',
        noteId: lastSavedNoteId,
        tags: tags
      });
      
      // Clear shimmer timeout since we're done
      if (shimmerTimeout) {
        clearTimeout(shimmerTimeout);
      }
      
      // Remove saving state
      const currentPills = tagsPills.querySelectorAll('.tag-pill');
      currentPills.forEach(pill => pill.classList.remove('saving'));
      
      if (response.success) {
        // Show brief "Tags Saved!" message
        showBriefTagsStatus('Tags Saved!');
      } else {
        logger.error('Failed to save tags:', { error: response.error });
        showBriefTagsStatus('Failed to save tags', 'error');
      }
    } catch (error) {
      logger.error('Tag save error:', { error: error.message, lastSavedNoteId, tagsCount: currentTags.length });
      showBriefTagsStatus('Failed to save tags', 'error');
      
      // Always clear shimmer timeout and remove saving state on error
      if (shimmerTimeout) {
        clearTimeout(shimmerTimeout);
        shimmerTimeout = null;
      }
      const currentPills = tagsPills.querySelectorAll('.tag-pill');
      currentPills.forEach(pill => pill.classList.remove('saving'));
    } finally {
      // Ensure shimmer timeout is always cleared
      if (shimmerTimeout) {
        clearTimeout(shimmerTimeout);
        shimmerTimeout = null;
      }
    }
  }, 1000); // 1000ms debounce - wait for user to stop typing
}

// Show brief status message in the saved-text area
function showBriefTagsStatus(message, type = 'success') {
  const savedText = document.querySelector('.saved-text');
  const checkIcon = document.querySelector('.check-icon');
  if (!savedText) return;
  
  const originalText = savedText.textContent;
  const originalCheckIcon = checkIcon ? checkIcon.style.display : 'none';
  
  // Show checkmark for success, hide for error
  if (checkIcon) {
    if (type === 'success') {
      checkIcon.style.display = 'inline';
      checkIcon.textContent = '✓';
    } else {
      checkIcon.style.display = 'none';
    }
  }
  
  savedText.textContent = message;
  
  if (type === 'error') {
    savedText.style.color = '#d32f2f';
  } else {
    savedText.style.color = '#019AB0';
  }
  
  // Restore original text and checkmark after 2 seconds
  setTimeout(() => {
    savedText.textContent = originalText;
    savedText.style.color = '';
    if (checkIcon) {
      checkIcon.style.display = originalCheckIcon;
    }
  }, 2000);
}

// Specific remove functions for each section
function removeCurrentTag(tag) {
  removeTag(currentTags, tagsPills, tag, removeCurrentTag);
  updateClearButtonVisibility();
  debouncedSaveTags(); // Auto-save when tag is removed
}

// Helper function to trigger save when tags change programmatically
function saveTagsIfChanged() {
  debouncedSaveTags();
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  
  return date.toLocaleDateString();
}

// Parse Pocket export CSV
function parsePocketCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  chrome.runtime.sendMessage({
    action: 'logCsvHeaders',
    headers: headers
  });
  
  const articles = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line);
    if (values.length < headers.length) continue;
    
    const article = {};
    headers.forEach((header, index) => {
      article[header] = values[index] || '';
    });
    
    let title = article.title && article.title.trim() && article.title !== article.url 
      ? article.title.trim() 
      : null;
    
    if (!title) {
      try {
        const url = new URL(article.url);
        const domain = url.hostname.replace(/^www\./, '');
        const pathname = url.pathname;
        
        if (pathname && pathname !== '/') {
          const pathParts = pathname.split('/').filter(p => p.length > 0);
          const lastPart = pathParts[pathParts.length - 1];
          
          if (lastPart) {
            title = lastPart
              .replace(/[-_]/g, ' ')
              .replace(/\.(html?|php|aspx?)$/, '')
              .replace(/^\d+[-_]/, '')
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ')
              .substring(0, 60);
          }
        }
        
        if (!title || title.length < 3) {
          title = domain;
        }
      } catch (e) {
        title = 'Saved Article';
      }
    }
    
    const processedArticle = {
      url: article.url || '',
      title: title,
      addedAt: article.time_added ? new Date(parseInt(article.time_added) * 1000) : new Date(),
      tags: article.tags ? article.tags.split(',').filter(t => t.trim()) : []
    };
    
    articles.push(processedArticle);
  }
  
  logger.info('parsePocketCSV completed', { articleCount: articles.length });
  return articles;
}

// Parse CSV line handling quoted values
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
}

// Extract ZIP file and parse CSV
async function extractZipAndParse(zipFile) {
  const zip = await window.JSZip.loadAsync(zipFile);
  
  logger.info('ZIP files found:', { files: Object.keys(zip.files) });
  
  let csvFile = zip.file('part_000000.csv');
  if (!csvFile) {
    csvFile = zip.file('pocket/part_000000.csv');
  }
  
  if (!csvFile) {
    throw new Error('Could not find part_000000.csv in ZIP file');
  }
  
  logger.info('Found CSV file, extracting content');
  const csvContent = await csvFile.async('string');
  logger.info('CSV content length:', { length: csvContent.length });
  
  return parsePocketCSV(csvContent);
}

// Handle Pocket import from a single file input
async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!isAuthenticated) {
    showImmediateImportStatus('Please login first to import articles.', 'error');
    return;
  }

  showImmediateImportStatus(`Processing ${file.name}...`, 'info');

  try {
    let articles;
    if (file.name.endsWith('.zip')) {
      articles = await extractZipAndParse(file);
    } else if (file.name.endsWith('.csv')) {
      const csvContent = await file.text();
      articles = parsePocketCSV(csvContent);
    } else {
      throw new Error('Invalid file type. Please select a .zip or .csv file.');
    }
    
    chrome.runtime.sendMessage({
      action: 'importPocket',
      articles: articles
    });

  } catch (error) {
    logger.error('File import failed', { error: error.message, fileName: file.name });
    showImmediateImportStatus(error.message || 'Failed to process the import file.', 'error');
  } finally {
    event.target.value = '';
  }
}

function showImmediateImportStatus(message, type) {
  if (!importStatus) {
    logger.error('Import status element not found. Fallback to alert.');
    alert(`Import Status: ${message}`);
    return;
  }

  importStatus.textContent = message;
  importStatus.className = 'import-progress';
  importStatus.classList.add(type);
  importStatus.classList.remove('hidden');

  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      importStatus.classList.add('hidden');
    }, 5000);
  }
}

async function checkImportStatus() {
  const data = await storageService.get('pocketImportStatus');
  if (data && data.pocketImportStatus) {
    updateImportStatus(data.pocketImportStatus);
    
    if (data.pocketImportStatus.status === 'running') {
      showStatus(`Import in progress: ${data.pocketImportStatus.imported}/${data.pocketImportStatus.total}`, 'info');
    }
  }
}

function updateImportStatus(status) {
  if (!importStatus) {
    logger.error('Import status element not found.');
    return;
  }
  if (!status) {
    importStatus.classList.add('hidden');
    return;
  }

  let message = '';
  let type = 'info';

  switch (status.status) {
    case 'running':
      message = `Importing... (${status.imported}/${status.total})`;
      break;
    case 'complete':
      message = `Import complete! Imported: ${status.imported}, Failed: ${status.failed}.`;
      type = 'success';
      loadRecentSaves();
      setTimeout(() => {
        chrome.storage.local.remove('pocketImportStatus');
        importStatus.classList.add('hidden');
      }, 5000);
      break;
    case 'error':
      message = `Import failed: ${status.error}`;
      type = 'error';
      break;
  }

  importStatus.textContent = message;
  importStatus.className = 'import-progress';
  importStatus.classList.add(type);
  importStatus.classList.remove('hidden');
}

function showConfirmation(message, onConfirm) {
  confirmMessage.textContent = message;
  pendingAction = onConfirm;
  confirmModal.classList.remove('hidden');
}

async function loadAvailableHashtags() {
  try {
    const response = await chromeApi.runtime.sendMessage({ action: 'getAllHashtags' });
    if (response.success) {
      availableHashtags = response.hashtags || [];
      logger.info('Loaded hashtags for autocomplete', { count: availableHashtags.length });
    } else {
      logger.error('Failed to load hashtags', { error: response.error });
      availableHashtags = [];
    }
  } catch (error) {
    logger.error('Error loading hashtags', { error: error.message });
    availableHashtags = [];
  }
}

function showAutocomplete(input, dropdown, query) {
  const currentWord = getCurrentWord(input);
  if (!currentWord || currentWord.length < 1) {
    hideAutocomplete(dropdown);
    return;
  }
  
  const matches = availableHashtags.filter(hashtag => 
    hashtag.toLowerCase().includes(currentWord.toLowerCase())
  );
  
  if (matches.length === 0) {
    hideAutocomplete(dropdown);
    return;
  }
  
  dropdown.innerHTML = matches.map(hashtag => 
    `<div class="autocomplete-item" data-hashtag="${escapeHtml(hashtag)}">${escapeHtml(hashtag)}</div>`
  ).join('');
  
  dropdown.classList.remove('hidden');
  currentFocus = -1;
}

function hideAutocomplete(dropdown) {
  dropdown.classList.add('hidden');
  currentFocus = -1;
}

function getCurrentWord(input) {
  const value = input.value;
  const cursorPos = input.selectionStart;
  const beforeCursor = value.substring(0, cursorPos);
  const words = beforeCursor.split(/\s+/);
  return words[words.length - 1];
}

function replaceCurrentWord(input, selectedHashtag) {
  const value = input.value;
  const cursorPos = input.selectionStart;
  const beforeCursor = value.substring(0, cursorPos);
  const afterCursor = value.substring(cursorPos);
  
  const words = beforeCursor.split(/\s+/);
  words[words.length - 1] = selectedHashtag;
  
  const newBeforeCursor = words.join(' ');
  const newValue = newBeforeCursor + ' ' + afterCursor.trimStart();
  
  input.value = newValue;
  
  const newCursorPos = newBeforeCursor.length + 1;
  input.setSelectionRange(newCursorPos, newCursorPos);
}

function handleAutocompleteKeydown(e, input, dropdown) {
  const items = dropdown.querySelectorAll('.autocomplete-item');
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    currentFocus = currentFocus < items.length - 1 ? currentFocus + 1 : 0;
    setActiveItem(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    currentFocus = currentFocus > 0 ? currentFocus - 1 : items.length - 1;
    setActiveItem(items);
  } else if (e.key === 'Enter' && currentFocus >= 0) {
    e.preventDefault();
    const selectedHashtag = items[currentFocus].dataset.hashtag;
    replaceCurrentWord(input, selectedHashtag);
    hideAutocomplete(dropdown);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideAutocomplete(dropdown);
  }
}

function setActiveItem(items) {
  items.forEach((item, index) => {
    item.classList.toggle('highlighted', index === currentFocus);
  });
};

// 80/20 URL normalisation for matching (scheme-insensitive, strip www., trim trailing slash, ignore query/hash)
function normalizeUrl(rawUrl) {
  try {
    const urlObj = new URL(rawUrl);
    let host = urlObj.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    let path = urlObj.pathname.replace(/\/$/, ''); // remove trailing slash
    // Special case: if path is empty string, keep as '/', so two root URLs match
    if (path === '') path = '/';
    return host + path;
  } catch {
    // Fallback to raw string if parsing fails
    return rawUrl;
  }
}
