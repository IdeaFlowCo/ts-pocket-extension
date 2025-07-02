# How TsPocket Extension Works

## Overview

TsPocket is a Chrome Extension that provides a Pocket-like interface for saving web articles to Thoughtstream/Ideaflow. It's built as a Manifest V3 extension using pure JavaScript (no TypeScript despite the folder name).

## Architecture

### Core Components

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Popup UI  │     │Content Script│    │Service Worker│
│  (Frontend) │────▶│ (Extractor) │────▶│  (Backend)  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │Thoughtstream│
                                        │     API     │
                                        └─────────────┘
```

1. **Service Worker** (`background.js`)
   - Central message hub
   - Handles all API communication
   - Manages authentication flow
   - Processes save requests
   - Maintains offline queue

2. **Content Script** (`content.js`)
   - Injected into web pages
   - Extracts article content
   - Uses Readability-inspired algorithms
   - Sends extracted data to service worker

3. **Popup UI** (`popup.html/js/css`)
   - User interface for the extension
   - Save current tab
   - View recent articles
   - Manage tags
   - Settings and debug controls

4. **Supporting Modules**
   - `auth.js` - OAuth2 PKCE authentication
   - `api-client.js` - API communication with retry logic
   - `storage-service.js` - Chrome storage wrapper
   - `offline-queue.js` - Failed save retry system
   - `logger.js` - Production-safe logging

## Key Flows

### 1. Authentication Flow (OAuth2 PKCE)

```
User clicks Login
       │
       ▼
Generate PKCE codes (verifier + challenge)
       │
       ▼
Redirect to Auth0 login page
       │
       ▼
User authenticates
       │
       ▼
Auth0 redirects with authorization code
       │
       ▼
Exchange code for tokens (using verifier)
       │
       ▼
Store tokens in Chrome storage
       │
       ▼
Ready to save articles
```

### 2. Article Save Flow

```
User clicks Save
       │
       ▼
Content script extracts article
       │
       ▼
Send to service worker
       │
       ▼
Format as Thoughtstream note
       │
       ▼
POST to /notes API endpoint
       │
       ├─── Success ──▶ Cache locally
       │
       └─── Failure ──▶ Add to offline queue
```

### 3. Message Passing System

All components communicate through the service worker:

```javascript
// From popup or content script:
chrome.runtime.sendMessage({
  action: 'save',
  data: { tags: ['reading'] }
})

// Service worker receives and routes:
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch(request.action) {
    case 'save': handleSave(sender.tab, request.data)
    case 'login': handleLogin()
    // etc...
  }
})
```

## Data Storage

### Chrome Storage Keys

- `authData` - OAuth tokens and user info
  ```javascript
  {
    accessToken: "...",
    refreshToken: "...",
    expiresAt: 1234567890,
    user: { email: "..." }
  }
  ```

- `savedArticles` - Last 100 cached articles
  ```javascript
  [
    {
      id: "note_id",
      title: "Article Title",
      url: "https://...",
      tags: ["pocket", "tech"],
      savedAt: "2024-01-01T00:00:00Z"
    }
  ]
  ```

- `offlineQueue` - Failed saves for retry
  ```javascript
  [
    {
      id: "temp_id",
      content: { ... },
      timestamp: 1234567890,
      retryCount: 0
    }
  ]
  ```

## Content Extraction

The content script uses a multi-strategy approach:

1. **Check for Reader Mode** - Use browser's reader view if available
2. **Open Graph Tags** - Extract metadata from meta tags
3. **Article Detection** - Find main content using heuristics:
   - Look for `<article>` tags
   - Find elements with content-related classes
   - Score elements by text density
4. **Readability Algorithm** - Clean and extract main text

## API Integration

### Endpoints Used

- `POST /auth/token` - Exchange auth code for tokens
- `POST /auth/refresh` - Refresh expired tokens
- `GET /users/me` - Get user profile
- `POST /notes` - Create new article/note
- `PUT /notes/{id}` - Update existing note
- `GET /notes` - Retrieve saved articles

### Note Format

Articles are saved as Thoughtstream notes with a specific token structure:

```javascript
{
  tokens: [
    { type: 'tag', value: 'pocket' },
    { type: 'tag', value: 'reading' },
    { type: 'text', value: '[Article Title](https://article-url.com)\n\nArticle content...' }
  ]
}
```

## Offline Support

The extension handles offline scenarios gracefully:

1. **Detect Failure** - Network errors trigger offline queue
2. **Queue Save** - Failed saves stored with metadata
3. **Retry Logic** - Exponential backoff with max retries
4. **Auto-sync** - Queue processes when connection restored

## Security Features

- **OAuth2 PKCE** - No client secret needed
- **Token Refresh** - Automatic token renewal
- **Content Sanitization** - XSS prevention
- **Secure Storage** - Chrome's encrypted storage
- **HTTPS Only** - All API calls use TLS

## User Features

### Current Capabilities

- ✅ One-click article saving
- ✅ Automatic content extraction
- ✅ Tag management
- ✅ Recent articles list
- ✅ Search saved articles
- ✅ Offline queue
- ✅ Keyboard shortcuts (Ctrl+Shift+S)
- ✅ Context menu integration
- ✅ Debug mode for troubleshooting

### Limitations

- ❌ Only searches last 100 cached articles
- ❌ No bulk operations
- ❌ Limited content extraction for some sites
- ❌ No article editing (only tag updates)

## Development & Debugging

### Setup

1. Clone repository
2. Open `chrome://extensions/`
3. Enable Developer mode
4. Click "Load unpacked" and select directory
5. No build step required - pure JavaScript

### Debugging

- **Enable Debug Mode**: Settings → Toggle Debug Mode
- **View Logs**: Open service worker DevTools
- **Export Logs**: Available in popup settings
- **Storage Inspection**: Chrome DevTools → Application → Storage

### Common Issues

1. **Authentication Failures**
   - Check token expiration
   - Verify Auth0 configuration
   - Clear storage and re-authenticate

2. **Content Extraction Failures**
   - Some sites block content scripts
   - Dynamic content may not be captured
   - Check console for errors

3. **Save Failures**
   - Check offline queue
   - Verify API endpoint status
   - Check rate limits

## Potential Enhancements with Gemini

### 1. Smart Summaries
```javascript
// In content extraction phase
const article = extractArticle();
const summary = await geminiService.summarize(article.content);
article.summary = summary;
```

### 2. Auto-tagging
```javascript
// Before saving
const suggestedTags = await geminiService.generateTags(article);
article.tags = [...article.tags, ...suggestedTags];
```

### 3. Semantic Search
```javascript
// Enhanced search
const results = await geminiService.semanticSearch(query, articles);
```

### 4. Content Intelligence
```javascript
// Extract insights
const insights = await geminiService.extractKeyPoints(article);
const relatedArticles = await geminiService.findRelated(article, savedArticles);
```

## Technical Stack

- **Chrome Extension APIs**: Manifest V3
- **Authentication**: Auth0 with OAuth2 PKCE
- **Storage**: Chrome Storage API
- **Content Extraction**: Custom Readability implementation
- **API Client**: Fetch with retry logic
- **UI**: Vanilla JavaScript with CSS
- **No Build Tools**: Direct JavaScript execution