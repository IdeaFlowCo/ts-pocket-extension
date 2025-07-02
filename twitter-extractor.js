// Twitter/X specific content script for extracting tweet context

console.log('🚀 TsPocket: Twitter extractor script LOADED at', new Date().toISOString());
console.log('🚀 TsPocket: Current URL:', window.location.href);
console.log('🚀 TsPocket: Hostname:', window.location.hostname);

// Don't run on load - Twitter loads tweets dynamically
// We'll run it when the user actually selects text

// Your exact script for finding tweets
function getTweetData() {
  const tweets = document.querySelectorAll('article');

  function getCount(article, testid) {
    const btn = article.querySelector(`div[data-testid="${testid}"], button[data-testid="${testid}"]`);
    if (!btn) return 0;
    const candidates = btn.querySelectorAll('span, div');
    for (const el of candidates) {
      const txt = el.textContent.trim();
      if (/^\d+([.,]\d+)?([KM]?)$/.test(txt)) {
        return txt;
      }
    }
    return 0;
  }

  // Function to get the tweet link
  function getTweetLink(article) {
    // Find all anchor tags with href matching /username/status/tweet_id
    const anchors = article.querySelectorAll('a');
    for (const a of anchors) {
      if (a.href && /twitter\.com\/[^\/]+\/status\/\d+/.test(a.href)) {
        return a.href.replace('twitter.com', 'x.com');
      }
      // For relative hrefs (e.g., /username/status/1234567890)
      if (a.getAttribute('href') && /^\/[^\/]+\/status\/\d+$/.test(a.getAttribute('href'))) {
        return `https://x.com${a.getAttribute('href')}`;
      }
    }
    return null;
  }

  // Function to extract images from a tweet
  function getTweetImages(article, tweetLink) {
    const images = [];
    
    // Find all img elements that are media images
    const imgElements = article.querySelectorAll('img');
    console.log(`🔍 TsPocket: Checking ${imgElements.length} images in tweet`);
    
    imgElements.forEach(img => {
      const alt = img.getAttribute('alt') || '';
      const src = img.src || '';
      
      // Filter logic - only include actual tweet media
      // Based on your working script, simplify the filter
      if (alt.toLowerCase() === 'profile image' || 
          src.includes('profile_images') || 
          src.includes('emoji')) {
        return; // Skip this image
      }
      
      // Only include images from Twitter's media CDN
      if (!src.includes('pbs.twimg.com') && !src.includes('video.twimg.com')) {
        return; // Skip non-media images
      }
      
      // Try to find the parent link that wraps this image
      let imageLink = null;
      let parent = img.parentElement;
      
      // Walk up the DOM tree to find a link that contains /photo/
      while (parent && parent !== article) {
        if (parent.tagName === 'A' && parent.href) {
          // Check if this is a photo link
          if (parent.href.includes('/photo/')) {
            imageLink = parent.href;
            break;
          }
        }
        parent = parent.parentElement;
      }
      
      // If no direct photo link found, construct one from the tweet link
      if (!imageLink && tweetLink) {
        // Extract photo number from the image URL if possible
        const photoMatch = src.match(/\/(\d+)\?/);
        if (photoMatch) {
          imageLink = `${tweetLink}/photo/${photoMatch[1]}`;
        } else {
          // Default to /photo/1 for the first image
          const existingPhotoCount = images.length;
          imageLink = `${tweetLink}/photo/${existingPhotoCount + 1}`;
        }
      }
      
      images.push({
        src: src,
        alt: alt || 'Tweet image',
        link: imageLink
      });
      
      console.log(`✅ TsPocket: Added image ${images.length}:`, src.substring(0, 50) + '...');
    });
    
    console.log(`🖼️ TsPocket: Found ${images.length} valid images in tweet`);
    return images;
  }

  console.log(`📊 TsPocket: Found ${tweets.length} article elements`);
  
  const tweetData = Array.from(tweets).map(article => {
    const textElem = article.querySelector('div[lang]');
    const timeElem = article.querySelector('time');
    const tweetLink = getTweetLink(article);
    const images = getTweetImages(article, tweetLink);
    
    return {
      article: article, // Keep reference to the article element
      text: textElem ? textElem.innerText : null,
      time: timeElem ? timeElem.getAttribute('datetime') : null,
      likes: getCount(article, "like"),
      retweets: getCount(article, "retweet"),
      replies: getCount(article, "reply"),
      link: tweetLink,
      images: images.length > 0 ? images : null
    };
  });

  console.log('📊 TsPocket: Tweet data from your script:', tweetData);
  tweetData.forEach((tweet, index) => {
    if (tweet.link) {
      console.log(`Tweet ${index + 1}: ${tweet.link}`);
      console.log(`Text preview: ${tweet.text ? tweet.text.substring(0, 50) + '...' : 'No text'}`);
      if (tweet.images) {
        console.log(`Images: ${tweet.images.length} image(s) found`);
        tweet.images.forEach((img, imgIndex) => {
          console.log(`  Image ${imgIndex + 1}: ${img.link || 'No permalink'}`);
        });
      }
    }
  });
  
  return tweetData;
}

