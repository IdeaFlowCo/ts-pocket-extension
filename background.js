// Background script for TsPocket Chrome Extension
import { loginWithAuth0, logout, isLoggedIn } from './auth.js';
import CONFIG from './config.js';
import apiClient, { ContentExtractionError } from './api-client.js';
import storageService from './storage-service.js';
import chromeApi from './chrome-api.js';
import offlineQueue from './offline-queue.js';
import logger from './logger.js';

// Global error handler to prevent service worker crashes
self.addEventListener('error', (event) => {
  logger.error('Global error', { error: event.error });
  event.preventDefault();
});

self.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection', { reason: event.reason });
  event.preventDefault();
});

// Track initialization state
let isInitialized = false;
let initializationPromise = null;

// Production-safe logging
const IS_DEV = !('update_url' in chrome.runtime.getManifest());

// Use the new logger
const log = logger;

// Log immediately when script loads
log.info(`Background script loaded`);


// Initialize extension on startup and install
chromeApi.runtime.onStartup.addListener(() => {
  log.info('Extension startup event');
  ensureInitialized();
});

chromeApi.runtime.onInstalled.addListener((details) => {
  log.info('Extension installed/updated', { reason: details.reason });
  ensureInitialized();
});

// Also initialize immediately
log.info('Initializing extension...');
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
    log.debug('Extension already initialized');
    return;
  }
  
  try {
    log.info('Initializing TsPocket extension');
    
    // Create context menu (remove existing first to avoid duplicates)
    try {
      await chromeApi.contextMenus.removeAll();
      
      // Create parent menu
      await chromeApi.contextMenus.create({
        id: 'saveToTsPocket',
        title: 'Save to TsPocket',
        contexts: ['page', 'link']
      });
      
      // Create separate menu for text selection
      await chromeApi.contextMenus.create({
        id: 'saveSelectionToTsPocket',
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
    log.info(`TsPocket v${manifest.version} initialized successfully`);
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

// Convert URL to proper link tokens (based on Thoughtstream's getAsLinkLoaderTokens)
function createLinkTokens(url) {
  return {
    type: "paragraph",
    tokenId: generateShortId(),
    content: [
      {
        type: "linkloader",
        tokenId: generateShortId(),
        url: url,
        isActive: true,
      },
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
  log.info('saveToThoughtstream called - using /notes/top endpoint', {
    title: articleData?.title,
    url: articleData?.url,
    tagCount: tags?.length || 0
  });

  try {
    const noteId = generateShortId();
    const userId = (await storageService.getUserInfo()).userId;
    const timestamp = new Date().toISOString();

    if (!userId) {
      throw new Error('User ID not found. Please login again.');
    }

    // Build tokens array
    const tokens = [];

    // First token: URL as link
    tokens.push(createLinkTokens(articleData.url));

    // Second token: Tags (moved to last line)
    const initialTags = ['pocket', ...tags];
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

    log.info('Note data prepared for /notes/top', { 
      noteId: noteData.id,
      hasTokens: !!noteData.tokens,
      tokenCount: noteData.tokens?.length,
      firstToken: JSON.stringify(noteData.tokens?.[0]),
      allTokensHavePosition: noteData.tokens?.every(t => t.position && typeof t.position.start === 'number' && typeof t.position.end === 'number'),
      userId: noteData.authorId
    });

    const response = await apiClient.post('/notes/top', { note: noteData });

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

    // Verify the note was created (response.data is still an array)
    const createdNote = response?.data?.find(note => note.id === noteId);
    if (createdNote) {
        log.info('✅ SUCCESS: API confirmed save.', { 
          noteId,
          returnedId: createdNote.id,
          hasPosition: !!createdNote.position,
          position: createdNote.position 
        });
        return { noteId, response };
    } else {
        log.error('❌ FAILURE: API did not confirm save.', { sentNoteId: noteId, responseBody: response });
        throw new Error('API did not confirm save.');
    }

  } catch (error) {
    log.error('saveToThoughtstream failed with unexpected error', { error: error.message, name: error.name });
    throw error;
  }
}

// Handle save action
async function handleSave(tab, tags = []) {
  log.info('Starting save process', { url: tab.url, tabId: tab.id });
  
  try {
    // Show saving badge
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
    log.info('Calling saveToThoughtstream', { 
      hasContent: !!articleData.content,
      tagsCount: tags.length 
    });
    
    const result = await saveToThoughtstream(articleData, tags);
    
    log.info('Save completed', { noteId: result.noteId });
    
    // Store in local history with position and other metadata for updates
    const savedAt = new Date().toISOString();
    const position = String(-new Date().getTime());
    await storageService.addSavedArticle({
      ...articleData,
      noteId: result.noteId,
      tags: ['pocket', ...tags], // Include default pocket tag
      savedAt: savedAt,
      position: position,
      createdAt: savedAt,
      insertedAt: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    });
    
    // Show success badge
    await chromeApi.updateBadge(tab.id, '✓', '#4CAF50');
    
    return { 
      success: true, 
      noteId: result.noteId,
      warning: null
    };
  } catch (error) {
    log.error('Failed to save article', {
      error: error.message,
      type: error.name,
      stack: error.stack,
      details: error.details
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
          ...result // Use the already formatted result
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
  
  log.info('Updating note with tags', { noteId, tags });
  
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
    
    // Get existing tags from local storage
    const existingTags = article.tags || ['pocket'];
    
    // Combine existing tags with new tags (avoid duplicates)
    const allTags = [...new Set([...existingTags, ...tags])];
    
    // Create tokens for the updated note (matching the format used in saveToThoughtstream)
    const tokens = [];
    
    // First paragraph: All tags as hashtags
    const firstParagraphContent = allTags.flatMap(tag => ([
        { type: 'hashtag', content: tag.startsWith('#') ? tag : `#${tag}` },
        { type: 'text', content: ' ', marks: [] }
    ]));
    
    tokens.push({
      type: 'paragraph',
      tokenId: generateShortId(),
      content: firstParagraphContent,
      depth: 0
    });
    
    // Second paragraph: URL
    tokens.push({
      type: 'paragraph',
      tokenId: generateShortId(),
      content: [{ type: 'text', marks: [], content: article.url }],
      depth: 0
    });
    
    // Prepare the complete note update payload (matching the create format)
    const updateData = {
      id: noteId,
      authorId: userId,
      tokens: tokens,
      position: article.position || String(-new Date(article.savedAt).getTime()), // Keep original position
      readAll: false,
      updatedAt: timestamp,
      deletedAt: null,
      folderId: null,
      insertedAt: article.insertedAt || new Date(article.savedAt).toISOString().slice(0, 10).replace(/-/g, ''),
      isSharedPrivately: false,
      directUrlOnly: true,
      expansionSetting: 'auto'
    };
    
    log.info('Sending token-based update to API', { noteId, newTagCount: allTags.length });
    
    // Update the note
    const response = await apiClient.post('/notes', { notes: [updateData] });
    
    // Check if we got a successful response
    const updatedNote = response?.data?.find(note => note.id === noteId);
    if (!updatedNote) {
      throw new Error('API did not confirm update');
    }
    
    log.info('✅ Note update confirmed', { noteId });
    
    // Update local history with new tags
    savedArticles[articleIndex] = {
      ...article,
      tags: allTags,
      updatedAt: timestamp
    };
    await storageService.setSavedArticles(savedArticles);
    
    return response;
  } catch (error) {
    log.error('Failed to update note with tags', { 
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
      tags: ['highlight'],
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
      tags: ['highlight'],
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
    
    // First paragraph: Title (if available)
    if (selectionData.title && selectionData.title.trim() && selectionData.title !== 'Untitled') {
      tokens.push({
        type: 'paragraph',
        tokenId: generateShortId(),
        content: [{ type: 'text', marks: [], content: selectionData.title.trim() }],
        depth: 0
      });
    }
    
    // Second paragraph: URL as link
    tokens.push(createLinkTokens(selectionData.url));
    
    // Third paragraph: Empty line 
    tokens.push({
      type: 'paragraph',
      tokenId: generateShortId(),
      content: [{ type: 'text', content: '', marks: [] }],
      depth: 0
    });
    
    // Fourth paragraph: Selected text
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
    
    // Sixth paragraph: #highlight tag
    tokens.push({
      type: 'paragraph',
      tokenId: generateShortId(),
      content: [
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

    const createdNote = response?.data?.find(note => note.id === noteId);
    if (createdNote) {
        log.info('✅ SUCCESS: Selection saved.', { noteId });
        
        // Store in local history like articles
        const savedAt = new Date().toISOString();
        const position = String(-new Date().getTime());
        await storageService.addSavedArticle({
          title: selectionData.title || 'Text Selection',
          url: selectionData.url,
          description: selectionData.selectedText,
          noteId: noteId,
          tags: ['highlight'],
          savedAt: savedAt,
          position: position,
          createdAt: savedAt,
          insertedAt: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
          isHighlight: true,
          hasLinks: !!(selectionData.links && selectionData.links.length > 0)
        });
        
        return { noteId, response };
    } else {
        log.error('❌ FAILURE: Selection save not confirmed.', { sentNoteId: noteId });
        throw new Error('API did not confirm selection save.');
    }

  } catch (error) {
    log.error('saveSelectionToThoughtstream failed', { error: error.message });
    throw error;
  }
}

// Message handler with initialization check
chromeApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
  log.info('Message received', { action: request.action, from: sender.tab?.url || 'extension' });
  
  // Handle log requests immediately (don't need initialization)
  if (request.action === 'getLogs') {
    sendResponse({ 
      success: true, 
      logs: logger.getLogs(request.filter || {})
    });
    return true;
  }
  
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
  
  if (request.action === 'save') {
    (async () => {
      try {
        log.info('Save action - getting active tab');
        const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
        log.info('Active tab found', { url: tabs[0]?.url });
        
        const tags = request.tags || [];
        const result = await handleSave(tabs[0], tags);
        
        log.info('handleSave completed, sending response', { 
          success: result.success,
          hasNoteId: !!result.noteId 
        });
        sendResponse(result);
      } catch (error) {
        log.info('Save action failed', { 
          error: error.message,
          stack: error.stack 
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
  if (info.menuItemId === 'saveToTsPocket') {
    // Handle full page save
    handleSave(tab).catch(error => {
      log.error('Context menu save failed:', error);
    });
  } else if (info.menuItemId === 'saveSelectionToTsPocket') {
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

// Keyboard shortcut handler
chromeApi.commands.onCommand.addListener(async (command) => {
  if (command === '_execute_action') {
    try {
      const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
      await handleSave(tabs[0]);
    } catch (error) {
      log.error('Keyboard shortcut save failed:', error);
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
          noteId: generateShortId(),
          tags: tags
        });
        
        imported++;
      } catch (error) {
        log.error('Failed to import article:', article.url, error);
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
