// Storage service wrapper for Chrome storage API
import CONFIG from './config.js';

/**
 * Chrome storage wrapper with proper error handling and promises
 */
class StorageService {
  constructor() {
    this.keys = CONFIG.storageKeys;
  }

  /**
   * Get data from Chrome storage with error handling
   * @param {string|string[]} keys - Storage key(s) to retrieve
   * @returns {Promise<Object>} Retrieved data
   */
  async get(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Storage get error: ${chrome.runtime.lastError.message}`));
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Set data in Chrome storage with error handling
   * @param {Object} data - Data to store
   * @returns {Promise<void>}
   */
  async set(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Storage set error: ${chrome.runtime.lastError.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Remove data from Chrome storage
   * @param {string|string[]} keys - Storage key(s) to remove
   * @returns {Promise<void>}
   */
  async remove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Storage remove error: ${chrome.runtime.lastError.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Clear all data from Chrome storage
   * @returns {Promise<void>}
   */
  async clear() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Storage clear error: ${chrome.runtime.lastError.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  // Convenience methods for common operations

  /**
   * Get authentication token
   * @returns {Promise<string|null>}
   */
  async getAuthToken() {
    const result = await this.get(this.keys.authToken);
    return result[this.keys.authToken] || null;
  }

  /**
   * Set authentication token
   * @param {string} token
   * @returns {Promise<void>}
   */
  async setAuthToken(token) {
    await this.set({ [this.keys.authToken]: token });
  }

  /**
   * Get refresh token
   * @returns {Promise<string|null>}
   */
  async getRefreshToken() {
    const result = await this.get(this.keys.refreshToken);
    return result[this.keys.refreshToken] || null;
  }

  /**
   * Set refresh token
   * @param {string} token
   * @returns {Promise<void>}
   */
  async setRefreshToken(token) {
    await this.set({ [this.keys.refreshToken]: token });
  }

  /**
   * Get user info
   * @returns {Promise<Object|null>}
   */
  async getUserInfo() {
    const result = await this.get([this.keys.userInfo, this.keys.userId]);
    return {
      userInfo: result[this.keys.userInfo] || null,
      userId: result[this.keys.userId] || null
    };
  }

  /**
   * Set user info
   * @param {Object} userInfo
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async setUserInfo(userInfo, userId) {
    await this.set({
      [this.keys.userInfo]: userInfo,
      [this.keys.userId]: userId
    });
  }

  /**
   * Get saved articles
   * @returns {Promise<Array>}
   */
  async getSavedArticles() {
    const result = await this.get(this.keys.savedArticles);
    return result[this.keys.savedArticles] || [];
  }

  /**
   * Set saved articles
   * @param {Array} articles
   * @returns {Promise<void>}
   */
  async setSavedArticles(articles) {
    await this.set({ [this.keys.savedArticles]: articles });
  }

  /**
   * Add a saved article
   * @param {Object} article
   * @returns {Promise<void>}
   */
  async addSavedArticle(article) {
    const articles = await this.getSavedArticles();
    articles.unshift(article);
    
    // Keep only the configured maximum number of articles
    if (articles.length > CONFIG.extraction.maxSavedArticles) {
      articles.splice(CONFIG.extraction.maxSavedArticles);
    }
    
    await this.setSavedArticles(articles);
  }

  /**
   * Find saved article by note ID
   * @param {string} noteId
   * @returns {Promise<Object|null>}
   */
  async findSavedArticle(noteId) {
    const articles = await this.getSavedArticles();
    return articles.find(a => a.noteId === noteId) || null;
  }

  /**
   * Update saved article
   * @param {string} noteId
   * @param {Object} updates
   * @returns {Promise<boolean>} True if article was found and updated
   */
  async updateSavedArticle(noteId, updates) {
    const articles = await this.getSavedArticles();
    const index = articles.findIndex(a => a.noteId === noteId);
    
    if (index === -1) {
      return false;
    }
    
    articles[index] = { ...articles[index], ...updates };
    await this.setSavedArticles(articles);
    return true;
  }

  /**
   * Clear authentication data
   * @returns {Promise<void>}
   */
  async clearAuth() {
    await this.remove([
      this.keys.authToken,
      this.keys.refreshToken,
      this.keys.userInfo,
      this.keys.userId,
      'expiresAt',
      'idToken',
      'userEmail',
      'userName',
      'codeVerifier',
      'authState'
    ]);
  }

  /**
   * Listen for storage changes
   * @param {Function} callback - Called with (changes, areaName)
   * @returns {Function} Unsubscribe function
   */
  onChanged(callback) {
    chrome.storage.onChanged.addListener(callback);
    return () => chrome.storage.onChanged.removeListener(callback);
  }
}

// Export singleton instance
const storageService = new StorageService();
export default storageService;