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

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase URL or Service Role Key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log('🔄 Swapping Reseller/Client Link...');

  const correctResellerEmail = 'aarongardiner6@gmail.com';
  const correctClientEmail = 'info@pushtechsolutions.com';

  console.log(`Target Configuration:`);
  console.log(`   Reseller (Owner): ${correctResellerEmail}`);
  console.log(`   Client (Managed): ${correctClientEmail}`);

  // 1. Get Correct Reseller Company ID
  const { data: resellerUser } = await supabase
    .from('app_users')
    .select('id, email, company_id')
    .eq('email', correctResellerEmail)
    .single();

  // 2. Get Correct Client Company ID
  const { data: clientUser } = await supabase
    .from('app_users')
    .select('id, email, company_id')
    .eq('email', correctClientEmail)
    .single();

  if (!resellerUser || !clientUser) {
    console.error(`❌ Could not find one of the users.`);
    console.log('Reseller found:', !!resellerUser);
    console.log('Client found:', !!clientUser);
    return;
  }

  const resellerCompanyId = resellerUser.company_id;
  const clientCompanyId = clientUser.company_id;

  console.log(`   Reseller Company ID: ${resellerCompanyId}`);
  console.log(`   Client Company ID:   ${clientCompanyId}`);

  // 3. Delete the INCORRECT link (the reverse of what we want)
  // Previous incorrect state: Reseller = info@pushtech (clientCompanyId), Client = aarongardiner (resellerCompanyId)
  const { error: deleteError } = await supabase
    .from('reseller_clients')
    .delete()
    .eq('reseller_id', clientCompanyId) 
    .eq('client_company_id', resellerCompanyId);

  if (deleteError) {
      console.error('⚠️ Error removing incorrect link:', deleteError);
  } else {
      console.log('🗑️ Removed incorrect reverse link (if it existed).');
  }

  // 4. Create the CORRECT link
  const { error: insertError } = await supabase
    .from('reseller_clients')
    .insert({
      reseller_id: resellerCompanyId,
      client_company_id: clientCompanyId,
      status: 'ACTIVE',
      access_level: 'FULL',
      relationship_start_date: new Date().toISOString()
    });

  if (insertError) {
      if (insertError.code === '23505') {
          console.log('⚠️ Correct link already exists.');
      } else {
          console.error('❌ Failed to create correct link:', insertError);
      }
  } else {
      console.log('✅ Success! Correct link created.');
  }
}

run();
