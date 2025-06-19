// Chrome API wrapper with proper error handling
import { TsPocketError } from './api-client.js';

export class ChromeApiError extends TsPocketError {
  constructor(api, operation, chromeError) {
    const message = chromeError?.message || 'Unknown Chrome API error';
    super(
      `Chrome API error in ${api}.${operation}: ${message}`,
      'CHROME_API_ERROR',
      { api, operation, chromeError }
    );
    this.name = 'ChromeApiError';
  }
}

/**
 * Wrapper for Chrome API calls that use callbacks
 * Converts callback-based APIs to promises with error handling
 */
function promisifyChrome(api, method, ...args) {
  return new Promise((resolve, reject) => {
    // Validate Chrome API exists
    if (!chrome[api]) {
      reject(new ChromeApiError(api, method, { message: `Chrome API '${api}' not available` }));
      return;
    }
    
    if (typeof chrome[api][method] !== 'function') {
      reject(new ChromeApiError(api, method, { message: `Chrome API method '${api}.${method}' not available` }));
      return;
    }
    
    const callback = (...results) => {
      if (chrome.runtime.lastError) {
        reject(new ChromeApiError(api, method, chrome.runtime.lastError));
      } else {
        resolve(results.length <= 1 ? results[0] : results);
      }
    };
    
    chrome[api][method](...args, callback);
  });
}

/**
 * Safe wrapper for chrome.tabs API
 */
export const tabs = {
  async query(queryInfo) {
    return promisifyChrome('tabs', 'query', queryInfo);
  },
  
  async create(createProperties) {
    return promisifyChrome('tabs', 'create', createProperties);
  },
  
  async remove(tabId) {
    return promisifyChrome('tabs', 'remove', tabId);
  },
  
  async sendMessage(tabId, message, options = {}) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, options, (response) => {
        if (chrome.runtime.lastError) {
          reject(new ChromeApiError('tabs', 'sendMessage', chrome.runtime.lastError));
        } else {
          resolve(response);
        }
      });
    });
  },
  
  async get(tabId) {
    return promisifyChrome('tabs', 'get', tabId);
  },
  
  async update(tabId, updateProperties) {
    return promisifyChrome('tabs', 'update', tabId, updateProperties);
  }
};

/**
 * Safe wrapper for chrome.scripting API
 */
export const scripting = {
  async executeScript(injection) {
    try {
      return await chrome.scripting.executeScript(injection);
    } catch (error) {
      throw new ChromeApiError('scripting', 'executeScript', error);
    }
  }
};

/**
 * Safe wrapper for chrome.notifications API
 */
export const notifications = {
  async create(notificationId, options) {
    return promisifyChrome('notifications', 'create', notificationId || '', options);
  },
  
  async clear(notificationId) {
    return promisifyChrome('notifications', 'clear', notificationId);
  },
  
  get onButtonClicked() {
    return chrome.notifications?.onButtonClicked;
  },
  
  get onClicked() {
    return chrome.notifications?.onClicked;
  },
  
  get onClosed() {
    return chrome.notifications?.onClosed;
  }
};

/**
 * Safe wrapper for chrome.contextMenus API
 */
export const contextMenus = {
  async create(createProperties) {
    return new Promise((resolve, reject) => {
      if (!chrome.contextMenus) {
        reject(new ChromeApiError('contextMenus', 'create', { message: 'Context menus API not available' }));
        return;
      }
      chrome.contextMenus.create(createProperties, () => {
        if (chrome.runtime.lastError) {
          reject(new ChromeApiError('contextMenus', 'create', chrome.runtime.lastError));
        } else {
          resolve();
        }
      });
    });
  },
  
  async update(id, updateProperties) {
    return promisifyChrome('contextMenus', 'update', id, updateProperties);
  },
  
  async remove(menuItemId) {
    return promisifyChrome('contextMenus', 'remove', menuItemId);
  },
  
  async removeAll() {
    return promisifyChrome('contextMenus', 'removeAll');
  },
  
  get onClicked() {
    return chrome.contextMenus?.onClicked;
  }
};

/**
 * Safe wrapper for chrome.action API
 */
export const action = {
  async setBadgeText(details) {
    return promisifyChrome('action', 'setBadgeText', details);
  },
  
  async setBadgeBackgroundColor(details) {
    return promisifyChrome('action', 'setBadgeBackgroundColor', details);
  },
  
  async setTitle(details) {
    return promisifyChrome('action', 'setTitle', details);
  },
  
  async setIcon(details) {
    return promisifyChrome('action', 'setIcon', details);
  },
  
  get onClicked() {
    return chrome.action?.onClicked;
  }
};

/**
 * Safe wrapper for chrome.runtime API
 */
export const runtime = {
  get onInstalled() {
    return chrome.runtime?.onInstalled;
  },
  
  get onStartup() {
    return chrome.runtime?.onStartup;
  },
  
  get onMessage() {
    return chrome.runtime?.onMessage;
  },
  
  get onMessageExternal() {
    return chrome.runtime?.onMessageExternal;
  },
  
  async sendMessage(message, options) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, options, (response) => {
        if (chrome.runtime.lastError) {
          reject(new ChromeApiError('runtime', 'sendMessage', chrome.runtime.lastError));
        } else {
          resolve(response);
        }
      });
    });
  },
  
  getURL(path) {
    return chrome.runtime.getURL(path);
  },
  
  getManifest() {
    return chrome.runtime.getManifest();
  },
  
  get lastError() {
    return chrome.runtime?.lastError;
  }
};

/**
 * Safe wrapper for chrome.commands API
 */
export const commands = {
  get onCommand() {
    return chrome.commands?.onCommand;
  },
  
  async getAll() {
    return promisifyChrome('commands', 'getAll');
  }
};

// Helper function to handle badge updates with error recovery
export async function updateBadge(tabId, text, color = '#4CAF50', duration = 2000) {
  try {
    await action.setBadgeText({ text, tabId });
    await action.setBadgeBackgroundColor({ color, tabId });
    
    if (duration > 0) {
      setTimeout(async () => {
        try {
          await action.setBadgeText({ text: '', tabId });
        } catch (error) {
          // Tab might be closed, ignore error
          console.debug('Badge clear error (tab may be closed):', error);
        }
      }, duration);
    }
  } catch (error) {
    console.error('Failed to update badge:', error);
    // Don't throw - badge update failures shouldn't break functionality
  }
}

// Export all wrapped APIs
export default {
  tabs,
  scripting,
  notifications,
  contextMenus,
  action,
  runtime,
  commands,
  updateBadge
};