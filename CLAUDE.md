# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IdeaPocket is a Chrome Extension that provides a Pocket-like interface for saving articles to Thoughtstream/Ideaflow. Despite the folder name "ts-pocket-extension", this is a pure JavaScript project (no TypeScript).

## Architecture

This is a Chrome Extension using Manifest V3 with:
- **Service Worker** (`background.js`) - Handles API calls, authentication, and extension lifecycle
- **Content Script** (`content.js`) - Extracts article content from web pages  
- **Popup UI** (`popup.html/js/css`) - User interface for saving and managing articles
- **No build system** - Pure JavaScript loaded directly by Chrome

Key modules:
- `auth.js` - OAuth2 PKCE authentication with Auth0
- `api-client.js` - Thoughtstream API communication  
- `storage-service.js` - Chrome storage wrapper
- `chrome-api.js` - Chrome API wrapper
- `config.js` - Centralized configuration
- `logger.js` - Production-safe logging system
- `offline-queue.js` - Handles failed saves for retry

## Development Commands

**To develop/test:**
1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click "Load unpacked" and select this directory
4. No build/compile step required - changes take effect on extension reload

**Debugging:**
- Enable debug mode: Open popup → Settings → Toggle "Debug Mode"
- View logs: Open service worker DevTools from `chrome://extensions/`
- Export logs: Available in popup settings when debug mode is on

## Key Architectural Patterns

**Message Flow:**
All components communicate through the service worker:
```
Popup/Content Script → chrome.runtime.sendMessage → Background → API
```

**Error Handling:**
Custom error hierarchy with specific error types:
- `NetworkError` - Connectivity issues
- `AuthError` - Authentication failures  
- `RateLimitError` - API rate limits
- `ContentExtractionError` - Content parsing failures

**Storage Keys:**
- `authData` - OAuth tokens and user info
- `savedArticles` - Cached articles (last 100)
- `offlineQueue` - Failed saves for retry
- `debugMode` - Development logging toggle

## API Configuration

- Production API: `https://prod-api.ideaflow.app/v1`
- Stage API: `https://stage-api.ideaflow.app/v1`
- Auth0 Domain: `ideaflow.auth0.com`
- Auth0 Client ID: `ZpX2kkoNfczUya7WChztcv2MGbiFs7T3`

## Current Status

**Working Features:**
- ✅ OAuth2 authentication with Auth0
- ✅ Save articles with content extraction
- ✅ Tag management (add/remove tags)
- ✅ Recent articles list with search
- ✅ Offline queue for failed saves
- ✅ Keyboard shortcuts and context menu

**Known Limitations:**
- ❌ Content fetching for Pocket imports only gets URLs/titles (no article content)
- ❌ Update note limitation - recreates entire content instead of updating
- ❌ Limited error handling UI feedback
- ❌ No tests exist in the project
- ❌ Search only covers last 100 articles
- ❌ No bulk operations support

## Development Guidelines

**Important:** Always inform me when you can't complete something rather than creating a mock version, unless explicitly given permission to create a mock.

**Chrome Extension Specifics:**
- Service workers don't have access to DOM or localStorage
- Use chrome.storage API instead of localStorage
- All chrome APIs are wrapped in `chrome-api.js` for promise support
- Content scripts run in isolated context from page scripts

**Security Considerations:**
- Never log sensitive data (tokens, user data)
- Content is sanitized before saving to prevent XSS
- PKCE flow ensures secure OAuth without client secret
- All API calls use HTTPS

## Logging Guidelines

- **CRITICAL RULE:** Never use `console.log` in this project
- Always use the `logger` module for all logging
- This ensures consistent logging, debug mode support, and potential log export functionality

## Common Tasks

**Add a new API endpoint:**
1. Add method to `api-client.js`
2. Add message handler in `background.js`
3. Call from popup/content script via `chrome.runtime.sendMessage`

**Debug authentication issues:**
1. Check auth data: `chrome.storage.local.get('authData')`
2. Enable debug mode and check logs
3. Verify token expiration and refresh logic

**Test offline functionality:**
1. Save an article
2. Go offline or block API domain
3. Try saving another article
4. Go online - should auto-retry

## Using Gemini CLI for Large Codebase Analysis

When working with large codebases or files exceeding context limits, use `gemini -p` with the `@` syntax to include files/directories:

### Quick Reference:
```bash
# Single file
gemini -p "@src/main.py Explain this file's purpose"

# Multiple files
gemini -p "@package.json @src/index.js Analyze dependencies"

# Entire directory
gemini -p "@src/ Summarize the architecture"

# Current directory
gemini -p "@./ Overview of entire project"
# Or: gemini --all_files -p "Analyze project structure"
```

### Common Use Cases:
```bash
# Check feature implementation
gemini -p "@src/ @lib/ Is dark mode implemented? Show relevant files"

# Verify authentication
gemini -p "@src/ @middleware/ Is JWT auth implemented? List endpoints"

# Find patterns
gemini -p "@src/ Any React hooks for WebSocket? List with paths"

# Security checks
gemini -p "@backend/ @api/ SQL injection protections? Show sanitization"

# Test coverage
gemini -p "@src/payment/ @tests/ Is payment module tested? List test cases"
```

### When to Use:
- Analyzing entire codebases or large directories
- Files totaling >100KB
- Comparing multiple large files
- Verifying feature implementations across codebase
- Finding coding patterns project-wide

**Note:** Paths after `@` are relative to where you run `gemini`

---

## Search Tool Preference

**ALWAYS use ripgrep (`rg`) instead of `grep`** when searching through code:

```bash
# Instead of: grep -r "pattern" .
# Use: rg "pattern"

# Instead of: grep -i "case-insensitive" file.txt
# Use: rg -i "case-insensitive" file.txt

# Instead of: find . -name "*.js" | xargs grep "pattern"
# Use: rg "pattern" -t js
```

**Why ripgrep is preferred:**
- Much faster than grep, especially on large codebases
- Automatically respects .gitignore files
- Better default behavior for code searching
- Built-in file type filtering with -t flag
- Smart case sensitivity by default
- Better Unicode support
```