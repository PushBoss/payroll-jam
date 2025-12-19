import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    define: {
      // This ensures process.env variables are replaced with actual values during build
      'process.env.API_KEY': JSON.stringify(process.env.API_KEY || env.API_KEY),
      // Robustly check for VITE_ prefixed vars OR standard Vercel vars
      'process.env.VITE_SUPABASE_URL': JSON.stringify(
        process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.SUPABASE_URL
      ),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
        process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
      )
    }
  };
});