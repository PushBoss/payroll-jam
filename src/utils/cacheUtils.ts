/**
 * Cache Utilities
 * Utilities to manage localStorage/sessionStorage and prevent cache-related issues
 */

const CACHE_VERSION = 'v2'; // Increment this to force cache clear on updates
const CACHE_VERSION_KEY = 'payroll_jam_cache_version';

/**
 * Check if cache version has changed and clear if needed
 */
export const validateCacheVersion = (): boolean => {
  const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);
  
  if (storedVersion !== CACHE_VERSION) {
    console.log('🔄 Cache version mismatch, clearing old cache...');
    clearAppCache();
    localStorage.setItem(CACHE_VERSION_KEY, CACHE_VERSION);
    return false;
  }
  
  return true;
};

/**
 * Clear all app-related cache except auth tokens
 */
export const clearAppCache = (): void => {
  const keysToPreserve = [
    'supabase.auth.token',
    'sb-',  // Supabase auth prefix
    CACHE_VERSION_KEY
  ];
  
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    const shouldPreserve = keysToPreserve.some(preserve => 
      key.includes(preserve)
    );
    
    if (!shouldPreserve && key.startsWith('payroll_jam_')) {
      localStorage.removeItem(key);
    }
  });
  
  console.log('✅ App cache cleared (auth preserved)');
};

/**
 * Get item from cache with expiration support
 */
export const getCachedItem = <T>(key: string, maxAgeMs?: number): T | null => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    
    const parsed = JSON.parse(item);
    
    // Check if item has expiration
    if (maxAgeMs && parsed.timestamp) {
      const age = Date.now() - parsed.timestamp;
      if (age > maxAgeMs) {
        localStorage.removeItem(key);
        return null;
      }
      return parsed.data;
    }
    
    return parsed;
  } catch (e) {
    console.error('Error reading from cache:', e);
    return null;
  }
};

/**
 * Set item in cache with optional expiration
 */
export const setCachedItem = <T>(key: string, data: T, withTimestamp = false): void => {
  try {
    const value = withTimestamp 
      ? JSON.stringify({ data, timestamp: Date.now() })
      : JSON.stringify(data);
    
    localStorage.setItem(key, value);
  } catch (e) {
    console.error('Error writing to cache:', e);
    // If storage is full, clear cache and retry
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      clearAppCache();
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (retryError) {
        console.error('Failed to write to cache after clearing:', retryError);
      }
    }
  }
};

/**
 * Debounce function to prevent excessive re-renders
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  waitMs: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, waitMs);
  };
};

/**
 * Prevent circular JSON serialization
 */
export const safeStringify = (obj: any): string => {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
};

/**
 * Check if localStorage is available and working
 */
export const isStorageAvailable = (): boolean => {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Initialize cache validation on app load
 */
export const initializeCacheValidation = (): void => {
  if (!isStorageAvailable()) {
    console.warn('⚠️ localStorage is not available');
    return;
  }
  
  validateCacheVersion();
  
  // Clear any stale session data on page load
  sessionStorage.clear();
};
