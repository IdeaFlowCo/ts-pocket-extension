// Unified logging system for TsPocket
class Logger {
  constructor() {
    this.logs = [];
    this.maxLogs = 100;
    this.listeners = new Set();
    this.isDev = this.checkIsDev();
    this.debugMode = false;
  }

  checkIsDev() {
    try {
      // Check if running as unpacked extension (development)
      return !('update_url' in chrome.runtime.getManifest());
    } catch (e) {
      return false;
    }
  }

  async checkDebugMode() {
    try {
      const result = await chrome.storage.local.get('debugMode');
      this.debugMode = result.debugMode || false;
    } catch (e) {
      this.debugMode = false;
    }
  }

  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      level,
      message,
      data,
      source: this.getSource()
    };

    // Only log to console in dev mode or if debug is enabled
    if (this.isDev || this.debugMode || level === 'ERROR') {
      const prefix = {
        'ERROR': '❌',
        'WARN': '⚠️',
        'INFO': '✅',
        'DEBUG': '🔍'
      }[level] || '📝';
      
      console.log(`${prefix} [${timestamp}] ${message}`, data);
    }

    // Only store logs in memory during development or debug mode
    if (this.isDev || this.debugMode) {
      this.logs.push(entry);
      if (this.logs.length > this.maxLogs) {
        this.logs.shift();
      }

      // Notify listeners
      this.listeners.forEach(listener => {
        try {
          listener(entry);
        } catch (e) {
          console.error('Log listener error:', e);
        }
      });
    }
  }

  error(message, data) {
    this.log('ERROR', message, data);
  }

  warn(message, data) {
    this.log('WARN', message, data);
  }

  info(message, data) {
    this.log('INFO', message, data);
  }

  debug(message, data) {
    this.log('DEBUG', message, data);
  }

  getLogs(filter = {}) {
    let logs = [...this.logs];
    
    if (filter.level) {
      logs = logs.filter(log => log.level === filter.level);
    }
    
    if (filter.source) {
      logs = logs.filter(log => log.source === filter.source);
    }
    
    if (filter.since) {
      logs = logs.filter(log => new Date(log.timestamp) > new Date(filter.since));
    }
    
    return logs;
  }

  clear() {
    this.logs = [];
  }

  addListener(callback) {
    this.listeners.add(callback);
  }

  removeListener(callback) {
    this.listeners.delete(callback);
  }

  getSource() {
    // Detect which script is logging
    try {
      const stack = new Error().stack;
      if (stack.includes('background.js')) return 'BACKGROUND';
      if (stack.includes('content.js')) return 'CONTENT';
      if (stack.includes('popup.js')) return 'POPUP';
      if (stack.includes('api-client.js')) return 'API';
      if (stack.includes('auth.js')) return 'AUTH';
      return 'UNKNOWN';
    } catch (e) {
      return 'UNKNOWN';
    }
  }

  // Export logs as formatted text
  exportLogs() {
    return this.logs.map(log => {
      const data = Object.keys(log.data).length > 0 ? 
        `\n  Data: ${JSON.stringify(log.data, null, 2)}` : '';
      return `[${log.timestamp}] [${log.source}] [${log.level}] ${log.message}${data}`;
    }).join('\n\n');
  }
}

// Create singleton instance
const logger = new Logger();

// Check debug mode on initialization
if (typeof chrome !== 'undefined' && chrome.storage) {
  logger.checkDebugMode();
}

// For service worker, expose via chrome.runtime
if (typeof chrome !== 'undefined' && chrome.runtime) {
  // Make logger available to other scripts
  globalThis.__tspocket_logger = logger;
}

export default logger;