// Popup script for IdeaPocket
import CONFIG from './config.js';
import storageService from './storage-service.js';
import chromeApi from './chrome-api.js';
import logger from './logger.js';
import Fuse from './fuse.mjs';

// DOM Elements
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const importView = document.getElementById('importView');
const quickSaveBtn = document.getElementById('quickSaveBtn');
const thoughtstreamBtn = document.getElementById('thoughtstreamBtn');
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
let currentTags = [];
let preSaveTags = []; // Array of tags for pre-save section
let postSaveTags = []; // Array of tags for post-save section
let isAuthenticated = false;
let lastSavedNoteId = null;
let allSavedArticles = [];
let pendingAction = null;
let fuse = null; // Fuse.js instance

// Autocomplete state
let availableHashtags = [];
let currentFocus = -1; // Track which autocomplete item is highlighted

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  logger.info('Popup loaded', { fuseAvailable: typeof Fuse !== 'undefined' });
  
  // Display version from manifest
  const manifest = chrome.runtime.getManifest();
  const versionElement = document.getElementById('app-version');
  if (versionElement) {
    versionElement.textContent = `IdeaPocket v${manifest.version}`;
  }
  
  // Check authentication status
  await checkAuthStatus();
  
  // Load recent saves
  loadRecentSaves();
  
  // Load available hashtags for autocomplete
  await loadAvailableHashtags();
  
  // Update save button tooltip with current shortcut
  await updateSaveButtonTooltip();
  
  // Set up event listeners
  setupEventListeners();

  // Check for and display ongoing import status
  checkImportStatus();
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
      showStatus('Please login to get started', 'success');
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
  
  // For single character queries, use basic search to avoid Fuse.js minMatchCharLength limit
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
  
  // Sort articles by recency (newest first) before display
  const sortedArticles = [...articles].sort((a, b) => {
    // Primary: savedAt timestamp (newest first)
    if (a.savedAt && b.savedAt) {
      return new Date(b.savedAt) - new Date(a.savedAt);
    }
    // Secondary: position (handle negative values - more negative = newer)
    if (a.position && b.position) {
      return Number(b.position) - Number(a.position);
    }
    // Tertiary: fallback to original order
    return 0;
  });
  
  const searchQuery = searchInput?.value || '';
  const filtered = searchQuery ? searchArticles(searchQuery) : sortedArticles;
  
  if (filtered.length === 0) {
    // Show different message based on whether we have saved articles or not
    const message = allSavedArticles.length > 0 
      ? 'No results in recently saved' 
      : 'No saved articles yet';
    recentList.innerHTML = `<div class="loading">${message}</div>`;
    return;
  }
  
  recentList.innerHTML = filtered.map(article => {
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
    
    // Add type indicator
    const typeIndicator = article.isHighlight 
      ? '<span class="highlight-indicator" title="Text selection">📌</span>' 
      : '<span class="article-indicator" title="Article">📄</span>';
    
    // Show selected text for highlights, domain for articles
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
          <span class="tooltip-text">Open in My Thoughtstream</span>
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
    if (e.target.closest('.delete-btn')) {
      e.stopPropagation();
      e.preventDefault();
      
      const btn = e.target.closest('.delete-btn');
      const noteId = btn.dataset.noteId;
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
      const inputText = preSaveTagsInput.value.trim();
      if (inputText) {
        // Add any remaining text as a tag
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
  
  // Autocomplete for pre-save tags input
  preSaveTagsInput.addEventListener('input', (e) => {
    const value = e.target.value;
    
    // Check for separators and create pills immediately
    if (value.includes(' ') || value.includes(',') || value.includes(';')) {
      const parts = value.split(/[\s,;]+/);
      const completedTags = parts.slice(0, -1).filter(tag => tag.trim().length > 0);
      const remainingText = parts[parts.length - 1] || '';
      
      // Add completed tags as pills
      completedTags.forEach(tag => {
        const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
        if (!preSaveTags.includes(normalizedTag)) {
          preSaveTags.push(normalizedTag);
        }
      });
      
      // Update pills display and clear input to remaining text
      renderTagPills(preSaveTagsPills, preSaveTags, removePreSaveTag);
      preSaveTagsInput.value = remainingText;
    }
    
    showAutocomplete(preSaveTagsInput, preSaveTagsDropdown, preSaveTagsInput.value);
    
    // Show/hide clear button
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
  
  // Click handling for pre-save tags autocomplete
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
  
  // Thoughtstream button
  thoughtstreamBtn.addEventListener('click', async () => {
    const thoughtstreamUrl = 'https://ideaflow.app';
    await chrome.tabs.create({ url: thoughtstreamUrl, active: true });
    window.close(); // Close the popup after opening
  });
  
  // Import button - show import view
  importBtn.addEventListener('click', () => {
    showView('import');
  });
  
  // Settings navigation
  settingsBtn.addEventListener('click', () => showView('settings'));
  backBtn.addEventListener('click', () => showView('main'));
  
  // Import view navigation
  importBackBtn.addEventListener('click', () => showView('main'));
  
  // Import button - trigger file picker
  importFileBtn.addEventListener('click', () => {
    importFileInput.click();
  });
  
  // Auth button
  authBtn.addEventListener('click', handleAuth);
  
  // Open saved note button
  const openSavedNoteBtn = document.getElementById('openSavedNoteBtn');
  openSavedNoteBtn.addEventListener('click', () => {
    if (lastSavedNoteId) {
      const thoughtstreamUrl = `https://ideaflow.app/?noteIdList=%5B%22${lastSavedNoteId}%22%5D`;
      chrome.tabs.create({ url: thoughtstreamUrl });
    }
  });
  
  // Close post-save button - reload popup to reset state
  const closePostSaveBtn = document.getElementById('closePostSaveBtn');
  closePostSaveBtn.addEventListener('click', () => {
    // Simple reload to reset the popup to initial state
    location.reload();
  });
  
  // Add tags button
  addTagsBtn.addEventListener('click', async () => {
    // First, handle any unpilled text in the input
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
    
    // Convert pills tags to array (remove # prefix for backend)
    const tags = postSaveTags.map(tag => tag.startsWith('#') ? tag.slice(1) : tag);
    
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
      const inputText = tagsInput.value.trim();
      if (inputText) {
        // Add any remaining text as a tag
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
  
  // Autocomplete for post-save tags input
  tagsInput.addEventListener('input', (e) => {
    const value = e.target.value;
    
    // Check for separators and create pills immediately
    if (value.includes(' ') || value.includes(',') || value.includes(';')) {
      const parts = value.split(/[\s,;]+/);
      const completedTags = parts.slice(0, -1).filter(tag => tag.trim().length > 0);
      const remainingText = parts[parts.length - 1] || '';
      
      // Add completed tags as pills
      completedTags.forEach(tag => {
        const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
        if (!postSaveTags.includes(normalizedTag)) {
          postSaveTags.push(normalizedTag);
        }
      });
      
      // Update pills display and clear input to remaining text
      renderTagPills(tagsPills, postSaveTags, removePostSaveTag);
      tagsInput.value = remainingText;
    }
    
    showAutocomplete(tagsInput, tagsDropdown, tagsInput.value);
    
    // Show/hide clear button
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
  
  // Click handling for post-save tags autocomplete
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
  
  // Authentication is handled via OAuth login
  
  // Search input with debouncing for better performance
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value;
    
    // Show/hide clear button based on input
    if (query.trim()) {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }
    
    searchTimeout = setTimeout(() => {
      const filtered = searchArticles(query);
      displayRecentSaves(filtered);
    }, 150); // 150ms debounce
  });
  
  // Clear search button
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    displayRecentSaves(allSavedArticles);
    searchInput.focus();
  });
  
  // Clear pre-save tags button
  clearPreSaveTagsBtn.addEventListener('click', () => {
    preSaveTagsInput.value = '';
    clearPreSaveTagsBtn.classList.add('hidden');
    preSaveTags.length = 0;
    renderTagPills(preSaveTagsPills, preSaveTags, removePreSaveTag);
    preSaveTagsInput.focus();
  });
  
  // Clear post-save tags button
  clearTagsBtn.addEventListener('click', () => {
    tagsInput.value = '';
    clearTagsBtn.classList.add('hidden');
    postSaveTags.length = 0;
    renderTagPills(tagsPills, postSaveTags, removePostSaveTag);
    tagsInput.focus();
  });
  
  // Import from settings button - show import view
  importSettingsBtn.addEventListener('click', () => {
    showView('import');
  });
  importFileInput.addEventListener('change', handleFileImport);

  // Listen for storage changes to update import status in real-time
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.pocketImportStatus) {
      const newStatus = changes.pocketImportStatus.newValue;
      updateImportStatus(newStatus);
    }
  });
  
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

  // Change shortcut button
  changeShortcutBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
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
  
  // Global click handler to close autocomplete dropdowns
  document.addEventListener('click', (e) => {
    // Close pre-save tags dropdown if clicking outside
    if (!preSaveTagsInput.contains(e.target) && !preSaveTagsDropdown.contains(e.target)) {
      hideAutocomplete(preSaveTagsDropdown);
    }
    
    // Close post-save tags dropdown if clicking outside
    if (!tagsInput.contains(e.target) && !tagsDropdown.contains(e.target)) {
      hideAutocomplete(tagsDropdown);
    }
  });
}

// Handle quick save
async function handleQuickSave() {
  if (!isAuthenticated) {
    showStatus('Please login first', 'success');
    showView('settings');
    return;
  }
  
  // Disable button and show loading state
  quickSaveBtn.disabled = true;
  quickSaveBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Saving...</span>';
  
  try {
    // First, handle any unpilled text in the input
    const unpilledText = preSaveTagsInput.value.trim();
    if (unpilledText) {
      const normalizedTag = unpilledText.startsWith('#') ? unpilledText : `#${unpilledText}`;
      if (!preSaveTags.includes(normalizedTag)) {
        preSaveTags.push(normalizedTag);
        renderTagPills(preSaveTagsPills, preSaveTags, removePreSaveTag);
      }
      preSaveTagsInput.value = '';
    }
    
    // Get tags from pills (remove # prefix for backend)
    const tagsArray = preSaveTags.map(tag => tag.startsWith('#') ? tag.slice(1) : tag);
    
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
      
      // Clear pre-save tags input and pills
      preSaveTagsInput.value = '';
      preSaveTags.length = 0; // Clear the array
      renderTagPills(preSaveTagsPills, preSaveTags, removePreSaveTag);
      
      // Clear post-save tags input and pills for fresh start
      tagsInput.value = '';
      postSaveTags.length = 0; // Clear the array
      renderTagPills(tagsPills, postSaveTags, removePostSaveTag);
      
      // Hide save button and pre-save section, show post-save options
      quickSaveBtn.classList.add('hidden');
      document.querySelector('.pre-save-tags').classList.add('hidden');
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
  // Hide all views first
  mainView.classList.add('hidden');
  settingsView.classList.add('hidden');
  importView.classList.add('hidden');
  
  if (view === 'settings') {
    settingsView.classList.remove('hidden');
    updateShortcutDisplay();
  } else if (view === 'import') {
    importView.classList.remove('hidden');
  } else {
    // Default to main view
    mainView.classList.remove('hidden');
    
    // Reset main view UI
    quickSaveBtn.classList.remove('hidden');
    quickSaveBtn.disabled = false;
    quickSaveBtn.innerHTML = '<span class="btn-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></span><span class="btn-text">Save to Thoughtstream</span>';
    postSaveOptions.classList.add('hidden');
    preSaveTagsInput.value = '';
    tagsInput.value = '';
    
    // Clear tag pills
    preSaveTags.length = 0;
    postSaveTags.length = 0;
    renderTagPills(preSaveTagsPills, preSaveTags, removePreSaveTag);
    renderTagPills(tagsPills, postSaveTags, removePostSaveTag);
    
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

// Update shortcut display
async function updateShortcutDisplay() {
  const shortcutSpan = document.getElementById('currentShortcut');
  if (!shortcutSpan) return;

  const isMac = /Mac|iMac|iPhone|iPod|iPad/i.test(navigator.platform);

  const keyTranslations = {
    mac: {
      '⌘': 'Command',
      '⇧': 'Shift',
      '⌃': 'Control',
      '⌥': 'Option',
      'Command': 'Command',
      'Shift': 'Shift',
      'Ctrl': 'Control',
      'Alt': 'Option',
      'MacCtrl': 'Control',
    },
    other: {
      'Ctrl': 'Ctrl',
      'Alt': 'Alt',
      'Shift': 'Shift',
      'Command': 'Command', // For completeness
    }
  };

  const currentTranslations = isMac ? keyTranslations.mac : keyTranslations.other;

  try {
    const commands = await chrome.commands.getAll();
    const command = commands.find(cmd => cmd.name === '_execute_action');
    if (command && command.shortcut) {
      const shortcut = command.shortcut;
      // Regex to split by modifiers and the final key. Handles concatenated symbols on Mac.
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

  const isMac = /Mac|iMac|iPhone|iPod|iPad/i.test(navigator.platform);

  try {
    const commands = await chrome.commands.getAll();
    const command = commands.find(cmd => cmd.name === '_execute_action');
    if (command && command.shortcut) {
      const shortcut = command.shortcut;
      // For tooltip, show a cleaner version - just the shortcut without translation
      tooltipSpan.textContent = `Shortcut: ${shortcut}`;
    } else {
      tooltipSpan.textContent = 'No shortcut set';
    }
  } catch (error) {
    logger.error('Failed to get commands for tooltip:', { error: error.message });
    tooltipSpan.textContent = 'Save to Thoughtstream';
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
  // Split on space, comma, semicolon and filter empty strings
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
  
  // Send headers to background for logging
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
    
    // Convert to our format with smart title fallbacks
    let title = article.title && article.title.trim() && article.title !== article.url 
      ? article.title.trim() 
      : null;
    
    // If no title, extract from URL
    if (!title) {
      try {
        const url = new URL(article.url);
        const domain = url.hostname.replace(/^www\./, '');
        const pathname = url.pathname;
        
        // Try to extract meaningful part from path
        if (pathname && pathname !== '/') {
          const pathParts = pathname.split('/').filter(p => p.length > 0);
          const lastPart = pathParts[pathParts.length - 1];
          
          // Clean up the last part of the path
          if (lastPart) {
            title = lastPart
              .replace(/[-_]/g, ' ')  // Replace dashes/underscores with spaces
              .replace(/\.(html?|php|aspx?)$/, '')  // Remove file extensions
              .replace(/^\d+[-_]/, '')  // Remove leading numbers with separators
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))  // Title case
              .join(' ')
              .substring(0, 60);  // Limit length
          }
        }
        
        // Final fallback to domain name
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
  
  // Debug: List all files in ZIP
  logger.info('ZIP files found:', { files: Object.keys(zip.files) });
  
  // Look for part_000000.csv (could be in root or in pocket/ folder)
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
    
    // This just kicks off the process. The UI will update via storage events.
    chrome.runtime.sendMessage({
      action: 'importPocket',
      articles: articles
    });

  } catch (error) {
    logger.error('File import failed', { error: error.message, fileName: file.name });
    showImmediateImportStatus(error.message || 'Failed to process the import file.', 'error');
  } finally {
    // Reset file input to allow re-selection of the same file
    event.target.value = '';
  }
}

// This function is no longer needed as the background script handles the import process
// and the UI is updated via storage events.

// Show an immediate import status message in the UI
function showImmediateImportStatus(message, type) {
  if (!importStatus) {
    logger.error('Import status element not found. Fallback to alert.');
    alert(`Import Status: ${message}`);
    return;
  }

  importStatus.textContent = message;
  importStatus.className = 'import-progress'; // Reset classes
  importStatus.classList.add(type);
  importStatus.classList.remove('hidden');

  // Automatically hide the message after a delay for success/error
  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      importStatus.classList.add('hidden');
    }, 5000);
  }
}

// Check and display the current import status from storage
async function checkImportStatus() {
  const data = await storageService.get('pocketImportStatus');
  if (data && data.pocketImportStatus) {
    updateImportStatus(data.pocketImportStatus);
  }
}

// Update the import status UI based on the data from storage
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
      loadRecentSaves(); // Refresh the list
      // Clear the status from storage after a delay
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
  importStatus.className = 'import-progress'; // Reset classes
  importStatus.classList.add(type);
  importStatus.classList.remove('hidden');
}

function showConfirmation(message, onConfirm) {
  confirmMessage.textContent = message;
  pendingAction = onConfirm;
  confirmModal.classList.remove('hidden');
}

// Load available hashtags for autocomplete
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

// Show autocomplete dropdown
function showAutocomplete(input, dropdown, query) {
  const currentWord = getCurrentWord(input);
  if (!currentWord || currentWord.length < 1) {
    hideAutocomplete(dropdown);
    return;
  }
  
  // Filter hashtags that match the current word (case insensitive)
  const matches = availableHashtags.filter(hashtag => 
    hashtag.toLowerCase().includes(currentWord.toLowerCase())
  );
  
  if (matches.length === 0) {
    hideAutocomplete(dropdown);
    return;
  }
  
  // Populate dropdown
  dropdown.innerHTML = matches.map(hashtag => 
    `<div class="autocomplete-item" data-hashtag="${escapeHtml(hashtag)}">${escapeHtml(hashtag)}</div>`
  ).join('');
  
  dropdown.classList.remove('hidden');
  currentFocus = -1; // Reset focus
}

// Hide autocomplete dropdown
function hideAutocomplete(dropdown) {
  dropdown.classList.add('hidden');
  currentFocus = -1;
}

// Get the current word being typed (for space-separated tags)
function getCurrentWord(input) {
  const value = input.value;
  const cursorPos = input.selectionStart;
  const beforeCursor = value.substring(0, cursorPos);
  const words = beforeCursor.split(/\s+/);
  return words[words.length - 1];
}

// Replace the current word with selected hashtag
function replaceCurrentWord(input, selectedHashtag) {
  const value = input.value;
  const cursorPos = input.selectionStart;
  const beforeCursor = value.substring(0, cursorPos);
  const afterCursor = value.substring(cursorPos);
  
  // Split before cursor by spaces and replace the last word
  const words = beforeCursor.split(/\s+/);
  words[words.length - 1] = selectedHashtag;
  
  // Reconstruct the value
  const newBeforeCursor = words.join(' ');
  const newValue = newBeforeCursor + ' ' + afterCursor.trimStart();
  
  input.value = newValue;
  
  // Set cursor position after the inserted hashtag
  const newCursorPos = newBeforeCursor.length + 1;
  input.setSelectionRange(newCursorPos, newCursorPos);
}

// Handle keyboard navigation in autocomplete
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

// Set active autocomplete item
function setActiveItem(items) {
  items.forEach((item, index) => {
    item.classList.toggle('highlighted', index === currentFocus);
  });
}
