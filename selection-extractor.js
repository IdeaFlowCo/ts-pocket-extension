// Content script for extracting selection with link information

// Function to extract selection with links
function extractSelectionWithLinks() {
  const selection = window.getSelection();
  
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  
  const range = selection.getRangeAt(0);
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());
  
  // Extract plain text
  const plainText = selection.toString().trim();
  
  if (!plainText) {
    return null;
  }
  
  // Extract links from the selection
  const links = [];
  const anchors = container.querySelectorAll('a[href]');
  
  anchors.forEach(anchor => {
    const href = anchor.getAttribute('href');
    const text = anchor.textContent.trim();
    
    if (href && text) {
      // Make absolute URL
      let absoluteUrl = href;
      try {
        absoluteUrl = new URL(href, window.location.href).href;
      } catch (e) {
        // Invalid URL, use as-is
      }
      
      links.push({
        text: text,
        url: absoluteUrl,
        position: plainText.indexOf(text) // Approximate position in selection
      });
    }
  });
  
  // Get selection context (surrounding text)
  const contextLength = 50;
  const fullText = document.body.innerText || '';
  const selectionStart = fullText.indexOf(plainText);
  const contextStart = Math.max(0, selectionStart - contextLength);
  const contextEnd = Math.min(fullText.length, selectionStart + plainText.length + contextLength);
  
  const contextBefore = fullText.substring(contextStart, selectionStart).trim();
  const contextAfter = fullText.substring(selectionStart + plainText.length, contextEnd).trim();
  
  return {
    text: plainText,
    links: links,
    hasLinks: links.length > 0,
    context: {
      before: contextBefore,
      after: contextAfter
    },
    pageInfo: {
      url: window.location.href,
      title: document.title
    }
  };
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractSelection') {
    const selectionData = extractSelectionWithLinks();
    sendResponse(selectionData);
  }
  return true; // Keep message channel open for async response
});

// Also listen for the context menu being opened
document.addEventListener('contextmenu', (e) => {
  const selectionData = extractSelectionWithLinks();
  
  if (selectionData) {
    // Store the selection data temporarily
    chrome.runtime.sendMessage({
      action: 'storeSelectionData',
      data: selectionData
    });
  }
});