import CONFIG from './config';
import { getValidAccessToken } from './auth.js';
import logger from './logger';

// Shared domain types (lightweight for now)
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiErrorDetails {
  status?: number;
  body?: string;
  [key: string]: unknown;
}

// Custom error classes
export class IdeaPocketError extends Error {
  timestamp: string;
  code: string;
  details: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'IdeaPocketError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

export class NetworkError extends IdeaPocketError {
  constructor(message: string, details?: ApiErrorDetails) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

export class AuthError extends IdeaPocketError {
  constructor(message: string, details?: ApiErrorDetails) {
    super(message, 'AUTH_ERROR', details);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends IdeaPocketError {
  retryAfter: number;
  constructor(retryAfter: number, details?: ApiErrorDetails) {
    super(`Rate limited. Retry after ${retryAfter}ms`, 'RATE_LIMIT', { retryAfter, ...details });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ValidationError extends IdeaPocketError {
  field: string | undefined;
  constructor(message: string, field?: string, details?: ApiErrorDetails) {
    super(message, 'VALIDATION_ERROR', { field, ...details });
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class ContentExtractionError extends IdeaPocketError {
  constructor(message: string, details?: ApiErrorDetails) {
    super(message, 'CONTENT_EXTRACTION_ERROR', details);
    this.name = 'ContentExtractionError';
  }
}

export class ApiClient {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;

  constructor() {
    this.baseUrl = CONFIG.api.baseUrl;
    this.timeout = CONFIG.api.timeout;
    this.retryAttempts = CONFIG.api.retryAttempts;
    this.retryDelay = CONFIG.api.retryDelay;
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}, timeout: number = this.timeout) {
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
    } catch (error: any) {
      clearTimeout(id);
      logger.error('Fetch error', { error: error.message });
      if (error.name === 'AbortError') {
        throw new NetworkError('Request timeout', { url, timeout });
      }
      throw error;
    }
  }

  async makeRequest<T = unknown>(path: string, method: HttpMethod = 'GET', body: unknown = null, options: { headers?: Record<string, string>; retries?: number } = {}): Promise<T> {
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
        
        const requestOptions: RequestInit = {
          method,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
          }
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
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * this.retryDelay;
          logger.warn('Rate limited by server', { waitTime, attempt });
          if (attempt < retries - 1) {
            await new Promise(r => setTimeout(r, waitTime));
            continue;
          }
          throw new RateLimitError(waitTime, { path, method, attempt });
        }

        // Auth errors
        if (response.status === 401) {
          throw new AuthError('Authentication failed', { path, method });
        }

        if (!response.ok) {
          if (response.status >= 400 && response.status < 500) {
            const errorBody = await response.text();
            logger.error(`Client error ${response.status}`, { statusText: response.statusText, path, method });
            throw new IdeaPocketError('API request failed', 'CLIENT_ERROR', { status: response.status, body: errorBody, path, method });
          }
          if (attempt < retries - 1) {
            const delay = Math.pow(2, attempt) * this.retryDelay;
            logger.warn(`Server error ${response.status}`, { retryDelay: delay, attempt });
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw new NetworkError(`Server error: ${response.status} ${response.statusText}`, { status: response.status, path, method, attempt });
        }

        // Parse JSON
        let data: T;
        try {
          data = await response.json();
        } catch (jsonError: any) {
          logger.error('Failed to parse JSON response', { error: jsonError.message, status: response.status });
          throw new IdeaPocketError('Invalid JSON response from API', 'PARSE_ERROR', { status: response.status, path, method });
        }
        return data;
      } catch (error: any) {
        logger.error(`API request attempt ${attempt + 1} failed`, { error: error.message });
        if (error instanceof IdeaPocketError) {
          throw error;
        }
        if (attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * this.retryDelay;
          logger.debug('Retrying request', { delay, attempt });
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new NetworkError(error.message, { originalError: error, path, method });
      }
    }
    // should never reach here
    throw new NetworkError('Max retries exceeded', { path, method });
  }

  // Convenience methods
  get<T = unknown>(path: string, options = {}) {
    return this.makeRequest<T>(path, 'GET', null, options);
  }

  post<T = unknown>(path: string, body: unknown, options = {}) {
    return this.makeRequest<T>(path, 'POST', body, options);
  }

  put<T = unknown>(path: string, body: unknown, options = {}) {
    return this.makeRequest<T>(path, 'PUT', body, options);
  }

  delete<T = unknown>(path: string, options = {}) {
    return this.makeRequest<T>(path, 'DELETE', null, options);
  }

  patch<T = unknown>(path: string, body: unknown, options = {}) {
    return this.makeRequest<T>(path, 'PATCH', body, options);
  }
}

const apiClient = new ApiClient();
export default apiClient; 