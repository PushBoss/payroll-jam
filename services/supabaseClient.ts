declare const process: any;

import { createClient } from '@supabase/supabase-js';

// Helper to check localStorage (Manual Override)
const getLocalOverride = (key: string) => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem(key);
  }
  return null;
};

// Robust Environment Variable Access Strategy
const getEnvVar = (key: string) => {
  // 1. Manual Override (Browser Storage) - Priority for manual test
  const local = getLocalOverride(key);
  if (local) return local;

  // 2. Vite Import Meta (Modern Frontend)
  const metaEnv = (import.meta as any).env;
  if (metaEnv && metaEnv[key]) {
    return metaEnv[key];
  }

  // 3. Process Env (Node/Vercel Backend Compat)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }

  return '';
};

// Access variables
const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

// Only initialize if keys are present
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

/**
 * Saves manual credentials to LocalStorage and reloads to apply them.
 */
export const saveManualConfig = (url: string, key: string) => {
    localStorage.setItem('VITE_SUPABASE_URL', url);
    localStorage.setItem('VITE_SUPABASE_ANON_KEY', key);
    window.location.reload();
};

/**
 * Check if the current connection is using LocalStorage overrides
 */
export const isUsingLocalOverrides = () => {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('VITE_SUPABASE_URL');
};

/**
 * Checks if the application can communicate with the Supabase project.
 */
export const checkDbConnection = async (): Promise<{ 
  connected: boolean; 
  message: string; 
  details?: string 
}> => {
  if (!supabase) {
    return { 
      connected: false, 
      message: 'Environment Variables Missing', 
      details: 'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in Vercel or enter them manually.' 
    };
  }

  try {
    // Attempt a lightweight request (Auth check)
    const { error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Supabase Connection Error:', error);
      return { 
        connected: false, 
        message: 'Connection Failed', 
        details: error.message 
      };
    }

    return { 
      connected: true, 
      message: 'Connected Successfully',
      details: `Linked to project: ${supabaseUrl}`
    };
  } catch (err: any) {
    return { 
      connected: false, 
      message: 'Network Error', 
      details: err.message 
    };
  }
};

/**
 * Allows manual testing of credentials without reloading the app
 */
export const testManualConnection = async (url: string, key: string) => {
  try {
    if (!url || !key) return { success: false, error: "Missing URL or Key" };
    
    // Create a temporary client just for this test
    const tempClient = createClient(url, key);
    const { error } = await tempClient.auth.getSession();
    
    if (error) throw error;
    
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Unknown connection error" };
  }
};