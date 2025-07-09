// Unified API client for IdeaPocket extension
import CONFIG from './config.js';
import { getValidAccessToken } from './auth.js';
import logger from './logger.js';


// Custom error classes
export class IdeaPocketError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'IdeaPocketError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

export class NetworkError extends IdeaPocketError {
  constructor(message, details) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

export class AuthError extends IdeaPocketError {
  constructor(message, details) {
    super(message, 'AUTH_ERROR', details);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends IdeaPocketError {
  constructor(retryAfter, details) {
    super(`Rate limited. Retry after ${retryAfter}ms`, 'RATE_LIMIT', { retryAfter, ...details });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ValidationError extends IdeaPocketError {
  constructor(message, field, details) {
    super(message, 'VALIDATION_ERROR', { field, ...details });
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class ContentExtractionError extends IdeaPocketError {
  constructor(message, details) {
    super(message, 'CONTENT_EXTRACTION_ERROR', details);
    this.name = 'ContentExtractionError';
  }
}


// API Client class
export class ApiClient {
  constructor() {
    this.baseUrl = CONFIG.api.baseUrl;
    this.timeout = CONFIG.api.timeout;
    this.retryAttempts = CONFIG.api.retryAttempts;
    this.retryDelay = CONFIG.api.retryDelay;
  }

  async fetchWithTimeout(url, options = {}, timeout = this.timeout) {
    logger.debug('Making API request', {
      url,
      method: options.method || 'GET',
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
      
      logger.debug('API response received', {
        status: response.status,
        statusText: response.statusText
      });
      
      return response;
    } catch (error) {
      clearTimeout(id);
      logger.error('Fetch error', { error: error.message });
      if (error.name === 'AbortError') {
        throw new NetworkError('Request timeout', { url, timeout });
      }
      throw error;
    }
  }

  async makeRequest(path, method = 'GET', body = null, options = {}) {
    logger.info(`🌐 API ${method} ${path}`, { 
      hasBody: !!body,
      bodySize: body ? JSON.stringify(body).length : 0,
      timestamp: new Date().toISOString()
    });
    
    const retries = options.retries ?? this.retryAttempts;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        logger.info('🔑 Getting access token...');
        const token = await getValidAccessToken();
        logger.info('🔑 Auth token status', { 
          hasToken: !!token,
          tokenLength: token?.length 
        });
        
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
          logger.debug('Request has body', { bodySize: JSON.stringify(body).length });
        }

        const url = `${this.baseUrl}${path}`;
        logger.info('🚀 Sending request', { 
          url,
          method,
          attempt: attempt + 1,
          maxRetries: retries
        });
        
        const response = await this.fetchWithTimeout(url, requestOptions);
        
        logger.info('📡 Response received', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          url
        });
        
        // Handle rate limiting response
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * this.retryDelay;
          logger.warn('Rate limited by server', { waitTime, attempt });
          
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
            logger.error(`Client error ${response.status}`, { statusText: response.statusText, path, method });
            throw new IdeaPocketError(
              `API request failed: ${response.status} ${response.statusText}`, 
              'CLIENT_ERROR',
              { status: response.status, body: errorBody, path, method }
            );
          }
          
          // Retry on server errors (5xx)
          if (attempt < retries - 1) {
            const delay = Math.pow(2, attempt) * this.retryDelay;
            logger.warn(`Server error ${response.status}`, { retryDelay: delay, attempt });
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          throw new NetworkError(
            `Server error: ${response.status} ${response.statusText}`,
            { status: response.status, path, method, attempt }
          );
        }
        
        let data;
        try {
          data = await response.json();
          logger.info(`API Success: ${method} ${path}`, {
            responseType: Array.isArray(data) ? 'array' : typeof data,
            hasData: !!data?.data,
            hasError: !!data?.error,
            arrayLength: Array.isArray(data) ? data.length : (Array.isArray(data?.data) ? data.data.length : 'N/A')
          });
        } catch (jsonError) {
          logger.error('Failed to parse JSON response', { error: jsonError.message, status: response.status });
          throw new TsPocketError(
            'Invalid JSON response from API',
            'PARSE_ERROR',
            { status: response.status, path, method }
          );
        }
        return data;
        
      } catch (error) {
        logger.error(`API request attempt ${attempt + 1} failed`, { error: error.message });
        
        // Re-throw specific errors
        if (error instanceof IdeaPocketError) {
          throw error;
        }
        
        // Network errors - retry
        if (attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * this.retryDelay;
          logger.debug('Retrying request', { delay, attempt });
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