// Function to find the tweet containing selected text
function findTweetWithText(selectedText) {
  if (!selectedText) return null;
  
  console.log('TsPocket: Looking for tweet containing:', selectedText);
  
  // Get all tweet data using your exact script
  const tweetData = getTweetData();
  
  // If no tweets found, warn the user
  if (tweetData.length === 0) {
    console.warn('⚠️ TsPocket: No tweets found on page! Twitter may still be loading.');
  }
  
  // Find the tweet that contains the selected text
  for (const tweet of tweetData) {
    if (tweet.text && tweet.text.includes(selectedText)) {
      console.log('TsPocket: Found matching tweet!', {
        link: tweet.link,
        text: tweet.text.substring(0, 100) + '...',
        hasImages: !!tweet.images,
        imageCount: tweet.images ? tweet.images.length : 0
      });
      return {
        article: tweet.article,
        link: tweet.link,
        text: tweet.text,
        images: tweet.images
      };
    }
  }
  
  console.log('TsPocket: No tweet found containing the selected text');
  return null;
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 TsPocket: Received message:', request.action);
  
  if (request.action === 'extractSelection') {
    // Only respond if we're on Twitter/X
    if (window.location.hostname === 'twitter.com' || window.location.hostname === 'x.com') {
      console.log('🎯 TsPocket: Twitter extractor handling extractSelection request');
      
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();
      
      if (!selectedText) {
        sendResponse(null);
        return true;
      }
      
      // Find the tweet containing this text
      const tweetInfo = findTweetWithText(selectedText);
      
      if (tweetInfo && tweetInfo.link) {
        // Create enhanced selection data
        const selectionData = {
          text: selectedText,
          markdownText: selectedText,
          links: [],
          hasLinks: false,
          pageInfo: {
            url: tweetInfo.link, // Use the tweet URL instead of x.com/home
            originalUrl: window.location.href,
            title: `Tweet`,
            platform: 'twitter'
          },
          tweetInfo: {
            url: tweetInfo.link,
            fullText: tweetInfo.text,
            images: tweetInfo.images
          }
        };
        
        console.log('TsPocket: Sending enhanced data with tweet URL:', tweetInfo.link);
        if (tweetInfo.images) {
          console.log('TsPocket: Including images:', tweetInfo.images.length);
        }
        console.log('TsPocket: Full selection data being sent:', JSON.stringify(selectionData, null, 2));
        sendResponse(selectionData);
      } else {
        console.log('⚠️ TsPocket: No matching tweet found, using fallback');
        // Fallback if no tweet found
        sendResponse({
          text: selectedText,
          markdownText: selectedText,
          links: [],
          hasLinks: false,
          pageInfo: {
            url: window.location.href,
            title: document.title
          }
        });
      }
      
      return true; // Keep message channel open
    }
  }
  return false;
});

// Also listen for context menu events
document.addEventListener('contextmenu', (e) => {
  console.log('🖱️ TsPocket: Context menu opened on', window.location.hostname);
  
  if (window.location.hostname === 'twitter.com' || window.location.hostname === 'x.com') {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    console.log('🖱️ TsPocket: Selected text:', selectedText ? `"${selectedText.substring(0, 50)}..."` : 'None');
    
    if (selectedText) {
      // Find the tweet and store the data
      const tweetInfo = findTweetWithText(selectedText);
      
      if (tweetInfo && tweetInfo.link) {
        const selectionData = {
          text: selectedText,
          markdownText: selectedText,
          links: [],
          hasLinks: false,
          pageInfo: {
            url: tweetInfo.link,
            originalUrl: window.location.href,
            title: `Tweet`,
            platform: 'twitter'
          },
          tweetInfo: {
            url: tweetInfo.link,
            fullText: tweetInfo.text,
            images: tweetInfo.images
          }
        };
        
        // Store the enhanced data
        chrome.runtime.sendMessage({
          action: 'storeSelectionData',
          data: selectionData
        });
      }
    }
  }
});

console.log('✅ TsPocket: Twitter extractor loaded - using your exact tweet finding script');
console.log('✅ TsPocket: Script end reached at', new Date().toISOString());

// Also add a visual indicator that the script is running
if (window.location.hostname === 'twitter.com' || window.location.hostname === 'x.com') {
  console.log('%c🐦 TsPocket Twitter Extractor Active! 🐦', 'background: #1DA1F2; color: white; font-size: 16px; padding: 5px;');
  
  // Add a way to manually test the tweet finding
  console.log('💡 TIP: Run getTweetData() in console to test tweet detection');
  window.getTweetData = getTweetData; // Make it available globally for testing
}