const CONFIG = {
  // API Configuration
  api: {
    baseUrl: 'https://prod-api.ideaflow.app/v1',
    timeout: 30000, // 30 seconds
    retryAttempts: 3,
    retryDelay: 1000 // 1 second
  },
  
  // Auth0 Configuration
  auth: {
    domain: 'ideaflow.auth0.com',
    clientId: 'ZpX2kkoNfczUya7WChztcv2MGbiFs7T3',
    audience: 'https://prod-api.ideaflow.app/v1',
    redirectUrl: null as string | null, // Set dynamically when needed to avoid early Chrome API access
    scope: 'openid profile email',
    // Helper function to get redirect URL when needed
    getRedirectUrl() {
      if (!this.redirectUrl) {
        this.redirectUrl = chrome?.identity?.getRedirectURL() || 'https://ideaflow.auth0.com/mobile';
      }
      return this.redirectUrl;
    }
  },
  
  // Rate Limiting
  rateLimit: {
    maxRequests: 50,
    windowMs: 60000 // 1 minute
  },
  
  // Storage Keys
  storageKeys: {
    authToken: 'auth_token',
    refreshToken: 'refresh_token',
    userInfo: 'user_info',
    savedArticles: 'saved_articles',
    userId: 'user_id'
  },
  
  // Content Extraction
  extraction: {
    minTextLength: 200,
    maxLinkDensity: 0.3,
    maxSavedArticles: 100
  },
  
  // Optional Services
  firecrawl: {
    apiKey: null, // Set via environment or user settings
    apiUrl: 'https://api.firecrawl.dev/v0/scrape'
  }
};

Object.freeze(CONFIG);
Object.freeze(CONFIG.api);
Object.freeze(CONFIG.auth);
Object.freeze(CONFIG.rateLimit);
Object.freeze(CONFIG.storageKeys);
Object.freeze(CONFIG.extraction);
Object.freeze(CONFIG.firecrawl);

export default CONFIG; 