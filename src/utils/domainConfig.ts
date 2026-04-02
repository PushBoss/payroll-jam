/**
 * Domain Configuration Utility
 * Ensures all redirect URLs use payrolljam.com (no www) for email verification and auth
 */

export const PRODUCTION_DOMAIN = 'payrolljam.com';

/**
 * Get the proper base URL for redirects
 * Always uses payrolljam.com (no www) in production, localhost in development
 */
export const getBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    return `https://${PRODUCTION_DOMAIN}`;
  }

  const origin = window.location.origin;
  
  // In production: ensure www is NOT included
  if (origin.includes('payrolljam.com')) {
    // If it's www.payrolljam.com, fallback to non-www
    if (origin.includes('www.')) {
      return `https://${PRODUCTION_DOMAIN}`;
    }
    return origin;
  }
  
  // In development: use localhost or whatever is current
  return origin;
};

/**
 * Get the proper redirect URL for Supabase auth
 * Used for password resets, email verification, etc.
 */
export const getAuthRedirectUrl = (path: string = ''): string => {
  const baseUrl = getBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};
