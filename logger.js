// Unified logging system for IdeaPocket
class Logger {
  constructor() {
    this.logs = [];
    this.maxLogs = 500;
    this.listeners = new Set();
    this.isDev = this.checkIsDev();
    this.debugMode = false;
    this.logLevel = 'DEBUG'; // Default log level
    this.isInitialized = false;
    this.logQueue = [];
    // Removed source cache - memory leak

    // Start initialization
    this.initialize();
  }

  checkIsDev() {
    try {
      // Check if running as unpacked extension (development)
      return !('update_url' in chrome.runtime.getManifest());
    } catch (e) {
      return false;
    }
  }

  async initialize() {
    try {
      // Load logs from storage first
      const stored = await chrome.storage.local.get('logs');
      if (stored.logs && Array.isArray(stored.logs)) {
        this.logs = stored.logs;
      }

      const storedSettings = await chrome.storage.local.get(['debugMode', 'logLevel']);
      this.debugMode = storedSettings.debugMode || false;
      this.logLevel = storedSettings.logLevel || 'DEBUG';
    } catch (e) {
      this.debugMode = false;
    } finally {
      this.isInitialized = true;
      this.processQueue();
    }
  }

  processQueue() {
    while (this.logQueue.length > 0) {
      const { level, message, data, source } = this.logQueue.shift();
      this._log(level, message, data, source);
    }
  }

  log(level, message, data = {}) {
    const source = this.getSource();
    if (!this.isInitialized) {
      this.logQueue.push({ level, message, data, source });
      return;
    }
    this._log(level, message, data, source);
  }

  _log(level, message, data, source) {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const sanitizedData = this.sanitize(data);
    const entry = {
      timestamp,
      level,
      message,
      data: sanitizedData,
      source: source
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

    // Always buffer entries so they can be persisted across service-worker restarts
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Notify listeners (popup, devtools, etc.)
    this.listeners.forEach(listener => {
      try {
        listener(entry);
      } catch (e) {
        console.error('Log listener error:', e);
      }
    });

    // Persist every 10th log (cheap; avoids excessive I/O)
    if (this.logs.length % 10 === 0) {
      this.saveState().catch(() => {/* swallow – best effort */});
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
    
    // Add manifest version to the logs for easy debugging
    try {
      const manifest = chrome.runtime.getManifest();
      const versionLog = {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: `IdeaPocket Version: ${manifest.version}`,
        data: {},
        source: 'SYSTEM'
      };
      logs.unshift(versionLog);
    } catch (e) {
      // Manifest might not be available in all contexts
    }
    
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
    chrome.storage.local.remove('logs');
  }

  addListener(callback) {
    this.listeners.add(callback);
  }

  removeListener(callback) {
    this.listeners.delete(callback);
  }

  shouldLog(level) {
    const levels = { 'DEBUG': 0, 'INFO': 1, 'WARN': 2, 'ERROR': 3 };
    return levels[level] >= levels[this.logLevel];
  }

  sanitize(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }
    const sensitiveKeys = ['token', 'secret', 'password', 'email', 'userId', 'authToken', 'refreshToken', 'idToken'];
    const sanitized = { ...data };
    for (const key in sanitized) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      }
    }
    return sanitized;
  }

  saveState() {
    // Directly return the promise; caller can handle rejections if desired
    return chrome.storage.local.set({ logs: this.logs });
  }

  /**
   * Force-persist the current in-memory log buffer immediately.
   * Returns the underlying promise so callers can await completion.
   */
  flush() {
    return this.saveState();
  }

  getSource() {
    try {
      const stackLines = new Error().stack.split('\n');
      // Start from the 3rd line to skip getSource and the log function itself
      for (let i = 3; i < stackLines.length; i++) {
        const line = stackLines[i];
        if (line.includes('background.js')) return 'BACKGROUND';
        if (line.includes('content.js')) return 'CONTENT';
        if (line.includes('popup.js')) return 'POPUP';
        if (line.includes('api-client.js')) return 'API';
        if (line.includes('auth.js')) return 'AUTH';
        if (line.includes('storage-service.js')) return 'STORAGE';
      }
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

// For service worker, expose via chrome.runtime
if (typeof chrome !== 'undefined' && chrome.runtime) {
  // Make logger available to other scripts
  globalThis.__tspocket_logger = logger;
}

export default logger;
