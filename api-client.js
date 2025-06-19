// Unified API client for TsPocket extension
import CONFIG from './config.js';
import { getValidAccessToken } from './auth.js';

// Custom error classes
export class TsPocketError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'TsPocketError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

export class NetworkError extends TsPocketError {
  constructor(message, details) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

export class AuthError extends TsPocketError {
  constructor(message, details) {
    super(message, 'AUTH_ERROR', details);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends TsPocketError {
  constructor(retryAfter, details) {
    super(`Rate limited. Retry after ${retryAfter}ms`, 'RATE_LIMIT', { retryAfter, ...details });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ValidationError extends TsPocketError {
  constructor(message, field, details) {
    super(message, 'VALIDATION_ERROR', { field, ...details });
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class ContentExtractionError extends TsPocketError {
  constructor(message, details) {
    super(message, 'CONTENT_EXTRACTION_ERROR', details);
    this.name = 'ContentExtractionError';
  }
}

// Rate limiter implementation
class RateLimiter {
  constructor(maxRequests = CONFIG.rateLimit.maxRequests, windowMs = CONFIG.rateLimit.windowMs) {
    this.requests = [];
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  canMakeRequest() {
    const now = Date.now();
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  }

  getWaitTime() {
    if (this.requests.length === 0) return 0;
    const oldestRequest = Math.min(...this.requests);
    const waitTime = this.windowMs - (Date.now() - oldestRequest);
    return Math.max(0, waitTime);
  }

  reset() {
    this.requests = [];
  }
}

// API Client class
export class ApiClient {
  constructor() {
    this.baseUrl = CONFIG.api.baseUrl;
    this.timeout = CONFIG.api.timeout;
    this.retryAttempts = CONFIG.api.retryAttempts;
    this.retryDelay = CONFIG.api.retryDelay;
    this.rateLimiter = new RateLimiter();
  }

  async fetchWithTimeout(url, options = {}, timeout = this.timeout) {
    console.log('🌐 [API] Making request:', {
      url,
      method: options.method || 'GET',
      headers: options.headers,
      hasBody: !!options.body
    });
    
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      
      console.log('📡 [API] Response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      return response;
    } catch (error) {
      clearTimeout(id);
      console.error('❌ [API] Fetch error:', error);
      if (error.name === 'AbortError') {
        throw new NetworkError('Request timeout', { url, timeout });
      }
      throw error;
    }
  }

  async makeRequest(path, method = 'GET', body = null, options = {}) {
    console.log(`📡 API ${method} ${path}`, body ? 'with body:' : '', body);
    
    // Track rate limit retry attempts to prevent infinite recursion
    const rateLimitRetries = options._rateLimitRetries || 0;
    const maxRateLimitRetries = 3;
    
    // Check rate limit
    if (!this.rateLimiter.canMakeRequest()) {
      const waitTime = this.rateLimiter.getWaitTime();
      console.log(`Rate limit reached. Waiting ${waitTime}ms before retry`);
      
      if (options.skipRateLimit || rateLimitRetries >= maxRateLimitRetries) {
        throw new RateLimitError(waitTime, { path, method, rateLimitRetries });
      }
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.makeRequest(path, method, body, { ...options, _rateLimitRetries: rateLimitRetries + 1 });
    }

    const retries = options.retries ?? this.retryAttempts;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const token = await getValidAccessToken();
        console.log(`🔐 Using auth token:`, token ? `${token.substring(0, 20)}...` : 'NO TOKEN');
        
        const requestOptions = {
          method,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
          },
        };

        if (body) {
          requestOptions.body = JSON.stringify(body);
        }

        const url = `${this.baseUrl}${path}`;
        console.log(`🌐 Full URL: ${url}`);
        
        const response = await this.fetchWithTimeout(url, requestOptions);
        
        // Handle rate limiting response
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * this.retryDelay;
          console.log(`Rate limited by server. Waiting ${waitTime}ms before retry`);
          
          if (attempt < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          
          throw new RateLimitError(waitTime, { path, method, attempt });
        }
        
        // Handle authentication errors
        if (response.status === 401) {
          throw new AuthError('Authentication failed', { path, method });
        }
        
        if (!response.ok) {
          // Don't retry on client errors (4xx) except 429
          if (response.status >= 400 && response.status < 500) {
            const errorBody = await response.text();
            console.error(`❌ Client error ${response.status}:`, errorBody);
            throw new TsPocketError(
              `API request failed: ${response.status} ${response.statusText}`, 
              'CLIENT_ERROR',
              { status: response.status, body: errorBody, path, method }
            );
          }
          
          // Retry on server errors (5xx)
          if (attempt < retries - 1) {
            const delay = Math.pow(2, attempt) * this.retryDelay;
            console.log(`Server error ${response.status}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          throw new NetworkError(
            `Server error: ${response.status} ${response.statusText}`,
            { status: response.status, path, method, attempt }
          );
        }
        
        const data = await response.json();
        console.log(`✅ API Success for ${method} ${path}`);
        return data;
        
      } catch (error) {
        console.error(`API request attempt ${attempt + 1} failed:`, error);
        
        // Re-throw specific errors
        if (error instanceof TsPocketError) {
          throw error;
        }
        
        // Network errors - retry
        if (attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * this.retryDelay;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Wrap unknown errors
        throw new NetworkError(error.message, { originalError: error, path, method });
      }
    }
  }

  // Convenience methods
  async get(path, options) {
    return this.makeRequest(path, 'GET', null, options);
  }

  async post(path, body, options) {
    return this.makeRequest(path, 'POST', body, options);
  }

  async put(path, body, options) {
    return this.makeRequest(path, 'PUT', body, options);
  }

  async delete(path, options) {
    return this.makeRequest(path, 'DELETE', null, options);
  }

  async patch(path, body, options) {
    return this.makeRequest(path, 'PATCH', body, options);
  }
}

// Export singleton instance
const apiClient = new ApiClient();
export default apiClient;