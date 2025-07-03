# IdeaPocket Chrome Extension

A Chrome extension that provides a Pocket-like experience for saving articles to Thoughtstream.

## Features

- **One-click save**: Save any webpage to Thoughtstream with a single click
- **Smart article extraction**: Automatically extracts article content, removing ads and navigation
- **Metadata capture**: Saves title, author, publication date, and description
- **Hashtag organization**: Automatically adds #pocket hashtag to saved articles
- **Recent saves**: View your recently saved articles in the popup
- **Keyboard shortcut**: Cmd+Shift+P (Mac) / Ctrl+Shift+P (Windows/Linux)
- **Context menu**: Right-click to save pages

## Installation

1. Create icon files (icon-16.png, icon-32.png, icon-48.png, icon-128.png) in the extension directory
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `ts-pocket-extension` directory

## Setup

**IMPORTANT**: The API base URL needs to be confirmed. Currently set to `https://api.thoughtstream.io` in background.js line 5.

1. Click the IdeaPocket icon in your browser toolbar
2. Click the settings gear icon
3. Enter your Thoughtstream User ID
4. Set up authentication (currently requires manual token configuration)

## Usage

### Save an Article
- **Method 1**: Click the IdeaPocket icon and then click "Save to Thoughtstream"
- **Method 2**: Use the keyboard shortcut Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux)
- **Method 3**: Right-click on any page and select "Save to IdeaPocket"

### View Recent Saves
- Click the IdeaPocket icon to see your 5 most recent saves
- Click on any saved article to open it in a new tab

## Technical Details

### Article Storage Format
Articles are saved as notes in Thoughtstream with the following format:
```
#pocket

[Article Title]

By [Author]
Published: [Date]

[Description]

[Article Content]

---
URL: [Original URL]
Domain: [Website Domain]
Saved: [Save Date/Time]
```

### Authentication
The extension requires Auth0 authentication to connect to Thoughtstream. Currently, you need to:
1. Obtain Auth0 credentials for Thoughtstream
2. Set the auth token in the extension

## Development

### Project Structure
- `manifest.json` - Chrome extension configuration
- `background.js` - Service worker handling saves and API calls
- `content.js` - Content script for article extraction
- `popup.html/css/js` - Extension popup UI
- `icon-*.png` - Extension icons (need to be created)

### API Integration
The extension uses the Thoughtstream API to:
- Save notes with the `/notes` endpoint
- Add to search index with `/simon/add-note`
- Manage authentication via Auth0

## Future Enhancements

- [ ] Full OAuth flow for authentication
- [ ] Tag management and custom tags
- [ ] Bulk operations (archive, delete)
- [ ] Reading view within extension
- [ ] Sync with mobile devices
- [ ] Import from Pocket
- [ ] Offline support
- [ ] Custom folders/categories

## Troubleshooting

### "Not authenticated" error
- Ensure you have set up Auth0 credentials
- Check that the auth token is valid

### Content not extracting properly
- Some websites may block content extraction
- Try refreshing the page before saving
- Check the console for any errors

### Save fails
- Verify internet connection
- Check Thoughtstream API status
- Ensure auth token hasn't expired