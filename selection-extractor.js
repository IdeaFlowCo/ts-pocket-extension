// Content script for extracting selection with link information

// Function to clean selection text by removing link markup
function cleanSelectionText(container, plainText) {
  try {
    // Create a working copy of the container
    const workingContainer = container.cloneNode(true);
    
    // Replace all anchor tags with markdown format
    const anchors = workingContainer.querySelectorAll('a[href]');
    anchors.forEach(anchor => {
      const href = anchor.getAttribute('href');
      const text = anchor.textContent;
      
      if (href && text && anchor.parentNode) {
        // Replace the anchor with just its text content (remove the link)
        const textNode = document.createTextNode(text);
        try {
          anchor.parentNode.replaceChild(textNode, anchor);
        } catch (e) {
          // If replacement fails, just continue
          console.warn('Failed to replace anchor:', e);
        }
      }
    });
    
    // Get the cleaned text
    let cleanedText = workingContainer.textContent || '';
    
    // Clean up extra whitespace and normalize line breaks
    cleanedText = cleanedText
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
    
    return cleanedText;
  } catch (error) {
    console.error('Error converting to markdown:', error);
    // Fallback to plain text
    return plainText;
  }
}

// Function to extract selection with links
function extractSelectionWithLinks() {
  try {
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
  
  anchors.forEach((anchor, index) => {
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
  
  // Generate cleaned version of the selection (with links removed)
  let cleanedText = plainText; // Default to plain text
  try {
    cleanedText = cleanSelectionText(container, plainText);
  } catch (e) {
    console.error('Text cleaning failed:', e);
  }
  
  const result = {
    text: plainText,
    markdownText: cleanedText,
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
  
  return result;
  } catch (error) {
    console.error('Error extracting selection:', error);
    // Return basic selection data as fallback
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    
    return {
      text: text,
      markdownText: text,
      links: [],
      hasLinks: false,
      context: {
        before: '',
        after: ''
      },
      pageInfo: {
        url: window.location.href,
        title: document.title
      }
    };
  }
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractSelection') {
    // Don't respond if we're on Twitter/X - let the Twitter extractor handle it
    if (window.location.hostname === 'twitter.com' || window.location.hostname === 'x.com') {
      console.log('Selection extractor: Deferring to Twitter extractor');
      return false; // Let other content scripts handle this
    }
    
    const selectionData = extractSelectionWithLinks();
    sendResponse(selectionData);
    return true; // Keep message channel open
  }
});

// Also listen for the context menu being opened
document.addEventListener('contextmenu', (e) => {
  // Don't store data if we're on Twitter/X - let the Twitter extractor handle it
  if (window.location.hostname === 'twitter.com' || window.location.hostname === 'x.com') {
    console.log('Selection extractor: Not storing data on Twitter/X');
    return;
  }
  
  const selectionData = extractSelectionWithLinks();
  
  if (selectionData) {
    // Store the selection data temporarily
    chrome.runtime.sendMessage({
      action: 'storeSelectionData',
      data: selectionData
    });
  }
});