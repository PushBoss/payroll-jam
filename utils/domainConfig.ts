/**
 * Domain Configuration Utility
 * Ensures all redirect URLs use www.payrolljam.com for email verification and auth
 */

export const PRODUCTION_DOMAIN = 'www.payrolljam.com';

/**
 * Get the proper base URL for redirects
 * Always uses www.payrolljam.com in production, localhost in development
 */
export const getBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    return `https://${PRODUCTION_DOMAIN}`;
  }

  const origin = window.location.origin;
  
  // In production: ensure www is included
  if (origin.includes('payrolljam.com')) {
    // If it's payrolljam.com (without www), redirect to www version
    if (!origin.includes('www.')) {
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
