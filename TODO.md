# TsPocket - Critical Unfinished Features

## 🔴 Blockers (Must Fix Before Use)

1. **API Base URL Confirmation** ✅ FIXED
   - Now using: `https://stage-api.ideaflow.app/v1`
   - Location: `background.js` line 5

2. **Authentication Implementation** ✅ FIXED
   - Secure OAuth2 PKCE flow implemented
   - Users login with their Thoughtstream credentials
   - Auto-fills user ID from Auth0
   - Files: `auth.js`, `background.js`, `popup.js`

3. **Auth0 Credentials** ✅ SECURE
   - Using SPA Client ID: ZpX2kkoNfczUya7WChztcv2MGbiFs7T3
   - No client secret needed (secure PKCE flow)

## 🟡 Important Missing Features

4. **Content Fetching for Imports**
   - Pocket import only saves URLs/titles, no content
   - Consider fetching article content during import
   - Or integrate Firecrawl API for better extraction

5. **Update Note Limitation**
   - Post-save tag updates recreate entire note content
   - Should ideally just prepend tags to first line
   - Risk of data loss if note was edited elsewhere

6. **Error Handling**
   - No user-friendly error messages for API failures
   - Should show specific errors (rate limit, auth, network)

## 🟢 Nice-to-Have Features

7. **Reading View**
   - No in-extension reader like Pocket has
   - Currently just opens original URL

8. **Bulk Operations**
   - Can't select multiple articles
   - No bulk delete/archive/tag

9. **Full-Text Search**
   - Only searches last 100 saved articles
   - Should search all Thoughtstream notes with #pocket tag

10. **Mobile Support**
    - Chrome extension only
    - No mobile app or PWA

## 📝 Known Limitations

- **Offline Support**: Planned but not implemented (see comments in code)
- **Archive vs Active**: No separation like Pocket has
- **Highlights**: Can't highlight text within articles
- **Share Features**: No public links or social sharing

## 🚀 Quick Start for Testing

1. Clone and load extension in Chrome developer mode
2. Get Thoughtstream API URL and add to `background.js:5`
3. Get Auth0 credentials and set up authentication
4. Enter your Thoughtstream user ID in settings
5. For now, manually set auth token in Chrome DevTools:
   ```javascript
   chrome.storage.local.set({ authToken: 'your-token-here' })
   ```

## 🐛 Testing Checklist

- [ ] Verify API base URL works
- [ ] Test save article functionality
- [ ] Test post-save tagging
- [ ] Test search feature
- [ ] Test Pocket import with small file
- [ ] Check rate limiting works
- [ ] Verify all saved articles appear in Thoughtstream