import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const loadLocalEnvFile = (fileName: string) => {
  if (process.env.VERCEL_ENV || process.env.NODE_ENV === 'production') return;

  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    const value = rawValue
      .replace(/\s+#.*$/, '')
      .trim()
      .replace(/^['"]|['"]$/g, '');

    process.env[key] = value;
  }
};

loadLocalEnvFile('.env.local');
loadLocalEnvFile('.env');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
// Deliberately no VITE_-prefixed fallback here: Vite bundles any VITE_* var into
// the client build, so the service role key must never be reachable under that name.
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  // Throwing here keeps the error loud in logs and prevents silent data-loss.
  // Vercel will surface this as a function crash if env vars are misconfigured.
  throw new Error(
    'Missing Supabase admin env vars. Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.'
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});
