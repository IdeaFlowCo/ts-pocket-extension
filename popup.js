// Popup script for IdeaPocket
import CONFIG from './config.js';
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
const preSaveTagsInput = document.getElementById('preSaveTagsInput');
const recentList = document.getElementById('recentList');
const saveStatus = document.getElementById('saveStatus');
const authStatus = document.getElementById('authStatus');
const postSaveOptions = document.getElementById('postSaveOptions');
const addTagsBtn = document.getElementById('addTagsBtn');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const clearPreSaveTagsBtn = document.getElementById('clearPreSaveTagsBtn');
const clearTagsBtn = document.getElementById('clearTagsBtn');
const preSaveTagsPills = document.getElementById('preSaveTagsPills');
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

// Autocomplete elements
const preSaveTagsDropdown = document.getElementById('preSaveTagsDropdown');
const tagsDropdown = document.getElementById('tagsDropdown');

// State
let isAuthenticated = false;
let lastSavedNoteId = null;
let allSavedArticles = [];
let pendingAction = null;
let fuse = null; // Fuse.js instance
let preSaveTags = [];
let postSaveTags = [];
let allHashtags = [];

// Autocomplete state
let availableHashtags = [];
let currentFocus = -1;

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
      ? '<span class="highlight-indicator" title="Text selection">📌</span>' 
      : '<span class="article-indicator" title="Article">📄</span>';
    
    const displayContent = article.isHighlight && article.description
      ? `<div class="recent-item-description">${escapeHtml(article.description)}</div>`
      : `<div class="recent-item-url">${escapeHtml(domain)}</div>`;
    
    return `
      <div class="recent-item ${article.isHighlight ? 'is-highlight' : ''} ${article.hasLinks ? 'has-links' : ''}" data-url="${escapeHtml(article.url)}" data-note-id="${escapeHtml(articleId)}">
        <div class="recent-item-title">${typeIndicator}${escapeHtml(article.isHighlight 
          ? (article.title && article.title.trim() && article.title !== 'Untitled' ? article.title : domain)
          : article.title)}</div>
        ${displayContent}
        ${tags}
        <div class="recent-item-time">${escapeHtml(timeAgo)}</div>
        <div class="tooltip">
          <button class="open-note-btn" data-note-id="${escapeHtml(articleId)}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </button>
          <span class="tooltip-text">Open in My Ideaflow</span>
        </div>
        <div class="tooltip">
          <button class="delete-btn" data-note-id="${escapeHtml(articleId)}">×</button>
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
  
  preSaveTagsInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const inputText = preSaveTagsInput.value.trim();
      if (inputText) {
        const normalizedTag = inputText.startsWith('#') ? inputText : `#${inputText}`;
        if (!preSaveTags.includes(normalizedTag)) {
          preSaveTags.push(normalizedTag);
          renderTagPills(preSaveTagsPills, preSaveTags, removePreSaveTag);
        }
        preSaveTagsInput.value = '';
        if (preSaveTags.length === 0) {
          clearPreSaveTagsBtn.classList.add('hidden');
        }
      }
    }
  });
  
  preSaveTagsInput.addEventListener('input', (e) => {
    const value = e.target.value;
    if (value.includes(' ') || value.includes(',') || value.includes(';')) {
      const parts = value.split(/[\s,;]+/);
      const completedTags = parts.slice(0, -1).filter(tag => tag.trim().length > 0);
      const remainingText = parts[parts.length - 1] || '';
      completedTags.forEach(tag => {
        const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
        if (!preSaveTags.includes(normalizedTag)) {
          preSaveTags.push(normalizedTag);
        }
      });
      renderTagPills(preSaveTagsPills, preSaveTags, removePreSaveTag);
      preSaveTagsInput.value = remainingText;
    }
    showAutocomplete(preSaveTagsInput, preSaveTagsDropdown, preSaveTagsInput.value);
    if (preSaveTagsInput.value.trim() || preSaveTags.length > 0) {
      clearPreSaveTagsBtn.classList.remove('hidden');
    } else {
      clearPreSaveTagsBtn.classList.add('hidden');
    }
  });
  
  preSaveTagsInput.addEventListener('keydown', (e) => {
    if (!preSaveTagsDropdown.classList.contains('hidden')) {
      handleAutocompleteKeydown(e, preSaveTagsInput, preSaveTagsDropdown);
    }
  });
  
  preSaveTagsDropdown.addEventListener('click', (e) => {
    if (e.target.classList.contains('autocomplete-item')) {
      const selectedHashtag = e.target.dataset.hashtag;
      addTag(preSaveTags, preSaveTagsPills, selectedHashtag, removePreSaveTag);
      preSaveTagsInput.value = '';
      clearPreSaveTagsBtn.classList.add('hidden');
      hideAutocomplete(preSaveTagsDropdown);
      preSaveTagsInput.focus();
    }
  });
  
  ideaflowBtn.addEventListener('click', async () => {
    const ideaflowUrl = 'https://ideaflow.app';
    await chrome.tabs.create({ url: ideaflowUrl, active: true });
    window.close();
  });
  
  importBtn.addEventListener('click', () => showView('import'));
  settingsBtn.addEventListener('click', () => showView('settings'));
  backBtn.addEventListener('click', () => showView('main'));
  importBackBtn.addEventListener('click', () => showView('main'));
  importFileBtn.addEventListener('click', () => importFileInput.click());
  authBtn.addEventListener('click', handleAuth);
  
  document.getElementById('openSavedNoteBtn').addEventListener('click', () => {
    if (lastSavedNoteId) {
      const ideaflowUrl = `https://ideaflow.app/?noteIdList=%5B%22${lastSavedNoteId}%22%5D`;
      chrome.tabs.create({ url: ideaflowUrl });
    }
  });
  
  document.getElementById('closePostSaveBtn').addEventListener('click', () => location.reload());
  
  addTagsBtn.addEventListener('click', async () => {
    const unpilledText = tagsInput.value.trim();
    if (unpilledText) {
      const normalizedTag = unpilledText.startsWith('#') ? unpilledText : `#${unpilledText}`;
      if (!postSaveTags.includes(normalizedTag)) {
        postSaveTags.push(normalizedTag);
        renderTagPills(tagsPills, postSaveTags, removePostSaveTag);
      }
      tagsInput.value = '';
    }
    if (postSaveTags.length === 0 || !lastSavedNoteId) return;
    const tags = postSaveTags.map(tag => tag.startsWith('#') ? tag.slice(1) : tag);
    addTagsBtn.disabled = true;
    addTagsBtn.textContent = 'Adding...';
    try {
      const response = await chromeApi.runtime.sendMessage({
        action: 'updateTags',
        noteId: lastSavedNoteId,
        tags: tags
      });
      if (response.success) {
        showStatus('Tags added!', 'success');
        postSaveTags = [];
        renderTagPills(tagsPills, postSaveTags, removePostSaveTag);
        if (tagsInput.value.trim() === '') {
          clearTagsBtn.classList.add('hidden');
        }
        addTagsBtn.disabled = false;
        addTagsBtn.textContent = 'Add';
      } else {
        showStatus(response.error || 'Failed to add tags', 'error');
        addTagsBtn.disabled = false;
        addTagsBtn.textContent = 'Add';
      }
    } catch (error) {
      logger.error('Failed to update tags:', { error: error.message });
      showStatus('Failed to add tags', 'error');
      addTagsBtn.disabled = false;
      addTagsBtn.textContent = 'Add';
    }
  });
  
  tagsInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const inputText = tagsInput.value.trim();
      if (inputText) {
        const normalizedTag = inputText.startsWith('#') ? inputText : `#${inputText}`;
        if (!postSaveTags.includes(normalizedTag)) {
          postSaveTags.push(normalizedTag);
          renderTagPills(tagsPills, postSaveTags, removePostSaveTag);
        }
        tagsInput.value = '';
        if (postSaveTags.length === 0) {
          clearTagsBtn.classList.add('hidden');
        }
      }
    }
  });
  
  tagsInput.addEventListener('input', (e) => {
    const value = e.target.value;
    if (value.includes(' ') || value.includes(',') || value.includes(';')) {
      const parts = value.split(/[\s,;]+/);
      const completedTags = parts.slice(0, -1).filter(tag => tag.trim().length > 0);
      const remainingText = parts[parts.length - 1] || '';
      completedTags.forEach(tag => {
        const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
        if (!postSaveTags.includes(normalizedTag)) {
          postSaveTags.push(normalizedTag);
        }
      });
      renderTagPills(tagsPills, postSaveTags, removePostSaveTag);
      tagsInput.value = remainingText;
    }
    showAutocomplete(tagsInput, tagsDropdown, tagsInput.value);
    if (tagsInput.value.trim() || postSaveTags.length > 0) {
      clearTagsBtn.classList.remove('hidden');
    } else {
      clearTagsBtn.classList.add('hidden');
    }
  });
  
  tagsInput.addEventListener('keydown', (e) => {
    if (!tagsDropdown.classList.contains('hidden')) {
      handleAutocompleteKeydown(e, tagsInput, tagsDropdown);
    }
  });
  
  tagsDropdown.addEventListener('click', (e) => {
    if (e.target.classList.contains('autocomplete-item')) {
      const selectedHashtag = e.target.dataset.hashtag;
      addTag(postSaveTags, tagsPills, selectedHashtag, removePostSaveTag);
      tagsInput.value = '';
      clearTagsBtn.classList.add('hidden');
      hideAutocomplete(tagsDropdown);
      tagsInput.focus();
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
  
  clearPreSaveTagsBtn.addEventListener('click', () => {
    preSaveTagsInput.value = '';
    clearPreSaveTagsBtn.classList.add('hidden');
    preSaveTags.length = 0;
    renderTagPills(preSaveTagsPills, preSaveTags, removePreSaveTag);
    preSaveTagsInput.focus();
  });
  
  clearTagsBtn.addEventListener('click', () => {
    tagsInput.value = '';
    clearTagsBtn.classList.add('hidden');
    postSaveTags.length = 0;
    renderTagPills(tagsPills, postSaveTags, removePostSaveTag);
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
    if (!preSaveTagsInput.contains(e.target) && !preSaveTagsDropdown.contains(e.target)) {
      hideAutocomplete(preSaveTagsDropdown);
    }
    
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
    const unpilledText = preSaveTagsInput.value.trim();
    if (unpilledText) {
      const normalizedTag = unpilledText.startsWith('#') ? unpilledText : `#${unpilledText}`;
      if (!preSaveTags.includes(normalizedTag)) {
        preSaveTags.push(normalizedTag);
        renderTagPills(preSaveTagsPills, preSaveTags, removePreSaveTag);
      }
      preSaveTagsInput.value = '';
    }
    
    const tagsArray = preSaveTags.map(tag => tag.startsWith('#') ? tag.slice(1) : tag);
    
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
      
      preSaveTagsInput.value = '';
      preSaveTags.length = 0;
      renderTagPills(preSaveTagsPills, preSaveTags, removePreSaveTag);
      
      tagsInput.value = '';
      postSaveTags.length = 0;
      renderTagPills(tagsPills, postSaveTags, removePostSaveTag);
      clearTagsBtn.classList.add('hidden');
      
      quickSaveBtn.classList.add('hidden');
      document.querySelector('.pre-save-tags').classList.add('hidden');
      postSaveOptions.classList.remove('hidden');
        
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
    preSaveTagsInput.value = '';
    tagsInput.value = '';
    
    preSaveTags.length = 0;
    postSaveTags.length = 0;
    renderTagPills(preSaveTagsPills, preSaveTags, removePreSaveTag);
    renderTagPills(tagsPills, postSaveTags, removePostSaveTag);
    
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

// Tag Pills Management
function createTagPill(tag, onRemove) {
  const pill = document.createElement('div');
  pill.className = 'tag-pill';
  pill.innerHTML = `
    <span class="tag-pill-text">${escapeHtml(tag)}</span>
    <button class="tag-pill-remove" title="Remove tag">×</button>
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

// Specific remove functions for each section
function removePreSaveTag(tag) {
  removeTag(preSaveTags, preSaveTagsPills, tag, removePreSaveTag);
}

function removePostSaveTag(tag) {
  removeTag(postSaveTags, tagsPills, tag, removePostSaveTag);
  if (postSaveTags.length === 0 && tagsInput.value.trim() === '') {
    clearTagsBtn.classList.add('hidden');
  }
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
