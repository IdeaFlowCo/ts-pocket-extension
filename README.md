# IdeaPocket Chrome Extension

A powerful Chrome extension that provides a Pocket-like experience for saving articles, web pages, and text selections to Ideaflow.

## ✨ Features

### Core Functionality
- **One-click save** - Save any webpage to Ideaflow with a single click
- **Smart article extraction** - Automatically extracts article content, removing ads and navigation
- **Text selection saving** - Select any text and save it as a highlight with preserved links
- **Seamless tagging** - Add tags that auto-save as you type with visual feedback
- **Article management** - Delete saved articles directly from the extension popup
- **Full-text search** - Search across all your saved articles by title, URL, tags, and content
- **Offline support** - Failed saves are queued and automatically retried when back online

### Import & Export
- **Pocket import** - Import your entire Pocket library from export files (.zip or .csv)
- **Batch processing** - Real-time progress tracking during imports
- **Smart title extraction** - Generates meaningful titles even when Pocket export lacks them

### User Interface
- **Clean, modern popup** - Pocket-inspired interface with multiple views
- **Recent saves list** - View your last 100 saved articles with search and delete options
- **Tag autocomplete** - Suggests existing tags as you type with seamless saving
- **Multiple input methods** - Use keyboard shortcuts, context menu, or popup button
- **Smooth animations** - Polished transitions with cubic-bezier curves
- **Status notifications** - Real-time feedback for all actions

### Platform Integration
- **Twitter/X enhanced extraction** - Special handling for tweets including images and metadata
- **Context menu** - Right-click to save pages or selected text
- **Keyboard shortcut** - Customizable (default: Cmd+Shift+P on Mac, Ctrl+Shift+P on Windows/Linux)
- **Auto-sync** - Offline saves automatically sync when connection is restored

## 🚀 Installation

### From Chrome Web Store (Recommended)
1. Visit the [IdeaPocket Chrome Web Store page](https://chromewebstore.google.com/detail/ideapocket-save-to-ideafl/polpinilcbeglmjdjfmamnoenlaplnhm)
2. Click "Add to Chrome"
3. Follow the prompts to install

### For Development
1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run build:dev` to build the extension
4. Open Chrome and navigate to `chrome://extensions/`
5. Enable "Developer mode" in the top right
6. Click "Load unpacked" and select the `dist/` directory

## 🔧 Setup

1. **Click the IdeaPocket icon** in your browser toolbar
2. **Login with Ideaflow** - Uses secure OAuth2 authentication
3. **Start saving!** - You're ready to save articles and highlights

## 📖 Usage

### Save an Article
- **Method 1**: Click the IdeaPocket icon and then click "Save to Ideaflow"
- **Method 2**: Use keyboard shortcut (Cmd+Shift+P on Mac, Ctrl+Shift+P on Windows/Linux)
- **Method 3**: Right-click on any page and select "Save to IdeaPocket"

Articles are automatically saved with #ideapocket and #article tags.

### Save Text Selection
1. Select any text on a webpage
2. Right-click and choose "Save Selection as Highlight"
3. The selection is saved with #ideapocket and #highlight tags and preserves any links

### Add and Manage Tags
- **Seamless tagging**: Add tags after saving with automatic saving as you type
- **Tag management**: Remove individual tags by clicking the × button
- **Tag delimiters**: Use space, comma, or semicolon to separate tags
- **Autocomplete**: Start typing to see tag suggestions from your existing tags
- **Visual feedback**: Shimmer effects show when tags are being saved

### Search Saved Articles
- Use the search box in the popup to find articles
- Search works across titles, URLs, tags, and content
- Results update as you type
- Click any article to open it in a new tab

### Delete Articles
- **Individual deletion**: Click the × button on any saved article in the recent list
- **Current article**: Delete the currently saved article using the × button next to "Open in Ideaflow"
- **Confirmation dialogs**: All deletions require confirmation to prevent accidents

### Import from Pocket
1. Export your Pocket data from [getpocket.com/export](https://getpocket.com/export)
2. Click the import button in IdeaPocket
3. Select your exported .zip or .csv file
4. Monitor import progress in real-time

## 🛠️ Technical Details

### Architecture
- **Manifest V3** - Built on Chrome's modern extension platform
- **Service Worker** - Background script handles API calls and offline queue
- **Content Scripts** - Intelligent content extraction with special handlers for Twitter/X
- **TypeScript + esbuild** - Modern build process with bundling and type checking

### Data Storage
- **Chrome Storage API** - Secure local storage for settings and cached articles
- **Offline Queue** - Failed saves stored locally and retried automatically
- **Last 100 articles** - Cached for instant search and display

### Security & Privacy
- **OAuth2 PKCE** - Secure authentication flow with Auth0
- **HTTPS only** - All API communications are encrypted
- **Minimal permissions** - Only requests necessary permissions
- **No tracking** - See our [Privacy Policy](PRIVACY-POLICY.md) for details

### API Integration
- **Ideaflow API** - Full integration with Ideaflow's note-taking platform
- **Rate limiting** - Respects API limits (50 requests/minute)
- **Automatic retry** - Smart retry logic with exponential backoff

## 🔍 Troubleshooting

### "Not authenticated" error
- Click the settings icon and login with Ideaflow
- If already logged in, try logging out and back in

### Content not extracting properly
- Some websites may block content extraction
- The extension will fall back to saving just the URL and title
- Try refreshing the page before saving

### Save fails
- Check your internet connection
- Look for the offline indicator (badge on extension icon)
- Failed saves will retry automatically when online

### Import issues
- Ensure your Pocket export file is either .zip or .csv format
- Large imports may take several minutes
- Check the import progress indicator for status

## 🚦 Development

### Project Structure
```
├── manifest.json          # Extension configuration
├── background.js          # Service worker for API calls
├── content.js            # General content extraction
├── twitter-extractor.js  # Twitter-specific extraction
├── popup.html/js/css     # Extension popup UI
├── auth.js               # OAuth2 authentication
├── api-client.js         # Ideaflow API client
├── storage-service.js    # Chrome storage wrapper
├── offline-queue.js      # Offline save management
├── config.js             # Centralized configuration
└── logger.js             # Debug logging system
```

### Building for Development
```bash
npm run build:dev
```
This creates a development build in the `dist/` directory.

### Building for Production
```bash
npm run build
```
This creates a production build in the `dist/` directory and generates `ideapocket-production.zip` for Chrome Web Store submission.

### Debug Mode
1. Open popup → Settings
2. Enable "Debug Mode"
3. View logs in the popup or service worker DevTools

## 🗺️ Roadmap

- [ ] Bulk operations (archive, delete multiple)
- [ ] Enhanced reading view within extension
- [ ] Folder/category organization
- [ ] Mobile app sync
- [ ] Advanced filtering options
- [ ] Export functionality
- [ ] Browser bookmark sync

## 📄 License

Copyright © 2024 Ideaflow. All rights reserved.

## 🤝 Support

- **Issues**: [GitHub Issues](https://github.com/IdeaFlowCo/ts-pocket-extension/issues)
- **Email**: support@ideaflow.io
- **Website**: [ideaflow.app](https://ideaflow.app)