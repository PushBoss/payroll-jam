/**
 * Domain Configuration Utility
 * Ensures redirect URLs are generated correctly for the current environment.
 */

export const PRODUCTION_DOMAIN = 'www.payrolljam.com';

const getEnvBaseUrl = (): string | null => {
  // Prefer explicit config so staging/preview deployments can generate correct auth links.
  const raw = (
    (import.meta as any)?.env?.VITE_PUBLIC_SITE_URL ||
    (import.meta as any)?.env?.VITE_SITE_URL ||
    (import.meta as any)?.env?.VITE_APP_URL ||
    ''
  ) as string;

  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  // Strip trailing slash for consistent joins
  return trimmed.replace(/\/$/, '');
};

/**
 * Get the proper base URL for redirects
 * Always uses payrolljam.com (no www) in production, localhost in development
 */
export const getBaseUrl = (): string => {
  const envBaseUrl = getEnvBaseUrl();
  if (envBaseUrl) return envBaseUrl;

  if (typeof window === 'undefined') {
    return `https://${PRODUCTION_DOMAIN}`;
  }

  const origin = window.location.origin;

  // Use the current origin for deployed environments (staging, preview, production).
  // If you need a canonical domain (e.g. for preview deployments), set VITE_PUBLIC_SITE_URL.
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
