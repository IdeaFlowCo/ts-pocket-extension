# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TsPocket is a Chrome Extension that provides a Pocket-like interface for saving articles to Thoughtstream/Ideaflow. Despite the folder name "ts-pocket-extension", this is a pure JavaScript project (no TypeScript).

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

## Development

**To develop/test:**
1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click "Load unpacked" and select this directory
4. No build/compile step required

**API Configuration:**
- Production API: `https://prod-api.ideaflow.app/v1`
- Auth0 Domain: `ideaflow.auth0.com`
- Auth0 Client ID: `ZpX2kkoNfczUya7WChztcv2MGbiFs7T3`

## Important Context

**Current Status (from TODO.md):**
- ✅ OAuth2 authentication is implemented and working
- ❌ Content fetching for Pocket imports only gets URLs/titles (no article content)
- ❌ Update note limitation - recreates entire content instead of updating
- ❌ Limited error handling UI
- ❌ No tests exist in the project

**Known Limitations:**
- Search only covers last 100 articles
- No offline functionality
- No bulk operations
- No mobile support

## Development Guidelines

remember, i would prefer you tell me when you cant finish something rather than just make a mock version, unless i have explicitly given you permission to make a mock version instead. I always want to be informed about this.

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.