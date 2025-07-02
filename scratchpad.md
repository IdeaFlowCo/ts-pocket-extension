# Scratchpad: text-selection-highlight
## Started: Wed Jul  2 08:27:13 PDT 2025

### Initial Understanding
- What I think needs to be done:
  - Add ability to save selected text (not just full articles)
  - Create a context menu item for text selection
  - Save selections with #highlight tag
  - Similar flow to article saving but for text snippets
- Key files I expect to modify:
  - background.js (add context menu for selection)
  - content.js (handle text selection extraction)
  - api-client.js (might need to adjust note format)
  - config.js (add new constants/settings)
- Estimated complexity: Medium - need to understand current save flow first 

### Discovery Log

#### [08:30] - Initial exploration
- Starting point: Understanding the current save flow
- First file examined: background.js

Key discoveries:
1. Context menu already supports 'selection' context!
2. Content extraction is currently DISABLED (commented out in handleSave)
3. Notes use token-based format with paragraph objects
4. Current flow only saves URLs, not content

#### [08:35] - Context menu investigation
- What I expected: Need to add selection handling
- What I found: Context menu handler doesn't check info.selectionText!
- Impact on approach: The 'selection' context is defined but not utilized

The context menu click handler only calls handleSave(tab) without passing selection info. The `info` parameter contains selectionText when text is selected, but it's ignored.

#### [08:40] - handleSave function analysis
- handleSave accepts (tab, tags=[]) parameters
- Currently creates articleData with just URL and title
- Content extraction is COMPLETELY commented out (lines 267-329)
- Saves to Thoughtstream using token format
- No support for selected text whatsoever

#### [08:45] - saveToThoughtstream analysis
- Creates note with token array structure
- First paragraph contains hashtags (always includes #pocket)
- Second paragraph contains the URL as text
- Could easily add a third paragraph with selected text!
- Uses generateShortId() for unique IDs

### Files Discovered
- `background.js` - Main service worker, handles all messages and API calls
- `content.js` - Has extraction logic but currently unused
- `config.js` - Need to check for any relevant constants

### Architecture Insights
- How the system actually works:
  - All actions go through message passing to service worker
  - Service worker handles everything: auth, saves, API calls
  - Current save flow ONLY handles full page saves, no selection support
  - Message handler has clear action types (save, updateTags, etc.)
- Hidden dependencies:
  - chromeApi wrapper for promise-based Chrome APIs
  - storageService abstracts Chrome storage
  - Logger with production-safe logging
- Unexpected interactions:
  - updateNoteWithTags uses OLD format (text field) not token format!
  - Content extraction is disabled but infrastructure exists

#### [08:50] - Created test implementation
- Created test-selection.js to prototype the feature
- Key insights:
  1. Need to modify context menu handler to check info.selectionText
  2. Create separate handleSaveSelection function
  3. Use different token structure for selections (3 paragraphs)
  4. Can use marks like 'blockquote' or 'link' for styling

#### [08:55] - Marks investigation
- Current code only uses empty marks: []
- No examples of styled text (bold, links, etc.)
- Safer to just use plain text without marks

### Gotchas & Pitfalls
1. **Gotcha #1**: Marks array always empty - don't try fancy formatting
2. **Gotcha #2**: pageUrl vs tab.url - context menu provides pageUrl
3. **Gotcha #3**: Need to handle multi-line selections (newlines)

#### [09:00] - Message passing discovery
- There's an 'extractContent' message sent to content scripts
- This is inside the commented out extractArticleContent function
- Could reuse this pattern for selection extraction

### Judgment Calls
1. **Decision**: Create new message type 'saveSelection' vs reuse 'save'
   - Better to create new type for clarity
2. **Trade-off**: Separate function vs modify existing handleSave
   - Separate is cleaner, avoids breaking existing functionality

#### [09:05] - Implementation approach refined
- Created cleaner selection-handler.js
- Decided on token structure:
  1. #highlight tag
  2. Source title
  3. URL
  4. Empty line
  5. Selected text
- Store highlights in same savedArticles with isHighlight flag

### Questions Answered
- Q: How should we format the selection in tokens?
  A: Simple paragraphs, no fancy marks
- Q: Where to store highlights?
  A: Same savedArticles array with isHighlight flag

#### [09:10] - Popup UI investigation
- Popup renders articles with title, URL, and tags
- Could add visual indicator for highlights (icon or badge)
- Description field could show preview of selected text

### Dead Ends Explored
- Considered using marks array for formatting - not supported
- Thought about separate storage - better to use same array

### Performance Considerations
- No performance issues expected
- Selection saves are lighter than full article saves

### Security Considerations
- Selected text is user-controlled, should be safe
- No XSS risk as we're using text content only

### Key Learnings
1. Context menu already supports selection context - just unused!
2. Token format is simple: just paragraphs with text content
3. All saves go through service worker message passing

### Implementation Plan (Refined)
1. First, modify context menu handler to check for selectionText
2. Add handleSaveSelection and saveSelectionToThoughtstream functions
3. Update message handler to support new 'saveSelection' action
4. Test with various text selections
5. Optional: Update popup UI to show highlight indicator

### Time Analysis
- Discovery time: 45 minutes
- Estimated clean implementation: 20 minutes
- Complexity reduced from: MEDIUM to LOW

### Questions for Review
- Should we add a different icon for highlights in popup?
- Do we want to support keyboard shortcut for selection save?
- Should highlights have a character limit?

### Final Insights
- Main challenge was: Understanding the token format and message flow
- Solution approach: Reuse existing patterns, minimal changes
- Future considerations: Could add rich text support later if API supports marks
