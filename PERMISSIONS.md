# TsPocket Permissions Justification

This document explains why each permission is required for the TsPocket extension.

## Manifest Permissions

### `activeTab`
**Required for**: Extracting article content from the current tab
- Used when user clicks the extension icon or uses keyboard shortcut
- Allows sending messages to content script to extract article text
- Minimal permission that only grants access to the current tab

### `storage`
**Required for**: Storing user preferences and saved articles history
- Stores Auth0 authentication token
- Stores user ID
- Maintains local history of recently saved articles (last 100)
- Stores first-use flag for onboarding

### `contextMenus`
**Required for**: Right-click "Save to TsPocket" functionality
- Creates context menu item for quick saving
- Provides familiar Pocket-like UX

## Host Permissions

### `https://api.thoughtstream.io/*`
**Required for**: Core functionality - saving articles to Thoughtstream
- All API calls to create notes
- User authentication and management
- This is the primary backend service

### `https://thoughtstream.us.auth0.com/*`
**Required for**: Authentication
- OAuth token requests
- User authentication flow
- Required for secure API access

## Content Scripts

### `matches: ["http://*/*", "https://*/*"]`
**Required for**: Article content extraction
- Runs on all web pages to enable article extraction
- Uses intelligent content detection to find main article
- Removes ads, navigation, and other clutter
- Only activates when user initiates save action

## Permissions NOT Used

We specifically do NOT request these common but unnecessary permissions:
- `tabs`: We only use `activeTab` for current tab access
- `<all_urls>` host permission: We only need specific API endpoints
- `webRequest`: Not needed for our functionality
- `cookies`: Authentication handled via storage API
- `downloads`: Articles saved to Thoughtstream, not local files
- `history`: We don't access browsing history

## Privacy Commitment

- Content extraction only happens when user explicitly saves
- No background tracking or automatic content analysis
- API calls only made to Thoughtstream and Auth0
- Local storage used only for user preferences and recent saves