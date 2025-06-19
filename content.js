// Content script for TsPocket - Enhanced article extraction

// Article extraction using Readability-inspired techniques
function extractArticleContent() {
  // Get page metadata
  const metadata = extractMetadata();
  
  // Try multiple strategies to find main content
  const content = extractMainContent();
  
  // Extract images if present
  const images = extractImages(content.element);
  
  return {
    title: metadata.title,
    url: window.location.href,
    description: metadata.description,
    author: metadata.author,
    publishedTime: metadata.publishedTime,
    content: content.text,
    contentHtml: content.html,
    images: images,
    domain: window.location.hostname,
    savedAt: new Date().toISOString()
  };
}

// Extract page metadata
function extractMetadata() {
  const metadata = {
    title: document.title,
    description: '',
    author: '',
    publishedTime: ''
  };
  
  // Try to get better title
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const twitterTitle = document.querySelector('meta[name="twitter:title"]');
  const h1 = document.querySelector('h1');
  
  if (ogTitle?.content) {
    metadata.title = ogTitle.content;
  } else if (twitterTitle?.content) {
    metadata.title = twitterTitle.content;
  } else if (h1?.textContent) {
    metadata.title = h1.textContent.trim();
  }
  
  // Get description
  const metaDesc = document.querySelector('meta[name="description"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  const twitterDesc = document.querySelector('meta[name="twitter:description"]');
  
  metadata.description = ogDesc?.content || twitterDesc?.content || metaDesc?.content || '';
  
  // Get author
  const authorMeta = document.querySelector('meta[name="author"]');
  const articleAuthor = document.querySelector('[itemprop="author"]');
  const byline = document.querySelector('.byline, .author, .by');
  
  if (authorMeta?.content) {
    metadata.author = authorMeta.content;
  } else if (articleAuthor?.textContent) {
    metadata.author = articleAuthor.textContent.trim();
  } else if (byline?.textContent) {
    metadata.author = byline.textContent.replace(/^by\s+/i, '').trim();
  }
  
  // Get published time
  const timeMeta = document.querySelector('meta[property="article:published_time"]');
  const timeElement = document.querySelector('time[datetime]');
  
  if (timeMeta?.content) {
    metadata.publishedTime = timeMeta.content;
  } else if (timeElement?.getAttribute('datetime')) {
    metadata.publishedTime = timeElement.getAttribute('datetime');
  }
  
  return metadata;
}

// Extract main content
function extractMainContent() {
  // Candidates for main content
  const candidates = [
    document.querySelector('article'),
    document.querySelector('[role="main"]'),
    document.querySelector('main'),
    document.querySelector('.post-content'),
    document.querySelector('.entry-content'),
    document.querySelector('.article-content'),
    document.querySelector('.content'),
    document.querySelector('#content'),
    // Medium-specific
    document.querySelector('.postArticle-content'),
    // Substack-specific
    document.querySelector('.post-content'),
    // News sites
    document.querySelector('.story-body'),
    document.querySelector('.article-body')
  ].filter(Boolean);
  
  // Score candidates based on text density and structure
  let bestCandidate = null;
  let bestScore = 0;
  
  candidates.forEach(candidate => {
    const score = scoreCandidate(candidate);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  });
  
  // Fallback to body if no good candidate
  if (!bestCandidate) {
    bestCandidate = document.body;
  }
  
  // Clean and extract content
  const cleanedContent = cleanContent(bestCandidate.cloneNode(true));
  
  return {
    element: bestCandidate,
    text: extractText(cleanedContent),
    html: cleanedContent.innerHTML
  };
}

// Score a candidate element
function scoreCandidate(element) {
  let score = 0;
  
  // Base score on tag name
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'article') score += 50;
  if (tagName === 'main') score += 40;
  
  // Score based on class/id
  const classAndId = `${element.className} ${element.id}`.toLowerCase();
  if (classAndId.match(/article|post|content|entry|text/)) score += 30;
  if (classAndId.match(/sidebar|comment|footer|header|menu|nav/)) score -= 50;
  
  // Score based on text density
  const textLength = element.textContent.length;
  const linkDensity = getLinkDensity(element);
  
  score += Math.min(textLength / 100, 30);
  score -= linkDensity * 30;
  
  // Score based on paragraph count
  const paragraphs = element.querySelectorAll('p');
  score += Math.min(paragraphs.length * 5, 30);
  
  return score;
}

// Get link density
function getLinkDensity(element) {
  const textLength = element.textContent.length;
  if (textLength === 0) return 1;
  
  const linkLength = Array.from(element.querySelectorAll('a'))
    .reduce((sum, link) => sum + link.textContent.length, 0);
  
  return linkLength / textLength;
}

