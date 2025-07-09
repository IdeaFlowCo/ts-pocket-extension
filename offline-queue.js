// Offline queue for failed saves
import storageService from './storage-service.js';
import apiClient from './api-client.js';

const QUEUE_KEY = 'offlineSaveQueue';
const MAX_QUEUE_SIZE = 50;
const RETRY_INTERVAL = 30000; // 30 seconds

class OfflineQueue {
  constructor() {
    this.retryTimer = null;
    this.isRetrying = false;
  }

  async add(articleData, tags, noteData) {
    const queue = await this.getQueue();
    
    // Add to queue with timestamp
    queue.push({
      articleData,
      tags,
      noteData,
      queuedAt: new Date().toISOString(),
      retryCount: 0
    });
    
    // Limit queue size
    if (queue.length > MAX_QUEUE_SIZE) {
      queue.splice(0, queue.length - MAX_QUEUE_SIZE);
    }
    
    await storageService.set({ [QUEUE_KEY]: queue });
    
    // Start retry timer if not already running
    this.startRetryTimer();
    
    return queue.length;
  }

  async getQueue() {
    const stored = await storageService.get(QUEUE_KEY);
    return stored[QUEUE_KEY] || [];
  }

  async processQueue() {
    if (this.isRetrying) return;
    
    const queue = await this.getQueue();
    if (queue.length === 0) {
      this.stopRetryTimer();
      return;
    }
    
    this.isRetrying = true;
    const processed = [];
    const failed = [];
    
    for (const item of queue) {
      try {
        // Retry the save
        const response = await apiClient.post('/notes', { notes: [item.noteData] });
        processed.push(item);
        
        // Notify user of successful sync
        await chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon-48.png',
          title: 'Article Synced',
          message: `"${item.articleData.title}" has been saved to Ideaflow`
        });
      } catch (error) {
        item.retryCount++;
        
        // Keep items that haven't exceeded max retries
        if (item.retryCount < 5) {
          failed.push(item);
        }
      }
    }
    
    // Update queue with failed items
    await storageService.set({ [QUEUE_KEY]: failed });
    
    this.isRetrying = false;
    
    // Continue retrying if items remain
    if (failed.length > 0) {
      this.startRetryTimer();
    } else {
      this.stopRetryTimer();
    }
    
    return {
      processed: processed.length,
      remaining: failed.length
    };
  }

  startRetryTimer() {
    if (this.retryTimer) return;
    
    // Initial retry after 5 seconds
    setTimeout(() => this.processQueue(), 5000);
    
    // Then retry every 30 seconds
    this.retryTimer = setInterval(() => {
      this.processQueue();
    }, RETRY_INTERVAL);
  }

  stopRetryTimer() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  async getQueueStatus() {
    const queue = await this.getQueue();
    return {
      count: queue.length,
      oldest: queue[0]?.queuedAt,
      isRetrying: this.isRetrying
    };
  }
}

export default new OfflineQueue();