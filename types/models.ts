export interface Article {
  title: string;
  url: string;
  description?: string;
  content?: string;
  publishedTime?: string;
  author?: string;
  images?: string[];
  domain?: string;
  savedAt?: string;
  [key: string]: unknown;
}

export interface SavedArticle extends Article {
  id: string;
  noteId?: string;
  tags?: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
}

export interface UserInfo {
  id: string;
  email: string;
  name?: string;
} 