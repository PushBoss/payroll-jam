import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load environment variables manually if dotenv doesn't pick up .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
let supabaseUrl = process.env.VITE_SUPABASE_URL;
let supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  for (const line of envConfig.split('\n')) {
    const [key, val] = line.split('=');
    if (key === 'VITE_SUPABASE_URL') supabaseUrl = val?.trim();
    if (key === 'VITE_SUPABASE_SERVICE_ROLE_KEY') supabaseServiceKey = val?.trim();
  }
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log('🔄 Syncing Company Reseller ID...');

  const resellerEmail = 'aarongardiner6@gmail.com';
  const clientEmail = 'info@pushtechsolutions.com';

  // 1. Get Reseller Company ID
  const { data: resellerUser } = await supabase
    .from('app_users')
    .select('company_id')
    .eq('email', resellerEmail)
    .single();

  // 2. Get Client Company ID
  const { data: clientUser } = await supabase
    .from('app_users')
    .select('company_id')
    .eq('email', clientEmail)
    .single();

  if (!resellerUser || !clientUser) {
      console.log('❌ Could not find users.');
      return;
  }

  // 3. Update Client Company Record
  console.log(`Setting reseller_id for company ${clientUser.company_id} to ${resellerUser.company_id}...`);
  
  const { error } = await supabase
    .from('companies')
    .update({ reseller_id: resellerUser.company_id })
    .eq('id', clientUser.company_id);

  if (error) {
      console.error('❌ Failed to update company record:', error);
  } else {
      console.log('✅ Company record updated successfully.');
  }
}

run();
