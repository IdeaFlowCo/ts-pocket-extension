// OAuth2 PKCE Authentication Flow for Chrome Extension
// Uses web-based flow for portability - works for all users without per-extension configuration

// Import centralized config and storage service
import CONFIG from './config.js';
import storageService from './storage-service.js';

// OAuth configuration - uses centralized config with auth-specific extensions
const AUTH_CONFIG = {
  ...CONFIG.auth,
  responseType: 'code',
  codeChallengeMethod: 'S256',
  scope: 'openid profile email offline_access',
  // Use mobile redirect for now, will switch after Chrome Store publishing
  get redirectUri() {
    // For now, use the mobile endpoint until Chrome Store publishing
    return 'https://ideaflow.auth0.com/mobile';
    // After publishing: return CONFIG.auth.getRedirectUrl();
  }
};

// Generate random string for PKCE
function generateRandomString(length) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => charset[byte % charset.length]).join('');
}

// SHA256 hash for PKCE challenge
async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(hash));
}

// Base64 URL encoding
function base64URLEncode(buffer) {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Parse JWT token
function parseJWT(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => 
    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
  ).join(''));
  return JSON.parse(jsonPayload);
}

// Main login function using web-based flow
export async function loginWithAuth0() {
  try {
    // Generate PKCE verifier and challenge
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await sha256(codeVerifier);
    const state = generateRandomString(32);
    
    // Store verifier and state for later use
    await storageService.set({ codeVerifier, authState: state });
    
    // Build authorization URL
    const authUrl = new URL(`https://${AUTH_CONFIG.domain}/authorize`);
    authUrl.searchParams.append('client_id', AUTH_CONFIG.clientId);
    authUrl.searchParams.append('redirect_uri', AUTH_CONFIG.redirectUri);
    authUrl.searchParams.append('response_type', AUTH_CONFIG.responseType);
    authUrl.searchParams.append('scope', AUTH_CONFIG.scope);
    authUrl.searchParams.append('audience', AUTH_CONFIG.audience);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', AUTH_CONFIG.codeChallengeMethod);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('prompt', 'login');
    
    console.log('Opening auth URL in new tab');
    console.log('Full auth URL:', authUrl.toString());
    console.log('Redirect URI being used:', AUTH_CONFIG.redirectUri);
    
    // Return a promise that resolves when we get the auth code
    return new Promise(async (resolve) => {
      // Set up message listener BEFORE creating the tab to avoid race condition
      chrome.runtime.onMessage.addListener(function listener(request) {
        if (request.action === 'authComplete') {
          chrome.runtime.onMessage.removeListener(listener);
          resolve(request);
        }
      });
      
      // Open auth page in new tab
      const authTab = await chrome.tabs.create({ 
        url: authUrl.toString(),
        active: true 
      });
      
      // Also listen for tab updates to detect the redirect
      const tabListener = async (tabId, changeInfo, tab) => {
        if (tabId !== authTab.id) return;
        
        // Check if we're at the redirect URI with auth code
        if (tab.url && tab.url.includes(AUTH_CONFIG.redirectUri) && tab.url.includes('code=')) {
          chrome.tabs.onUpdated.removeListener(tabListener);
          
          try {
            const url = new URL(tab.url);
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            const returnedState = url.searchParams.get('state');
            
            // Close the auth tab
            await chrome.tabs.remove(tabId);
            
            // Verify state
            const stored = await storageService.get(['authState']);
            if (returnedState !== stored.authState) {
              resolve({
                success: false,
                error: 'State mismatch - possible security issue'
              });
              return;
            }
            
            if (error) {
              resolve({
                success: false,
                error: `Auth error: ${error} - ${url.searchParams.get('error_description')}`
              });
              return;
            }
            
            if (!code) {
              resolve({
                success: false,
                error: 'No authorization code received'
              });
              return;
            }
            
            // Exchange code for tokens
            const result = await exchangeCodeForTokens(code, codeVerifier);
            resolve(result);
            
          } catch (error) {
            resolve({
              success: false,
              error: error.message
            });
          }
        }
      };
      
      chrome.tabs.onUpdated.addListener(tabListener);
      
      // Timeout after 5 minutes
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(tabListener);
        resolve({
          success: false,
          error: 'Authentication timeout'
        });
      }, 5 * 60 * 1000);
    });
    
  } catch (error) {
    console.error('Login failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Exchange authorization code for tokens
async function exchangeCodeForTokens(code, codeVerifier) {
  try {
    const tokenResponse = await fetch(`https://${AUTH_CONFIG.domain}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: AUTH_CONFIG.clientId,
        code: code,
        redirect_uri: AUTH_CONFIG.redirectUri,
        code_verifier: codeVerifier
      })
    });
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${error}`);
    }
    
    const tokens = await tokenResponse.json();
    console.log('Tokens received');
    
    // Parse user info from ID token
    const userInfo = parseJWT(tokens.id_token);
    console.log('User info:', userInfo);
    
    // Store tokens and user info
    await storageService.set({
      [CONFIG.storageKeys.authToken]: tokens.access_token,
      [CONFIG.storageKeys.refreshToken]: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000),
      [CONFIG.storageKeys.userId]: userInfo.sub,
      userEmail: userInfo.email,
      userName: userInfo.name || userInfo.email
    });
    
    // Clean up
    await storageService.remove(['codeVerifier', 'authState']);
    
    return {
      success: true,
      user: {
        id: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name
      }
    };
    
  } catch (error) {
    console.error('Token exchange failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Refresh access token
export async function refreshAccessToken() {
  try {
    const refreshToken = await storageService.getRefreshToken();
    
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    
    const response = await fetch(`https://${AUTH_CONFIG.domain}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: AUTH_CONFIG.clientId,
        refresh_token: refreshToken
      })
    });
    
    if (!response.ok) {
      throw new Error('Token refresh failed');
    }
    
    const tokens = await response.json();
    
    // Update stored tokens
    await storageService.set({
      [CONFIG.storageKeys.authToken]: tokens.access_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000)
    });
    
    return tokens.access_token;
    
  } catch (error) {
    console.error('Token refresh failed:', error);
    // Clear auth data on refresh failure
    await logout();
    throw error;
  }
}

// Check if token is expired
export async function isTokenExpired() {
  const stored = await storageService.get(['expiresAt']);
  return !stored.expiresAt || Date.now() > stored.expiresAt;
}

// Get valid access token
export async function getValidAccessToken() {
  console.log('🔐 [AUTH] Getting valid access token...');
  
  const expired = await isTokenExpired();
  console.log('🔍 [AUTH] Token expired?', expired);
  
  if (expired) {
    console.log('⏰ [AUTH] Token expired, refreshing...');
    try {
      const newToken = await refreshAccessToken();
      console.log('✅ [AUTH] Token refreshed successfully');
      return newToken;
    } catch (error) {
      console.error('❌ [AUTH] Token refresh failed:', error);
      throw error;
    }
  }
  
  const token = await storageService.getAuthToken();
  console.log('✅ [AUTH] Using existing token:', token ? `${token.substring(0, 20)}...` : 'NO TOKEN');
  return token;
}

// Logout
export async function logout() {
  await storageService.clearAuth();
}

// Check if user is logged in
export async function isLoggedIn() {
  const stored = await storageService.get([CONFIG.storageKeys.authToken, 'expiresAt']);
  return stored[CONFIG.storageKeys.authToken] && stored.expiresAt && Date.now() < stored.expiresAt;
}