// Type definitions for IdeaPocket Chrome Extension

// Chrome message types
export interface ChromeMessage {
  action: string;
  [key: string]: any;
}

export interface ChromeMessageResponse {
  success: boolean;
  error?: string;
  [key: string]: any;
}

// Article and content types
export interface SavedArticle {
  noteId: string;
  title: string;
  url: string;
  description: string;
  content: string;
  author: string;
  publishedTime: string;
  images: string[];
  savedAt: string;
  tags: string[];
  position: string;
  thoughtstreamPosition?: string;
  createdAt: string;
  insertedAt: string;
  isHighlight?: boolean;
  originalPageTitle?: string;
  platform?: string;
  domain?: string;
  links?: LinkInfo[];
  hasLinks?: boolean;
  tweetInfo?: TwitterInfo;
}

export interface ArticleData {
  title: string;
  url: string;
  description?: string;
  content?: string;
  author?: string;
  publishedTime?: string;
  images?: string[];
  savedAt: string;
  extractionFailed?: boolean;
}

export interface LinkInfo {
  url: string;
  text: string;
}

export interface TwitterInfo {
  author?: {
    name?: string;
    username?: string;
  };
  images?: Array<{
    src: string;
    link?: string;
  }>;
}

export interface SelectionData {
  text: string;
  markdownText?: string;
  plainText?: string;
  links: LinkInfo[];
  hasLinks: boolean;
  pageInfo: {
    url: string;
    title: string;
    platform?: string;
  };
  tweetInfo?: TwitterInfo;
}

// API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SaveResult {
  success: boolean;
  noteId?: string;
  offline?: boolean;
  queueLength?: number;
  warning?: string;
  error?: string;
}

// Token and note types for Thoughtstream API
export interface Token {
  type: 'paragraph' | 'text' | 'hashtag' | 'link';
  tokenId: string;
  content: Array<{
    type: 'text' | 'hashtag' | 'link';
    content: string;
    marks?: string[];
    slug?: string;
  }>;
  depth: number;
  position?: {
    start: number;
    end: number;
  };
}

export interface Note {
  id: string;
  authorId: string;
  tokens: Token[];
  readAll: boolean;
  updatedAt: string;
  deletedAt: string | null;
  folderId: string | null;
  insertedAt: string;
  isSharedPrivately: boolean;
  directUrlOnly: boolean;
  expansionSetting: string;
  position?: string;
}

// Storage service types
export interface StorageKeys {
  authToken: string;
  refreshToken: string;
  userInfo: string;
  savedArticles: string;
  userId: string;
}

export interface UserInfo {
  userInfo: any;
  userId: string | null;
}

// Configuration types
export interface ApiConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface AuthConfig {
  domain: string;
  clientId: string;
  audience: string;
  redirectUrl?: string | null;
  scope: string;
  getRedirectUrl(): string;
}

export interface Config {
  api: ApiConfig;
  auth: AuthConfig;
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
  storageKeys: StorageKeys;
  extraction: {
    minTextLength: number;
    maxLinkDensity: number;
    maxSavedArticles: number;
  };
  firecrawl: {
    apiKey: string | null;
    apiUrl: string;
  };
}

// Error types
export interface ErrorDetails {
  [key: string]: any;
}

export class IdeaPocketError extends Error {
  code: string;
  details: ErrorDetails;
  timestamp: string;

  constructor(message: string, code: string, details?: ErrorDetails) {
    super(message);
    this.name = 'IdeaPocketError';
    this.code = code;
    this.details = details || {};
    this.timestamp = new Date().toISOString();
  }
}

// Logger interface
export interface Logger {
  info(message: string, data?: any): void;
  error(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  debug(message: string, data?: any): void;
}