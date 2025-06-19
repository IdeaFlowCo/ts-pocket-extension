// Background script for TsPocket Chrome Extension
console.log('🚀 [BACKGROUND] Service worker starting...');

// Global error handler to prevent service worker crashes
self.addEventListener('error', (event) => {
  console.error('❌ [BACKGROUND] Global error:', event.error);
  event.preventDefault();
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('❌ [BACKGROUND] Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

import { loginWithAuth0, logout, isLoggedIn } from './auth.js';
import CONFIG from './config.js';
import apiClient, { TsPocketError, AuthError, NetworkError, ContentExtractionError } from './api-client.js';
import storageService from './storage-service.js';
import chromeApi from './chrome-api.js';
import offlineQueue from './offline-queue.js';

// Track initialization state
let isInitialized = false;
let initializationPromise = null;

// Production-safe logging
const IS_DEV = !('update_url' in chrome.runtime.getManifest());

const debugLog = async (message, data = {}) => {
  // Always log to console in dev
  if (IS_DEV) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`, data);
  }
  
  // Only store debug logs if explicitly enabled or in dev mode
  const { debugMode } = await storageService.get('debugMode');
  if (!IS_DEV && !debugMode) return;
  
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, message, data };
  
  // Store last 50 debug logs
  try {
    const { debugLogs = [] } = await storageService.get('debugLogs');
    debugLogs.push(logEntry);
    if (debugLogs.length > 50) {
      debugLogs.splice(0, debugLogs.length - 50);
    }
    await storageService.set({ debugLogs });
  } catch (e) {
    console.error('Failed to store debug log:', e);
  }
};

// Log immediately when script loads
debugLog('Background script loaded');

// Keep service worker alive (helps with debugging)
const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20e3);
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();

// Initialize extension on startup and install
chromeApi.runtime.onStartup.addListener(() => {
  debugLog('Extension startup event');
  ensureInitialized();
});

chromeApi.runtime.onInstalled.addListener((details) => {
  debugLog('Extension installed/updated', { reason: details.reason });
  ensureInitialized();
});

// Also initialize immediately
debugLog('Initializing extension...');
ensureInitialized();

// Ensure initialization happens only once
function ensureInitialized() {
  if (!initializationPromise) {
    initializationPromise = initializeExtension();
  }
  return initializationPromise;
}

async function initializeExtension() {
  if (isInitialized) {
    console.log('Extension already initialized');
    return;
  }
  
  try {
    console.log('Initializing TsPocket extension...');
    
    // Create context menu (remove existing first to avoid duplicates)
    try {
      await chromeApi.contextMenus.removeAll();
      await chromeApi.contextMenus.create({
        id: 'saveToTsPocket',
        title: 'Save to TsPocket',
        contexts: ['page', 'selection', 'link']
      });
      console.log('Context menu created');
    } catch (error) {
      console.error('Failed to create context menu:', error);
    }
    
    // Verify storage is accessible
    try {
      const test = await storageService.get('test');
      console.log('Storage service is operational');
    } catch (error) {
      console.error('Storage service check failed:', error);
    }
    
    // Check authentication status
    const isAuthenticated = await isLoggedIn();
    console.log('Authentication status:', isAuthenticated);
    
    // Check for queued offline saves
    const queueStatus = await offlineQueue.getQueueStatus();
    if (queueStatus.count > 0) {
      await debugLog('Found offline queue items', { count: queueStatus.count });
      // Start processing queue
      offlineQueue.processQueue();
    }
    
    isInitialized = true;
    console.log('TsPocket extension initialized successfully');
  } catch (error) {
    console.error('Extension initialization failed:', error);
    isInitialized = false;
    initializationPromise = null; // Allow retry
    throw error;
  }
}

// Helper function to generate UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}



// Extract article content from page
async function extractArticleContent(tab) {
  try {
    // First try to send message to existing content script
    const response = await chromeApi.tabs.sendMessage(tab.id, { action: 'extractContent' });
    
    if (response && response.success) {
      return response.content;
    } else {
      throw new ContentExtractionError(
        'Content extraction returned unsuccessful response',
        { url: tab.url, response }
      );
    }
  } catch (error) {
    // If content script isn't loaded, inject it
    if (error.message?.includes('Could not establish connection')) {
      try {
        await chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        
        // Try again after injection
        const response = await chromeApi.tabs.sendMessage(tab.id, { action: 'extractContent' });
        
        if (response && response.success) {
          return response.content;
        } else {
          throw new ContentExtractionError(
            'Content extraction failed after script injection',
            { url: tab.url, response }
          );
        }
      } catch (injectError) {
        console.error('Failed to inject content script:', injectError);
        throw new ContentExtractionError(
          'Failed to inject content extraction script',
          { url: tab.url, error: injectError.message }
        );
      }
    }
    
    console.error('Failed to extract content:', error);
    
    // TODO: Firecrawl API integration for enhanced extraction
    // Check if Firecrawl is configured
    if (CONFIG.firecrawl.apiKey) {
      console.log('Firecrawl API key configured but integration not implemented yet');
    }
    
    // Re-throw as ContentExtractionError with context
    if (error instanceof ContentExtractionError) {
      throw error;
    }
    
    throw new ContentExtractionError(
      'Unable to extract article content',
      { url: tab.url, error: error.message }
    );
  }
}

// Save article to Thoughtstream
async function saveToThoughtstream(articleData, tags = []) {
  await debugLog('saveToThoughtstream called');
  
  try {
    const noteId = generateUUID();
    await debugLog('Generated noteId', { noteId });
    
    const timestamp = new Date().toISOString();
    await debugLog('Generated timestamp', { timestamp });
    
    // Get user ID from storage
    await debugLog('Getting user info from storage');
    let userId;
    try {
      const userInfo = await storageService.getUserInfo();
      userId = userInfo.userId;
      await debugLog('getUserInfo returned', { 
        hasUserId: !!userId, 
        hasUserInfo: !!userInfo,
        userInfoKeys: userInfo ? Object.keys(userInfo) : []
      });
    } catch (error) {
      await debugLog('getUserInfo failed', { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
    
    await debugLog('User ID from storage', { hasUserId: !!userId });
    
    if (!userId) {
      await debugLog('No userId found - throwing error');
      throw new Error('User ID not found. Please login again.');
    }
  
  // Format tags as hashtags
  const hashtagString = tags.length > 0 
    ? tags.map(tag => `#${tag.replace(/\s+/g, '-')}`).join(' ') + ' '
    : '';
  
  // Format note content with #pocket hashtag and any additional tags
  const noteContent = `#pocket ${hashtagString}

${articleData.title}

${articleData.author ? `By ${articleData.author}\n` : ''}${articleData.publishedTime ? `Published: ${new Date(articleData.publishedTime).toLocaleDateString()}\n\n` : ''}${articleData.description ? articleData.description + '\n\n' : ''}${articleData.content}

---
URL: ${articleData.url}
Domain: ${articleData.domain || new URL(articleData.url).hostname}
Saved: ${new Date(articleData.savedAt).toLocaleString()}`;

  await debugLog('Note content formatted', {
    preview: noteContent.substring(0, 100) + '...',
    fullLength: noteContent.length
  });
  
  // Create note matching the exact structure from the API
  const noteData = {
    id: noteId,
    authorId: userId,
    readAll: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    tokens: [{
      type: 'paragraph',
      tokenId: generateUUID(),
      content: [{
        type: 'text',
        marks: [],
        content: noteContent
      }],
      depth: 0
    }],
    folderId: null,
    insertedAt: new Date().toISOString().slice(0, 10).replace(/-/g, ''), // YYYYMMDD format
    position: generateUUID(), // Random position string
    isSharedPrivately: false,
    directUrlOnly: true,
    expansionSetting: 'auto'
  };
  
  // Log the note data before sending
  console.log('📝 [BACKGROUND] Note data being sent:', noteData);
  console.log('📝 [BACKGROUND] Note content preview:', noteContent.substring(0, 200) + '...');
  
  try {
    // Save to Thoughtstream
    await debugLog('Sending to API', { 
      endpoint: '/notes',
      noteId: noteId,
      contentLength: noteContent.length 
    });
    
    const response = await apiClient.post('/notes', { notes: [noteData] });
    
    await debugLog('API response received', { 
      status: response?.status,
      data: response?.data,
      error: response?.error 
    });
    
    return { noteId, response };
  } catch (apiError) {
    await debugLog('API request failed', {
      error: apiError.message,
      code: apiError.code,
      details: apiError.details
    });
    throw apiError;
  }
  
  } catch (error) {
    await debugLog('saveToThoughtstream failed with unexpected error', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    throw error;
  }
}

// Handle save action
async function handleSave(tab, tags = []) {
  await debugLog('Starting save process', { url: tab.url, tabId: tab.id });
  
  try {
    // Show saving badge
    await chromeApi.updateBadge(tab.id, '...', '#4CAF50', 0);
    
    let articleData;
    
    try {
      // Try to extract article content
      await debugLog('Attempting content extraction');
      articleData = await extractArticleContent(tab);
      await debugLog('Content extracted successfully', {
        title: articleData.title,
        contentLength: articleData.content?.length,
        hasAuthor: !!articleData.author,
        hasDescription: !!articleData.description
      });
    } catch (extractError) {
      await debugLog('Content extraction failed', { 
        error: extractError.message,
        type: extractError.name 
      });
      
      // If content extraction fails, provide fallback data with user notification
      if (extractError instanceof ContentExtractionError) {
        // Check if user wants to save anyway with basic info
        const shouldSaveBasic = await new Promise(async (resolve) => {
          const notificationId = await chromeApi.notifications.create(null, {
            type: 'basic',
            iconUrl: 'icon-48.png',
            title: 'Content Extraction Failed',
            message: 'Unable to extract full article content. Save with basic info only?',
            buttons: [{ title: 'Save Basic' }, { title: 'Cancel' }],
            requireInteraction: true
          });
          
          chromeApi.notifications.onButtonClicked.addListener(function listener(id, buttonIndex) {
            if (id === notificationId) {
              chromeApi.notifications.onButtonClicked.removeListener(listener);
              chromeApi.notifications.clear(notificationId);
              resolve(buttonIndex === 0);
            }
          });
        });
        
        if (!shouldSaveBasic) {
          throw new Error('User cancelled save after extraction failure');
        }
        
        // Use basic fallback data
        articleData = {
          title: tab.title || 'Untitled',
          url: tab.url,
          description: 'Content extraction failed - saved with basic information only',
          content: `This article was saved with limited information due to extraction failure.\n\nURL: ${tab.url}\n\nYou may want to save this article again when the page is fully loaded.`,
          author: '',
          publishedTime: '',
          images: [],
          savedAt: new Date().toISOString(),
          extractionFailed: true
        };
      } else {
        throw extractError;
      }
    }
    
    // Save to Thoughtstream with tags
    await debugLog('Calling saveToThoughtstream', { 
      hasContent: !!articleData.content,
      tagsCount: tags.length 
    });
    
    const result = await saveToThoughtstream(articleData, tags);
    
    await debugLog('Save completed', { noteId: result.noteId });
    
    // Store in local history
    const savedArticles = await storageService.getSavedArticles();
    savedArticles.unshift({
      ...articleData,
      noteId: result.noteId,
      tags: tags,
      savedAt: new Date().toISOString(),
    });
    
    // Storage service handles limiting articles
    await storageService.setSavedArticles(savedArticles);
    
    // Show success badge (with warning if extraction failed)
    if (articleData.extractionFailed) {
      await chromeApi.updateBadge(tab.id, '⚠', '#FF9800');
    } else {
      await chromeApi.updateBadge(tab.id, '✓', '#4CAF50');
    }
    
    return { 
      success: true, 
      noteId: result.noteId,
      warning: articleData.extractionFailed ? 'Saved with limited content due to extraction failure' : null
    };
  } catch (error) {
    await debugLog('Failed to save article', {
      error: error.message,
      type: error.name
    });
    
    // Handle network errors with offline queue
    if (error.name === 'NetworkError' || error.code === 'NETWORK_ERROR') {
      try {
        // Queue for retry
        const queueLength = await offlineQueue.add(articleData, tags, {
          id: generateUUID(),
          authorId: (await storageService.getUserInfo()).userId,
          ...noteData // Use the already formatted note data
        });
        
        // Show offline badge with count
        await chromeApi.updateBadge(tab.id, '📥', '#FF9800');
        
        // Notify user
        await chromeApi.notifications.create({
          type: 'basic',
          iconUrl: 'icon-48.png',
          title: 'Saved Offline',
          message: `Article will be synced when connection is restored (${queueLength} pending)`
        });
        
        return {
          success: true,
          offline: true,
          queueLength: queueLength,
          warning: 'Saved offline - will sync when connected'
        };
      } catch (queueError) {
        await debugLog('Failed to queue offline', { error: queueError.message });
        // Fall through to show error
      }
    }
    
    // Show error badge for other errors
    await chromeApi.updateBadge(tab.id, '!', '#F44336');
    
    throw error;
  }
}

// Update existing note with tags
async function updateNoteWithTags(noteId, tags) {
  if (!tags || tags.length === 0) return;
  
  // Get current note data from local storage
  const savedArticles = await storageService.getSavedArticles();
  const article = savedArticles.find(a => a.noteId === noteId);
  
  if (!article) {
    throw new Error('Note not found in local history');
  }
  
  // Format tags as hashtags
  const newHashtags = tags.map(tag => `#${tag.replace(/\s+/g, '-')}`).join(' ');
  
  // We need to update the note text to add the new tags
  // The current format has "#pocket" as the first line, we'll append new tags there
  const noteContent = `#pocket ${newHashtags}

${article.title}

${article.author ? `By ${article.author}\n` : ''}${article.publishedTime ? `Published: ${new Date(article.publishedTime).toLocaleDateString()}\n\n` : ''}${article.description ? article.description + '\n\n' : ''}${article.content}

---
URL: ${article.url}
Domain: ${article.domain || new URL(article.url).hostname}
Saved: ${new Date(article.savedAt).toLocaleString()}`;
  
  // Update the note
  const updateData = {
    id: noteId,
    text: noteContent,
    updatedAt: new Date().toISOString()
  };
  
  const response = await apiClient.post('/notes', { notes: [updateData] });
  
  // Update local history with tags
  article.tags = [...(article.tags || []), ...tags];
  await storageService.setSavedArticles(savedArticles);
  
  return response;
}

// Message handler with initialization check
chromeApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('Message received', { action: request.action, from: sender.tab?.url || 'extension' });
  
  // Ensure extension is initialized before handling messages
  ensureInitialized()
    .then(() => handleMessage(request, sender, sendResponse))
    .catch(error => {
      debugLog('Failed to initialize before handling message', { error: error.message });
      sendResponse({ success: false, error: 'Extension initialization failed' });
    });
  return true; // Always return true for async response
});

async function handleMessage(request, sender, sendResponse) {
  await debugLog('Handling message', { action: request.action });
  
  if (request.action === 'save') {
    (async () => {
      try {
        await debugLog('Save action - getting active tab');
        const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
        await debugLog('Active tab found', { url: tabs[0]?.url });
        
        const tags = request.tags || [];
        const result = await handleSave(tabs[0], tags);
        
        await debugLog('handleSave completed, sending response', { 
          success: result.success,
          hasNoteId: !!result.noteId 
        });
        sendResponse(result);
      } catch (error) {
        await debugLog('Save action failed', { 
          error: error.message,
          stack: error.stack 
        });
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Will respond asynchronously
  }
  
  if (request.action === 'updateTags') {
    (async () => {
      try {
        await updateNoteWithTags(request.noteId, request.tags);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  
  if (request.action === 'getHistory') {
    storageService.getSavedArticles().then(articles => {
      sendResponse(articles);
    });
    return true;
  }
  
  if (request.action === 'setAuth') {
    storageService.set({ 
      [CONFIG.storageKeys.authToken]: request.token,
      [CONFIG.storageKeys.userId]: request.userId 
    }).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.action === 'setUserId') {
    storageService.set({ 
      [CONFIG.storageKeys.userId]: request.userId 
    }).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.action === 'importPocket') {
    handlePocketImport(request.articles).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.action === 'login') {
    loginWithAuth0().then(result => {
      sendResponse(result);
    });
    return true;
  }
  
  if (request.action === 'logout') {
    logout().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'checkAuth') {
    isLoggedIn().then(loggedIn => {
      sendResponse({ isLoggedIn: loggedIn });
    });
    return true;
  }
}

// Context menu

chromeApi.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'saveToTsPocket') {
    handleSave(tab).catch(error => {
      console.error('Context menu save failed:', error);
    });
  }
});

// Keyboard shortcut handler
chromeApi.commands.onCommand.addListener(async (command) => {
  if (command === '_execute_action') {
    try {
      const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
      await handleSave(tabs[0]);
    } catch (error) {
      console.error('Keyboard shortcut save failed:', error);
    }
  }
});

// Handle Pocket import
async function handlePocketImport(articles) {
  let imported = 0;
  let failed = 0;
  const total = articles.length;
  
  // Process articles in batches to avoid overwhelming the API
  const batchSize = 5;
  
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    
    // Process batch in parallel
    const promises = batch.map(async (article) => {
      try {
        // Create a minimal article object for import
        const articleData = {
          title: article.title,
          url: article.url,
          description: `Imported from Pocket on ${new Date().toLocaleDateString()}`,
          content: '', // We don't have content from Pocket export
          author: '',
          publishedTime: '',
          images: [],
          savedAt: article.addedAt.toISOString(),
          domain: new URL(article.url).hostname
        };
        
        // Add pocket-import tag along with original tags
        const tags = ['pocket-import', ...article.tags];
        
        // Save to Thoughtstream
        await saveToThoughtstream(articleData, tags);
        
        // Add to local history
        await storageService.addSavedArticle({
          ...articleData,
          noteId: generateUUID(),
          tags: tags
        });
        
        imported++;
      } catch (error) {
        console.error('Failed to import article:', article.url, error);
        failed++;
      }
    });
    
    // Wait for batch to complete
    await Promise.all(promises);
    
    // Small delay between batches to respect rate limits
    if (i + batchSize < articles.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return {
    success: true,
    imported,
    failed,
    total
  };
}