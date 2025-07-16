// Background script for IdeaPocket Chrome Extension
import { loginWithAuth0, logout, isLoggedIn } from './auth.js';
import CONFIG from './config.ts';
import apiClient, { ContentExtractionError } from './api-client';
import storageService from './storage-service.js';
import chromeApi from './chrome-api.js';
import offlineQueue from './offline-queue.js';
import logger from './logger';
import { bootstrap as initBootstrap, ensureInitialized } from './background/init';
import { bootstrap as commandsBootstrap } from './background/commands';
import { bootstrap as saveBootstrap } from './background/save';
import { bootstrap as selectionBootstrap } from './background/selection';
import { bootstrap as messagingBootstrap } from './background/messaging';

// Call bootstraps (order currently not important)
initBootstrap();
commandsBootstrap();
saveBootstrap();
selectionBootstrap();
messagingBootstrap();

// Global error handler to prevent service worker crashes
self.addEventListener('error', (event) => {
  logger.error('Global error', { error: event.error });
  event.preventDefault();
});

self.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection', { reason: event.reason });
  event.preventDefault();
});

// Production-safe logging
const IS_DEV = !('update_url' in chrome.runtime.getManifest());

// Use the new logger
const log = logger;

// Log immediately when script loads
log.info('Background script loaded');

// Init bootstrap already attaches listeners and calls ensureInitialized()

// Command listeners moved to background/commands.ts

// Message handler with initialization check
chromeApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
  log.info('Message received', { action: request.action, from: sender.tab?.url || 'extension' });
  
  
  // Ensure extension is initialized before handling messages
  ensureInitialized()
    .then(() => handleMessage(request, sender, sendResponse))
    .catch(error => {
      log.error('Failed to initialize before handling message', { error: error.message });
      sendResponse({ success: false, error: 'Extension initialization failed' });
    });
  return true; // Always return true for async response
});

