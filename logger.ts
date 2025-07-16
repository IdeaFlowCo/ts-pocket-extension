// Unified logging system for IdeaPocket

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data: Record<string, unknown>;
  source: string;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 500;
  private listeners: Set<(entry: LogEntry) => void> = new Set();
  private isDev: boolean = this.checkIsDev();
  private debugMode = false;
  private logLevel: LogLevel = 'DEBUG';
  private isInitialized = false;
  private logQueue: Array<{ level: LogLevel; message: string; data: Record<string, unknown>; source: string }> = [];

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
      const { level, message, data, source } = this.logQueue.shift()!;
      this._log(level, message, data, source);
    }
  }

  log(level: LogLevel, message: string, data: Record<string, unknown> = {}) {
    const source = this.getSource();
    if (!this.isInitialized) {
      this.logQueue.push({ level, message, data, source });
      return;
    }
    this._log(level, message, data, source);
  }

  _log(level: LogLevel, message: string, data: Record<string, unknown>, source: string) {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const sanitizedData = this.sanitize(data);
    const entry: LogEntry = {
      timestamp,
      level,
      message,
      data: sanitizedData,
      source: source
    };

    // Only log to console in dev mode or if debug is enabled
    if (this.isDev || this.debugMode || level === 'ERROR') {
      const prefix: Record<LogLevel, string> = {
        'ERROR': '❌',
        'WARN': '⚠️',
        'INFO': '✅',
        'DEBUG': '🔍'
      } as const;
      
      // eslint-disable-next-line no-console
      console.log(`${prefix[level]} [${timestamp}] ${message}`, data);
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
        // eslint-disable-next-line no-console
        console.error('Log listener error:', e);
      }
    });

    // Persist every 10th log (cheap; avoids excessive I/O)
    if (this.logs.length % 10 === 0) {
      this.saveState().catch(() => {/* swallow – best effort */});
    }
  }

  error(message: string, data?: Record<string, unknown>) {
    this.log('ERROR', message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.log('WARN', message, data);
  }

  info(message: string, data?: Record<string, unknown>) {
    this.log('INFO', message, data);
  }

  debug(message: string, data?: Record<string, unknown>) {
    this.log('DEBUG', message, data);
  }

  getLogs(filter: Partial<{ level: LogLevel; source: string; since: string } & Record<string, unknown>> = {}) {
    let logs: LogEntry[] = [...this.logs];
    
    // Add manifest version to the logs for easy debugging
    try {
      const manifest = chrome.runtime.getManifest();
      const versionLog: LogEntry = {
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

  addListener(callback: (entry: LogEntry) => void) {
    this.listeners.add(callback);
  }

  removeListener(callback: (entry: LogEntry) => void) {
    this.listeners.delete(callback);
  }

  shouldLog(level: LogLevel) {
    const levels: Record<LogLevel, number> = { 'DEBUG': 0, 'INFO': 1, 'WARN': 2, 'ERROR': 3 };
    return levels[level] >= levels[this.logLevel];
  }

  sanitize(data: unknown) {
    if (!data || typeof data !== 'object') {
      return data as Record<string, unknown>;
    }
    const sensitiveKeys = ['token', 'secret', 'password', 'email', 'userId', 'authToken', 'refreshToken', 'idToken'];
    const sanitized = { ...(data as Record<string, unknown>) };
    for (const key in sanitized) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      }
    }
    return sanitized;
  }

  saveState() {
    return chrome.storage.local.set({ logs: this.logs });
  }

  /**
   * Force-persist the current in-memory log buffer immediately.
   */
  flush() {
    return this.saveState();
  }

  getSource() {
    try {
      const stackLines = new Error().stack?.split('\n') || [];
      // Start from the 3rd line to skip getSource and the log function itself
      for (let i = 3; i < stackLines.length; i++) {
        const line = stackLines[i];
        if (line.includes('background.js')) return 'BACKGROUND';
        if (line.includes('content.js')) return 'CONTENT';
        if (line.includes('popup.js')) return 'POPUP';
        if (line.includes('api-client.ts')) return 'API';
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
declare const globalThis: typeof Window & { __tspocket_logger?: Logger };
if (typeof chrome !== 'undefined' && chrome.runtime) {
  globalThis.__tspocket_logger = logger;
}

// Initialize the logger asynchronously
(async () => {
  await logger.initialize();
})();

export default logger; 