// Clean content
function cleanContent(element) {
  // Remove unwanted elements
  const unwantedSelectors = [
    'script', 'style', 'noscript', 'iframe', 'object', 'embed',
    'nav', 'header', 'footer', '.sidebar', '.comments', '.comment',
    '.share', '.social', '.advertisement', '.ads', '.related',
    '[class*="sidebar"]', '[class*="comment"]', '[id*="comment"]',
    '[class*="share"]', '[class*="social"]', '[class*="newsletter"]'
  ];
  
  unwantedSelectors.forEach(selector => {
    element.querySelectorAll(selector).forEach(el => el.remove());
  });
  
  // Clean attributes
  element.querySelectorAll('*').forEach(el => {
    // Keep only essential attributes
    const keepAttrs = ['href', 'src', 'alt', 'title'];
    Array.from(el.attributes).forEach(attr => {
      if (!keepAttrs.includes(attr.name)) {
        el.removeAttribute(attr.name);
      }
    });
  });
  
  return element;
}

// Extract formatted text with structure preservation (80/20 approach)
function extractText(element) {
  const blocks = [];
  const maxLength = 50000;
  let currentLength = 0;
  
  // Walk through the DOM and extract structured content
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        // Skip hidden elements
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return NodeFilter.FILTER_REJECT;
        }
        
        // Accept content elements
        const tag = node.tagName.toLowerCase();
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'blockquote', 'pre'].includes(tag)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        
        return NodeFilter.FILTER_SKIP;
      }
    }
  );
  
  let node;
  const processedNodes = new Set();
  
  while ((node = walker.nextNode()) && currentLength < maxLength) {
    // Skip if we've already processed this node (nested elements)
    if (processedNodes.has(node)) continue;
    
    const tag = node.tagName.toLowerCase();
    let text = '';
    
    switch (tag) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        text = `${'#'.repeat(parseInt(tag[1]))} ${node.textContent.trim()}\n\n`;
        processedNodes.add(node);
        break;
        
      case 'p':
        const content = node.textContent.trim();
        if (content) {
          text = `${content}\n\n`;
          processedNodes.add(node);
        }
        break;
        
      case 'ul':
      case 'ol':
        const items = Array.from(node.querySelectorAll(':scope > li'));
        if (items.length > 0) {
          const listText = items.map((li, index) => {
            processedNodes.add(li);
            const prefix = tag === 'ul' ? '• ' : `${index + 1}. `;
            return `${prefix}${li.textContent.trim()}`;
          }).join('\n');
          text = `${listText}\n\n`;
          processedNodes.add(node);
        }
        break;
        
      case 'blockquote':
        const quoteText = node.textContent.trim();
        if (quoteText) {
          text = `> ${quoteText.replace(/\n/g, '\n> ')}\n\n`;
          processedNodes.add(node);
        }
        break;
        
      case 'pre':
        // Preserve code formatting
        const codeElement = node.querySelector('code');
        const codeText = (codeElement || node).textContent;
        const language = detectCodeLanguage(node, codeElement);
        text = `\`\`\`${language}\n${codeText}\n\`\`\`\n\n`;
        processedNodes.add(node);
        if (codeElement) processedNodes.add(codeElement);
        break;
    }
    
    if (text) {
      blocks.push(text);
      currentLength += text.length;
    }
  }
  
  // Join all blocks and clean up excessive newlines
  let result = blocks.join('').trim();
  result = result.replace(/\n{4,}/g, '\n\n\n'); // Max 3 newlines
  
  if (result.length > maxLength) {
    result = result.substring(0, maxLength) + '...';
  }
  
  return result;
}

// Helper function to detect code language
function detectCodeLanguage(preElement, codeElement) {
  // Check class names for language hints
  const element = codeElement || preElement;
  const className = element.className || '';
  
  // Common patterns: language-js, lang-python, hljs-javascript, etc.
  const langMatch = className.match(/(?:language-|lang-|hljs-)(\w+)/);
  if (langMatch) return langMatch[1];
  
  // Check data attributes
  const dataLang = element.dataset.lang || element.dataset.language;
  if (dataLang) return dataLang;
  
  // Common language detection by content patterns
  const content = element.textContent;
  if (content.includes('function') && content.includes('{')) return 'javascript';
  if (content.includes('def ') && content.includes(':')) return 'python';
  if (content.includes('<?php')) return 'php';
  if (content.includes('<html') || content.includes('</div>')) return 'html';
  if (content.includes('SELECT') && content.includes('FROM')) return 'sql';
  
  return ''; // No language specified
}

// Extract images
function extractImages(element) {
  const images = [];
  const imgElements = element.querySelectorAll('img');
  
  imgElements.forEach((img, index) => {
    if (index >= 5) return; // Limit to 5 images
    
    const src = img.src || img.dataset.src;
    if (src && !src.includes('data:image')) {
      images.push({
        src: src,
        alt: img.alt || '',
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height
      });
    }
  });
  
  return images;
}

// Listen for extraction requests from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractContent') {
    try {
      const content = extractArticleContent();
      sendResponse({ success: true, content });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true; // Keep message channel open for async response
});

// Auto-detect when to show save button (optional enhancement)
(function() {
  // Check if this looks like an article
  const isArticle = document.querySelector('article') || 
                   document.querySelector('.post-content') ||
                   (document.querySelectorAll('p').length > 5);
  
  if (isArticle) {
    // Send message to background to update badge
    chrome.runtime.sendMessage({ 
      action: 'pageAnalyzed', 
      isArticle: true 
    });
  }
})();