async function handleMessage(request, sender, sendResponse) {
  log.info('Handling message', { action: request.action });
  
  // Handle log messages from popup
  if (request.action === 'log') {
    const source = request.source || 'unknown';
    const prefix = `[${source.toUpperCase()}]`;
    
    switch(request.level) {
      case 'info':
        log.info(`${prefix} ${request.message}`, request.data);
        break;
      case 'error':
        log.error(`${prefix} ${request.message}`, request.data);
        break;
      case 'warn':
        log.warn(`${prefix} ${request.message}`, request.data);
        break;
      case 'debug':
        log.debug(`${prefix} ${request.message}`, request.data);
        break;
    }
    return false; // No response needed
  }
  
  if (request.action === 'save') {
    (async () => {
      try {
        log.info('🚀 SAVE ACTION STARTED', {
          timestamp: new Date().toISOString(),
          tags: request.tags || [],
          tagCount: (request.tags || []).length
        });
        
        const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
        
        if (!tabs || tabs.length === 0) {
          log.error('❌ NO ACTIVE TAB FOUND');
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }
        
        log.info('📑 Active tab found', { 
          url: tabs[0].url,
          title: tabs[0].title,
          tabId: tabs[0].id
        });
        
        const tags = request.tags || [];
        log.info('🏷️ Calling handleSave with tags', { tags });
        
        const result = await handleSave(tabs[0], tags);
        
        log.info('✅ handleSave completed successfully', { 
          success: result.success,
          hasNoteId: !!result.noteId,
          noteId: result.noteId,
          warning: result.warning
        });
        sendResponse(result);
      } catch (error) {
        log.error('❌ SAVE ACTION FAILED', { 
          error: error.message,
          errorName: error.name,
          stack: error.stack,
          details: error.details
        });
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Will respond asynchronously
  }
  
  if (request.action === 'saveSelection') {
    (async () => {
      try {
        log.info('Save selection action');
        const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
        
        const result = await handleSaveSelection(
          tabs[0], 
          request.selectedText, 
          request.pageUrl || tabs[0].url
        );
        
        log.info('handleSaveSelection completed', { 
          success: result.success,
          hasNoteId: !!result.noteId 
        });
        sendResponse(result);
      } catch (error) {
        log.info('Save selection failed', { 
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
  
  if (request.action === 'logCsvHeaders') {
    log.info('CSV Headers found:', request.headers);
    sendResponse({ success: true });
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
  
  if (request.action === 'storeSelectionData') {
    // Store selection data temporarily for context menu use
    lastSelectionData = request.data;
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'getAllHashtags') {
    (async () => {
      try {
        log.info('Fetching all hashtags from saved articles');
        
        // Get all saved articles from storage
        const savedArticles = await storageService.getSavedArticles();
        
        // Extract unique hashtags from all articles
        const hashtagSet = new Set();
        
        savedArticles.forEach(article => {
          if (article.tags && Array.isArray(article.tags)) {
            article.tags.forEach(tag => {
              // Normalize hashtag (ensure it starts with #)
              const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
              hashtagSet.add(normalizedTag);
            });
          }
        });
        
        // Convert to array and sort alphabetically
        const hashtags = Array.from(hashtagSet).sort();
        
        log.info('Extracted hashtags', { 
          articleCount: savedArticles.length, 
          hashtagCount: hashtags.length,
          topHashtags: hashtags.slice(0, 5)
        });
        
        sendResponse({ success: true, hashtags });
      } catch (error) {
        log.error('Failed to fetch hashtags', { error: error.message });
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
}


// Context menu

// Store temporary selection data from content script
let lastSelectionData = null;

chromeApi.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'saveToIdeaPocket') {
    // Handle full page save
    handleSave(tab).catch(error => {
      log.error('Context menu save failed:', error);
    });
  } else if (info.menuItemId === 'saveSelectionToIdeaPocket') {
    // Handle text selection save
    if (info.selectionText) {
      try {
        // Try to get rich selection data from content script
        let selectionData = null;
        try {
          selectionData = await chromeApi.tabs.sendMessage(tab.id, { action: 'extractSelection' });
          log.info('Got selection data from content script', { 
            hasData: !!selectionData,
            hasText: !!(selectionData?.text),
            platform: selectionData?.pageInfo?.platform,
            url: selectionData?.pageInfo?.url
          });
        } catch (e) {
          log.info('Failed to get selection data from content script', { error: e.message });
        }
        
        // If we didn't get data from content script, check stored data
        if (!selectionData && lastSelectionData) {
          log.info('Using stored selection data');
          selectionData = lastSelectionData;
          lastSelectionData = null; // Clear it after use
        }
        
        log.info('Selection extraction response', {
          hasStoredData: !!lastSelectionData,
          hasResponse: !!selectionData,
          hasText: !!(selectionData?.text),
          hasTweetInfo: !!(selectionData?.tweetInfo),
          tweetImages: selectionData?.tweetInfo?.images,
          pageUrl: selectionData?.pageInfo?.url,
          platform: selectionData?.pageInfo?.platform
        });
        
        if (selectionData && selectionData.text) {
          // Use rich selection data with link information
          handleSaveSelectionWithLinks(tab, selectionData).catch(error => {
            log.error('Selection save with links failed:', error);
          });
          
          // Clear stored data after use
          lastSelectionData = null;
        } else {
          // Fallback to simple text selection
          handleSaveSelection(tab, info.selectionText, info.pageUrl).catch(error => {
            log.error('Selection save failed:', error);
          });
        }
      } catch (e) {
        // Content script not available, use simple selection
        log.info('Content script not available, using simple selection', { error: e.message });
        handleSaveSelection(tab, info.selectionText, info.pageUrl).catch(error => {
          log.error('Selection save failed:', error);
        });
      }
    }
  }
});

// Flush logs before the service worker is terminated. Returning a promise keeps
// the worker alive until the write completes (Chrome 110+ service-worker behavior).
chrome.runtime.onSuspend.addListener(() => {
  return logger.saveState();
});

// Handle Pocket import
async function handlePocketImport(articles) {
  const total = articles.length;
  const importKey = 'pocketImportStatus';
  log.info('Starting Pocket import', { total });

  await storageService.set({ [importKey]: { status: 'running', imported: 0, total } });
  
  // Set badge to show import in progress
  try {
    await chromeApi.action.setBadgeText({ text: '0' });
    await chromeApi.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    log.info('Badge set for import start');
  } catch (error) {
    log.error('Failed to set badge for import', { error: error.message });
  }

  let imported = 0;
  let failed = 0;
  const errors = [];

  try {
    const userId = (await storageService.getUserInfo()).userId;

    // Process articles one by one using individual /notes/top calls
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      
      try {
        if (!article.url || !article.url.startsWith('http')) {
          throw new Error(`Invalid URL: ${article.url}`);
        }

        const articleData = {
          title: article.title || 'Untitled',
          url: article.url,
          description: `Imported from Pocket on ${new Date().toLocaleDateString()}`,
          content: '',
          author: '',
          publishedTime: '',
          images: [],
          savedAt: (article.addedAt && typeof article.addedAt.toISOString === 'function') ? article.addedAt.toISOString() : new Date().toISOString(),
          domain: new URL(article.url).hostname,
          tags: ['from-pocket', ...(Array.isArray(article.tags) ? article.tags : [])]
        };
        
        const noteId = generateShortId();
        const timestamp = new Date().toISOString();

        const tokens = [];
        if (articleData.title) {
          tokens.push({
            type: 'paragraph',
            tokenId: generateShortId(),
            content: [{ type: 'text', content: articleData.title, marks: [] }],
            depth: 0,
          });
        }
        tokens.push(createLinkTokens(articleData.url));
        const tagsContent = articleData.tags.flatMap(tag => ([
            { type: 'hashtag', content: tag.startsWith('#') ? tag : `#${tag}` },
            { type: 'text', content: ' ', marks: [] }
        ]));
        tokens.push({
            type: 'paragraph',
            tokenId: generateShortId(),
            content: tagsContent,
            depth: 0,
        });

        const noteData = {
          id: noteId,
          authorId: userId,
          tokens: calculateTokenPositions(tokens),
          readAll: false,
          updatedAt: timestamp,
          deletedAt: null,
          folderId: null,
          insertedAt: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
          isSharedPrivately: false,
          directUrlOnly: true,
          expansionSetting: 'auto'
        };

        // Use individual /notes/top API call with timeout protection
        log.info(`Starting API call for article ${imported + 1}/${total}`, { title: articleData.title, url: articleData.url });
        
        // Add 15-second timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('API call timeout after 15 seconds')), 15000)
        );
        
        // This will throw an error if either the API call fails OR times out
        await Promise.race([
          apiClient.post('/notes/top', { note: noteData }),
          timeoutPromise
        ]);
        
        log.info(`API call succeeded for article ${imported + 1}/${total}`);

        // Save to local storage after successful API call
        await storageService.addSavedArticle({
          ...articleData,
          noteId: noteId,
        });

        imported++;
        
        // Update progress in storage and badge
        await storageService.set({ [importKey]: { status: 'running', imported, failed, total } });
        try {
          await chromeApi.action.setBadgeText({ text: `${imported}` });
          log.debug(`Badge updated to ${imported}`);
        } catch (error) {
          log.error('Failed to update badge', { error: error.message });
        }
        
        log.info(`Imported article ${imported}/${total}`, { title: articleData.title });

      } catch (error) {
        failed++;
        errors.push({ url: article.url, error: error.message });
        log.error('Failed to import individual article', { 
          articleIndex: i + 1,
          total,
          url: article.url, 
          title: article.title,
          error: error.message,
          errorType: error.constructor.name 
        });
        
        // Update progress even on failure
        await storageService.set({ [importKey]: { status: 'running', imported, failed, total } });
      }
    }

    // Clear badge
    try {
      await chromeApi.action.setBadgeText({ text: '' });
      log.info('Badge cleared after import');
    } catch (error) {
      log.error('Failed to clear badge', { error: error.message });
    }

    // Send completion notification
    if (imported > 0) {
      try {
        await chromeApi.notifications.create('pocket-import-complete', {
          type: 'basic',
          iconUrl: 'icon-48.png',
          title: 'Pocket Import Complete',
          message: `Successfully imported ${imported} articles${failed > 0 ? `, ${failed} failed` : ''}`
        });
      } catch (error) {
        log.error('Failed to create completion notification', { error: error.message });
        // Don't let notification failure break the import completion
      }
    }

    await storageService.set({ [importKey]: { status: 'complete', imported, failed, total } });
    log.info('Pocket import completed', { imported, failed, total });
    
    return { success: true, imported, failed, total };

  } catch (error) {
    log.error('Pocket import failed', { error: error.message });
    await chromeApi.action.setBadgeText({ text: '' });
    await storageService.set({ [importKey]: { status: 'error', error: error.message, imported, failed: total, total } });
    return { success: false, error: error.message };
  }
}

async function initializeExtension() {
  if (isInitialized) {
    log.debug('Extension already initialized');
    return;
  }
  
  try {
    log.info('Initializing IdeaPocket extension');
    
    // Create context menu (remove existing first to avoid duplicates)
    try {
      await chromeApi.contextMenus.removeAll();
      
      // Create parent menu
      await chromeApi.contextMenus.create({
        id: 'saveToIdeaPocket',
        title: 'Save to IdeaPocket',
        contexts: ['page', 'link']
      });
      
      // Create separate menu for text selection
      await chromeApi.contextMenus.create({
        id: 'saveSelectionToIdeaPocket',
        title: 'Save Selection as Highlight',
        contexts: ['selection']
      });
      
      log.info('Context menus created');
    } catch (error) {
      log.error('Failed to create context menu:', error);
    }
    
    // Verify storage is accessible
    try {
      const test = await storageService.get('test');
      log.info('Storage service is operational');
    } catch (error) {
      log.error('Storage service check failed:', error);
    }
    
    // Check authentication status
    const isAuthenticated = await isLoggedIn();
    log.info('Authentication status:', isAuthenticated);
    
    // Check for queued offline saves
    const queueStatus = await offlineQueue.getQueueStatus();
    if (queueStatus.count > 0) {
      log.info('Found offline queue items', { count: queueStatus.count });
      // Start processing queue
      offlineQueue.processQueue();
    }
    
    isInitialized = true;
    const manifest = chrome.runtime.getManifest();
    log.info(`IdeaPocket v${manifest.version} initialized successfully`);
  } catch (error) {
    log.error('Extension initialization failed:', error);
    isInitialized = false;
    initializationPromise = null; // Allow retry
    throw error;
  }
}

// Helper function to generate UUID
function generateShortId() {
  return Math.random().toString(36).substring(2, 12);
}

// Convert URL to clickable link tokens
function createLinkTokens(url) {
  return {
    type: "paragraph",
    tokenId: generateShortId(),
    content: [
      {
        type: "link",
        content: url,
        slug: url,
      },
    ],
    depth: 0
  };
}

// Extract page title with fallback to tab.title
async function extractPageTitle(tab) {
  try {
    // Try to get smart title from content script with timeout
    const response = await Promise.race([
      chromeApi.tabs.sendMessage(tab.id, { action: 'extractTitle' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Title extraction timeout')), 2000))
    ]);
    
    if (response && response.success && response.title) {
      log.info('Smart title extracted', { title: response.title });
      return response.title;
    } else {
      log.warn('Smart title extraction failed, using tab.title', { response });
      return tab.title || 'Untitled';
    }
  } catch (error) {
    // If content script isn't loaded or fails, try to inject and retry once
    if (error.message?.includes('Could not establish connection')) {
      try {
        await chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        
        // Retry title extraction after injection
        const response = await Promise.race([
          chromeApi.tabs.sendMessage(tab.id, { action: 'extractTitle' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Title extraction timeout after injection')), 2000))
        ]);
        
        if (response && response.success && response.title) {
          log.info('Smart title extracted after injection', { title: response.title });
          return response.title;
        }
      } catch (injectError) {
        log.warn('Failed to inject content script for title extraction', { error: injectError.message });
      }
    }
    
    // Fallback to tab.title
    log.info('Using tab.title fallback', { title: tab.title, error: error.message });
    return tab.title || 'Untitled';
  }
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
        log.error('Failed to inject content script:', injectError);
        throw new ContentExtractionError(
          'Failed to inject content extraction script',
          { url: tab.url, error: injectError.message }
        );
      }
    }
    
    log.error('Failed to extract content:', error);
    
    // TODO: Firecrawl API integration for enhanced extraction
    // Check if Firecrawl is configured
    if (CONFIG.firecrawl.apiKey) {
      log.info('Firecrawl API key configured but integration not implemented yet');
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

// Helper function to calculate positions for tokens
function calculateTokenPositions(tokens) {
  let currentPosition = 0;
  
  return tokens.map(token => {
    const tokenWithPosition = { ...token };
    const start = currentPosition;
    
    // Calculate content length
    let length = 0;
    if (token.content && Array.isArray(token.content)) {
      token.content.forEach(item => {
        if (item.type === 'text' || item.type === 'hashtag') {
          length += item.content.length;
        }
      });
    }
    
    // Add newline for paragraph
    if (token.type === 'paragraph') {
      length += 1; // for the newline
    }
    
    const end = start + length;
    currentPosition = end;
    
    tokenWithPosition.position = { start, end };
    return tokenWithPosition;
  });
}

// Save article to Thoughtstream
async function saveToThoughtstream(articleData, tags = []) {
  log.info('🚀 saveToThoughtstream STARTED', {
    timestamp: new Date().toISOString(),
    title: articleData?.title,
    url: articleData?.url,
    hasContent: !!articleData?.content,
    contentLength: articleData?.content?.length || 0,
    tagCount: tags?.length || 0,
    tags: tags
  });

  try {
    const noteId = generateShortId();
    log.info('📝 Generated note ID', { noteId });
    
    const userInfo = await storageService.getUserInfo();
    log.info('👤 User info retrieved', { 
      hasUserId: !!userInfo?.userId,
      userInfo: userInfo
    });
    
    const userId = userInfo?.userId;
    const timestamp = new Date().toISOString();

    if (!userId) {
      log.error('❌ NO USER ID FOUND');
      throw new Error('User ID not found. Please login again.');
    }

    // Build tokens array
    const tokens = [];

    // First token: Title as plain text
    if (articleData.title) {
      tokens.push({
        type: 'paragraph',
        tokenId: generateShortId(),
        content: [{ type: 'text', content: articleData.title, marks: [] }],
        depth: 0,
      });
    }

    // Second token: URL as clickable link
    tokens.push(createLinkTokens(articleData.url));

    // Third token: Tags (moved to last line)
    const initialTags = ['ideapocket', 'article', ...tags];
    const tagsContent = initialTags.flatMap(tag => ([
        { type: 'hashtag', content: tag.startsWith('#') ? tag : `#${tag}` },
        { type: 'text', content: ' ', marks: [] }
    ]));

    tokens.push({
        type: 'paragraph',
        tokenId: generateShortId(),
        content: tagsContent,
        depth: 0,
    });

    const finalTokens = calculateTokenPositions(tokens);
    
    log.info('📊 Token positions calculated', {
      tokenCount: finalTokens.length,
      tokens: finalTokens.map(t => ({
        type: t.type,
        contentType: t.content?.[0]?.type,
        contentText: t.content?.[0]?.content?.substring(0, 50),
        position: t.position
      }))
    });

    // Payload for /notes/top endpoint - no position needed
    const noteData = {
      id: noteId,
      authorId: userId,
      tokens: finalTokens,
      readAll: false,
      updatedAt: timestamp,
      deletedAt: null,
      folderId: null,
      insertedAt: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      isSharedPrivately: false,
      directUrlOnly: true,
      expansionSetting: 'auto'
    };

    log.info('📦 Note data prepared for /notes/top', { 
      noteId: noteData.id,
      hasTokens: !!noteData.tokens,
      tokenCount: noteData.tokens?.length,
      firstToken: JSON.stringify(noteData.tokens?.[0]),
      allTokensHavePosition: noteData.tokens?.every(t => t.position && typeof t.position.start === 'number' && typeof t.position.end === 'number'),
      userId: noteData.authorId,
      fullNoteData: JSON.stringify(noteData)
    });

    log.info('🌐 Making API request to /notes/top', {
      endpoint: '/notes/top',
      method: 'POST',
      payloadSize: JSON.stringify({ note: noteData }).length
    });
    
    let response;
    try {
      response = await apiClient.post('/notes/top', { note: noteData });
      log.info('✅ API request successful', {
        hasResponse: !!response,
        responseType: typeof response,
        responseKeys: response ? Object.keys(response) : [],
        responseData: JSON.stringify(response)
      });
    } catch (apiError) {
      log.error('❌ API REQUEST FAILED', {
        error: apiError.message,
        errorName: apiError.name,
        errorDetails: apiError.details,
        status: apiError.status,
        response: apiError.response,
        fullError: JSON.stringify(apiError)
      });
      throw apiError;
    }

    // Debug logging to understand response structure
    log.info('API Response Debug', { 
        hasResponse: !!response,
        hasData: !!response?.data,
        isDataArray: Array.isArray(response?.data),
        dataLength: response?.data?.length,
        firstId: response?.data?.[0]?.id,
        lookingForId: noteId,
        responseKeys: response ? Object.keys(response) : []
    });

    // Verify the note was created (tolerate server-side id rewrite)
    const returnedNote = Array.isArray(response?.data) && response.data.length > 0
      ? response.data.find(n => n.id === noteId) || response.data[0]
      : null;

    if (!returnedNote) {
        log.error('❌ FAILURE: API did not confirm save.', { sentNoteId: noteId, responseBody: response });
        throw new Error('API did not confirm save.');
    }

    const finalNoteId = returnedNote.id;
    log.info('✅ saveToThoughtstream SUCCESS', { 
      sentNoteId: noteId, 
      returnedId: finalNoteId,
      timestamp: new Date().toISOString()
    });
    return { noteId: finalNoteId, response };

  } catch (error) {
    log.error('❌ saveToThoughtstream FAILED', { 
      timestamp: new Date().toISOString(),
      error: error.message, 
      name: error.name,
      stack: error.stack,
      details: error.details,
      fullError: JSON.stringify(error)
    });
    throw error;
  }
}

// Handle save action
async function handleSave(tab, tags = []) {
  log.info('🚀 handleSave STARTED', { 
    timestamp: new Date().toISOString(),
    url: tab.url, 
    title: tab.title,
    tabId: tab.id,
    tags: tags,
    tagCount: tags.length
  });
  
  try {
    // Show saving badge
    log.info('📌 Updating badge to saving state');
    await chromeApi.updateBadge(tab.id, '...', '#4CAF50', 0);
    
    // CONTENT EXTRACTION COMMENTED OUT - Only saving URL and tags for now
    /*
    let articleData;
    
    try {
      // Try to extract article content
      log.info('Attempting content extraction');
      articleData = await extractArticleContent(tab);
      log.info('Content extracted successfully', {
        title: articleData.title,
        contentLength: articleData.content?.length,
        hasAuthor: !!articleData.author,
        hasDescription: !!articleData.description
      });
    } catch (extractError) {
      log.info('Content extraction failed', { 
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
    */
    
    // Extract page title with smart fallbacks
    const pageTitle = await extractPageTitle(tab);
    
    // Create article data with extracted title
    const articleData = {
      title: pageTitle,
      url: tab.url,
      description: '',
      content: '', // No content extraction for now
      author: '',
      publishedTime: '',
      images: [],
      savedAt: new Date().toISOString(),
      extractionFailed: false
    };
    
    // Save to Thoughtstream with tags
    log.info('🚀 About to call saveToThoughtstream', { 
      hasContent: !!articleData.content,
      contentLength: articleData.content?.length || 0,
      tagsCount: tags.length,
      tags: tags,
      articleTitle: articleData.title,
      articleUrl: articleData.url
    });
    
    const result = await saveToThoughtstream(articleData, tags);
    
    log.info('✅ saveToThoughtstream returned successfully', { 
      noteId: result.noteId,
      hasResponse: !!result.response
    });
    
    // Store in local history with position and other metadata for updates
    const savedAt = new Date().toISOString();
    const position = String(-new Date().getTime()); // Our position for internal ordering
    const thoughtstreamPosition = result.response?.data?.find(note => note.id === result.noteId)?.position; // Thoughtstream's position for API calls
    
    await storageService.addSavedArticle({
      ...articleData,
      noteId: result.noteId,
      tags: ['ideapocket', 'article', ...tags], // Include default ideapocket and article tags
      savedAt: savedAt,
      position: position, // Our position (for internal use)
      thoughtstreamPosition: thoughtstreamPosition, // Thoughtstream's position (for API calls)
      createdAt: savedAt,
      insertedAt: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    });
    
    // Show success badge
    log.info('📌 Updating badge to success state');
    await chromeApi.updateBadge(tab.id, '✓', '#4CAF50');
    
    log.info('✅ handleSave COMPLETED SUCCESSFULLY', {
      noteId: result.noteId
    });
    
    return { 
      success: true, 
      noteId: result.noteId,
      warning: null
    };
  } catch (error) {
    log.error('❌ handleSave FAILED', {
      timestamp: new Date().toISOString(),
      error: error.message,
      type: error.name,
      stack: error.stack,
      details: error.details,
      fullError: JSON.stringify(error)
    });
    
    // Show error badge immediately
    await chromeApi.updateBadge(tab.id, '❌', '#F44336');
    
    // Handle network errors with offline queue
    if (error.name === 'NetworkError' || error.code === 'NETWORK_ERROR') {
      try {
        // Queue for retry
        const queueLength = await offlineQueue.add(articleData, tags, {
          id: generateShortId(),
          authorId: (await storageService.getUserInfo()).userId,
          ...(result || {}) // Use the already formatted result if available
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
        log.info('Failed to queue offline', { error: queueError.message });
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
  
  log.info('Updating note with tags (recreate + append)', { noteId, tags });
  
  try {
    // Get current note data from local storage
    const savedArticles = await storageService.getSavedArticles();
    const articleIndex = savedArticles.findIndex(a => a.noteId === noteId);
    
    if (articleIndex === -1) {
      throw new Error('Note not found in local history');
    }
    
    const article = savedArticles[articleIndex];
    const userId = (await storageService.getUserInfo()).userId;
    const timestamp = new Date().toISOString();
    
    if (!userId) {
      throw new Error('User ID not found. Please login again.');
    }
    
    // Recreate the note structure exactly as in saveToThoughtstream
    const tokens = [];
    
    // First token: Title as plain text (if available)
    if (article.title) {
      tokens.push({
        type: 'paragraph',
        tokenId: generateShortId(),
        content: [{ type: 'text', content: article.title, marks: [] }],
        depth: 0,
      });
    }
    
    // Second token: URL as clickable link
    tokens.push(createLinkTokens(article.url));
    
    // Third token: Original tags (recreate existing tags structure)
    const existingTags = article.tags || ['pocket'];
    const originalTagsContent = existingTags.flatMap(tag => ([
        { type: 'hashtag', content: tag.startsWith('#') ? tag : `#${tag}` },
        { type: 'text', content: ' ', marks: [] }
    ]));
    
    tokens.push({
        type: 'paragraph',
        tokenId: generateShortId(),
        content: originalTagsContent,
        depth: 0,
    });
    
    // Fourth token: NEW tags paragraph (appended at bottom)
    const newTagsContent = tags.flatMap(tag => ([
        { type: 'hashtag', content: tag.startsWith('#') ? tag : `#${tag}` },
        { type: 'text', content: ' ', marks: [] }
    ]));
    
    tokens.push({
        type: 'paragraph',
        tokenId: generateShortId(),
        content: newTagsContent,
        depth: 0,
    });
    
    const finalTokens = calculateTokenPositions(tokens);
    
    // Use same update structure as saveToThoughtstream
    const updateData = {
      id: noteId,
      authorId: userId,
      tokens: finalTokens,
      position: article.thoughtstreamPosition, // Use Thoughtstream's position for API call
      readAll: false,
      updatedAt: timestamp,
      deletedAt: null,
      folderId: null,
      insertedAt: article.insertedAt || new Date(article.savedAt).toISOString().slice(0, 10).replace(/-/g, ''),
      isSharedPrivately: false,
      directUrlOnly: true,
      expansionSetting: 'auto'
    };
    
    log.info('Recreating note structure + appending new tags', { 
      noteId, 
      originalTags: existingTags.length,
      newTags: tags.length,
      totalTokens: finalTokens.length
    });
    
    // Update the note using upsert endpoint (wrap array in notes object)
    const response = await apiClient.post('/notes', { notes: [updateData] });
    
    // DEBUG: Log the exact response we got
    log.info('UPDATE RESPONSE DEBUG', {
      response: JSON.stringify(response, null, 2),
      hasData: !!response?.data,
      hasError: !!response?.error,
      dataType: typeof response?.data,
      dataIsArray: Array.isArray(response?.data)
    });
    
    // Check if we got a successful response from upsert
    const updatedNote = response?.data?.find?.(note => note.id === noteId) || response?.data?.[0];
    if (!updatedNote) {
      log.error('UPDATE FAILED - No updated note in response', {
        responseKeys: Object.keys(response || {}),
        dataKeys: response?.data ? Object.keys(response.data) : null
      });
      throw new Error('API did not confirm update');
    }
    
    log.info('✅ Note recreated with appended tags', { noteId });
    
    // Update local history with combined tags
    const allTags = [...new Set([...existingTags, ...tags])];
    
    savedArticles[articleIndex] = {
      ...article,
      tags: allTags,
      updatedAt: timestamp
    };
    await storageService.setSavedArticles(savedArticles);
    
    return response;
  } catch (error) {
    log.error('Failed to recreate note with appended tags', { 
      noteId, 
      tags,
      error: error.message,
      stack: error.stack 
    });
    throw error;
  }
}

// Handle text selection saves
async function handleSaveSelection(tab, selectedText, pageUrl) {
  log.info('Starting selection save', { 
    url: pageUrl, 
    textLength: selectedText.length,
    tabId: tab.id 
  });
  
  try {
    // Show saving badge
    await chromeApi.updateBadge(tab.id, '...', '#4CAF50', 0);
    
    // Create selection data
    const selectionData = {
      title: tab.title || 'Untitled Page',
      url: pageUrl || tab.url,
      selectedText: selectedText,
      savedAt: new Date().toISOString()
    };
    
    // Save with #highlight tag
    const result = await saveSelectionToThoughtstream(selectionData);
    
    log.info('Selection save completed', { noteId: result.noteId });
    
    // Store in local history with compact format
    // Extract domain for compact display
    let domain = '';
    try {
      const urlObj = new URL(selectionData.url);
      domain = urlObj.hostname.replace('www.', '');
    } catch (e) {
      domain = 'unknown';
    }
    
    const positionValue = String(-new Date().getTime());
    
    await storageService.addSavedArticle({
      title: domain,  // Just show domain as title
      url: selectionData.url,
      domain: domain,  // Store domain separately for search
      description: selectedText.substring(0, 200) + (selectedText.length > 200 ? '...' : ''),
      content: selectedText,
      author: '',
      publishedTime: '',
      images: [],
      savedAt: selectionData.savedAt,
      noteId: result.noteId,
      tags: ['ideapocket', 'highlight'],
      isHighlight: true,
      originalPageTitle: selectionData.title,  // Store original title for reference
      position: positionValue,
      createdAt: selectionData.savedAt,
      insertedAt: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    });
    
    // Show success
    await chromeApi.updateBadge(tab.id, '✓', '#4CAF50', 3000);
    
    return { success: true, noteId: result.noteId };
  } catch (error) {
    log.error('handleSaveSelection failed', { error: error.message });
    await chromeApi.updateBadge(tab.id, '✗', '#f44336', 3000);
    throw error;
  }
}

// Handle text selection with link information
async function handleSaveSelectionWithLinks(tab, selectionData) {
  log.info('Starting selection save with links', { 
    url: selectionData.pageInfo.url, 
    textLength: selectionData.text.length,
    linkCount: selectionData.links.length,
    tabId: tab.id 
  });
  
  try {
    // Show saving badge
    await chromeApi.updateBadge(tab.id, '...', '#4CAF50', 0);
    
    // Log the incoming selection data
    log.info('handleSaveSelectionWithLinks received data', {
      hasTweetInfo: !!selectionData.tweetInfo,
      tweetInfoImages: selectionData.tweetInfo ? selectionData.tweetInfo.images : null,
      platform: selectionData.pageInfo ? selectionData.pageInfo.platform : null
    });
    
    // Prepare the selection data for saving
    const enrichedData = {
      title: selectionData.pageInfo.title || tab.title || 'Untitled Page',
      url: selectionData.pageInfo.url || tab.url,
      selectedText: selectionData.markdownText || selectionData.text,  // Use markdown version if available
      plainText: selectionData.text,  // Keep plain text for search
      links: selectionData.links,
      hasLinks: selectionData.hasLinks,
      savedAt: new Date().toISOString(),
      tweetInfo: selectionData.tweetInfo || null,
      platform: selectionData.pageInfo.platform || null
    };
    
    // Save with #highlight tag
    const result = await saveSelectionToThoughtstream(enrichedData);
    
    log.info('Selection with links saved', { noteId: result.noteId });
    
    // Store in local history with enriched format
    // Extract domain for compact display
    let domain = '';
    try {
      const urlObj = new URL(enrichedData.url);
      domain = urlObj.hostname.replace('www.', '');
    } catch (e) {
      domain = 'unknown';
    }
    
    // Create description with link indicators (use plain text for display)
    let description = enrichedData.plainText.substring(0, 200);
    if (enrichedData.hasLinks) {
      description += ` [${enrichedData.links.length} link${enrichedData.links.length > 1 ? 's' : ''}]`;
    }
    if (enrichedData.plainText.length > 200) {
      description += '...';
    }
    
    // For Twitter, show tweet author as title if available
    let displayTitle = domain;
    if (enrichedData.platform === 'twitter' && enrichedData.tweetInfo?.author) {
      const username = enrichedData.tweetInfo.author.username || enrichedData.tweetInfo.author.name;
      if (username) {
        // Add @ if not already present
        displayTitle = username.startsWith('@') ? username : `@${username}`;
      }
    }
    
    const positionValue = String(-new Date().getTime());
    
    await storageService.addSavedArticle({
      title: displayTitle,
      url: enrichedData.url,
      domain: domain,
      description: description,
      content: enrichedData.selectedText,
      links: enrichedData.links,
      hasLinks: enrichedData.hasLinks,
      author: enrichedData.tweetInfo?.author?.name || '',
      publishedTime: '',
      images: enrichedData.tweetInfo?.images || [],
      savedAt: enrichedData.savedAt,
      noteId: result.noteId,
      tags: ['ideapocket', 'highlight'],
      isHighlight: true,
      originalPageTitle: enrichedData.title,
      platform: enrichedData.platform,
      tweetInfo: enrichedData.tweetInfo,
      position: positionValue,
      createdAt: enrichedData.savedAt,
      insertedAt: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    });
    
    // Show success
    await chromeApi.updateBadge(tab.id, '✓', '#4CAF50', 3000);
    
    return { success: true, noteId: result.noteId };
  } catch (error) {
    log.error('handleSaveSelectionWithLinks failed', { error: error.message });
    await chromeApi.updateBadge(tab.id, '✗', '#f44336', 3000);
    throw error;
  }
}

// Save selection to Thoughtstream
async function saveSelectionToThoughtstream(selectionData) {
  log.info('saveSelectionToThoughtstream called - using /notes/top endpoint');

  try {
    const noteId = generateShortId();
    const userId = (await storageService.getUserInfo()).userId;
    const timestamp = new Date().toISOString();

    if (!userId) {
      throw new Error('User ID not found. Please login again.');
    }

    // Create tokens array
    const tokens = [];
    
    // First token: Title as plain text (if available)
    if (selectionData.title) {
      tokens.push({
        type: 'paragraph',
        tokenId: generateShortId(),
        content: [{ type: 'text', content: selectionData.title, marks: [] }],
        depth: 0,
      });
    }
    
    // Second token: URL as clickable link
    tokens.push(createLinkTokens(selectionData.url));
    
    // Second paragraph: Empty line 
    tokens.push({
      type: 'paragraph',
      tokenId: generateShortId(),
      content: [{ type: 'text', content: '', marks: [] }],
      depth: 0
    });
    
    // Third paragraph: Selected text
    tokens.push({
      type: 'paragraph',
      tokenId: generateShortId(),
      content: [
        { type: 'text', content: selectionData.selectedText, marks: [] }
      ],
      depth: 0
    });
    
    // Fifth paragraph: Empty line before tags
    tokens.push({
      type: 'paragraph',
      tokenId: generateShortId(),
      content: [{ type: 'text', content: '', marks: [] }],
      depth: 0
    });
    
    // Sixth paragraph: #ideapocket #highlight tags
    tokens.push({
      type: 'paragraph',
      tokenId: generateShortId(),
      content: [
        { type: 'hashtag', content: '#ideapocket' },
        { type: 'text', content: ' ', marks: [] },
        { type: 'hashtag', content: '#highlight' },
        { type: 'text', content: ' ', marks: [] }
      ],
      depth: 0
    });

        
    // If there are images (from Twitter), add them  
    log.info('Checking for Twitter images', { 
      hasTweetInfo: !!selectionData.tweetInfo,
      hasImages: !!(selectionData.tweetInfo && selectionData.tweetInfo.images),
      imageCount: selectionData.tweetInfo && selectionData.tweetInfo.images ? selectionData.tweetInfo.images.length : 0
    });
    
    if (selectionData.tweetInfo && selectionData.tweetInfo.images && selectionData.tweetInfo.images.length > 0) {
      log.info('Adding Twitter images to note', { count: selectionData.tweetInfo.images.length });
      
      tokens.push({
        type: 'paragraph',
        tokenId: generateShortId(),
        content: [{ type: 'text', content: '', marks: [] }],
        depth: 0
      });
      
      // Add images section header
      tokens.push({
        type: 'paragraph',
        tokenId: generateShortId(),
        content: [
          { type: 'text', content: '---', marks: [] }
        ],
        depth: 0
      });
      
      tokens.push({
        type: 'paragraph',
        tokenId: generateShortId(),
        content: [
          { type: 'text', content: `🖼️ Images in tweet (${selectionData.tweetInfo.images.length}):`, marks: [] }
        ],
        depth: 0
      });
      
      // Add each image as a paragraph with the image URL and permalink
      selectionData.tweetInfo.images.forEach((image, index) => {
        // Create content with image and link
        const imageContent = [];
        
        // Add the image markdown
        imageContent.push({
          type: 'text',
          content: `${image.src}`,
          marks: []
        });
        
        // Add link to view on Twitter if available
        if (image.link) {
          imageContent.push({
            type: 'text',
            content: ` ${image.link}`,
            marks: []
          });
        }
        
        tokens.push({
          type: 'paragraph',
          tokenId: generateShortId(),
          content: imageContent,
          depth: 0
        });
      });
    }

    // If there are links, add them as a separate paragraph
    if (selectionData.links && selectionData.links.length > 0) {
      tokens.push({
        type: 'paragraph',
        tokenId: generateShortId(),
        content: [{ type: 'text', content: '', marks: [] }],
        depth: 0
      });
      
      // Add links section header
      tokens.push({
        type: 'paragraph',
        tokenId: generateShortId(),
        content: [
          { type: 'text', content: '---', marks: [] }
        ],
        depth: 0
      });
      
      tokens.push({
        type: 'paragraph',
        tokenId: generateShortId(),
        content: [
          { type: 'text', content: `🔗 Links found in selection (${selectionData.links.length}):`, marks: [] }
        ],
        depth: 0
      });
      
      // Add each link
      selectionData.links.forEach((link, index) => {
        tokens.push({
          type: 'paragraph',
          tokenId: generateShortId(),
          content: [
            { type: 'text', content: `${index + 1}. [${link.text}](${link.url})`, marks: [] }
          ],
          depth: 0
        });
      });
    }

    // Add position information to all tokens
    const finalTokens = calculateTokenPositions(tokens);

    const noteData = {
      id: noteId,
      authorId: userId,
      tokens: finalTokens,
      readAll: false,
      updatedAt: timestamp,
      deletedAt: null,
      folderId: null,
      insertedAt: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      isSharedPrivately: false,
      directUrlOnly: true,
      expansionSetting: 'auto'
    };

    log.info('Selection note data prepared', { 
      noteId: noteData.id,
      tokenCount: finalTokens.length 
    });

    const response = await apiClient.post('/notes/top', { note: noteData });

    const returnedNote = Array.isArray(response?.data) && response.data.length > 0
      ? response.data.find(n => n.id === noteId) || response.data[0]
      : null;

    if (!returnedNote) {
        log.error('❌ FAILURE: Selection save not confirmed.', { sentNoteId: noteId });
        throw new Error('API did not confirm selection save.');
    }

    const finalNoteId = returnedNote.id;
    log.info('✅ SUCCESS: Selection saved.', { sentNoteId: noteId, returnedId: finalNoteId });
    return { noteId: finalNoteId, response };

  } catch (error) {
    log.error('saveSelectionToThoughtstream failed', { error: error.message });
    throw error;
  }
}

// Re-export handlers so other background modules can call them (circular import OK)
export { handleSave, handleSaveSelection };
