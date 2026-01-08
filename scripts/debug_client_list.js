import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load environment variables
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
  const resellerEmail = 'aarongardiner6@gmail.com';
  
  // 1. Get Reseller ID
  const { data: user } = await supabase.from('app_users').select('id, company_id').eq('email', resellerEmail).single();
  const resellerId = user.company_id;

  console.log(`\n🔍 Reseller ID: ${resellerId}`);

  // 2. Query Reseller Clients (Direct Table)
  const { data: rawLinks, error } = await supabase
    .from('reseller_clients')
    .select('id, reseller_id, client_company_id, status')
    .eq('reseller_id', resellerId);

  console.log(`\n📊 Raw Filtered Links (reseller_id = ${resellerId}): ${rawLinks?.length || 0}`);
  if (rawLinks) console.table(rawLinks);

  // 3. Query ALL Links (Safety Check)
  const { data: allLinks } = await supabase.from('reseller_clients').select('*');
  console.log(`\n🌎 Global Link Count: ${allLinks?.length}`);
  
  // 4. Test the Service Logic (Join)
  const { data: joinedData, error: joinError } = await supabase
    .from('reseller_clients')
    .select(`
        client_company_id,
        companies:client_company_id ( name, email )
    `)
    .eq('reseller_id', resellerId);
    
  console.log('\n🔗 Joined Data Result:');
  if (joinedData) {
      joinedData.forEach(row => {
          console.log(` - ID: ${row.client_company_id}, Name: ${row.companies?.name}, Email: ${row.companies?.email}`);
      });
  } else {
      console.error(joinError);
  }
}

run();
