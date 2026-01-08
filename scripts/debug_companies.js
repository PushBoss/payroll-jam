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
  console.log('🔄 Debugging Reseller Clients Query...');

  const resellerEmail = 'aarongardiner6@gmail.com';
  
  // 1. Get Reseller ID
  const { data: user } = await supabase.from('app_users').select('id, company_id').eq('email', resellerEmail).single();
  if(!user) { console.error('User not found'); return; }

  const resellerId = user.company_id;
  console.log('Reseller Company ID:', resellerId);

  // 2. Simulate what "getResellerClients" does
  // It selects from reseller_clients table
  const { data: links, error } = await supabase
        .from('reseller_clients')
        .select(`
            id,
            status,
            client_company_id,
            companies:client_company_id (
                id, name, email
            )
        `)
        .eq('reseller_id', resellerId);
        
  if (error) {
      console.error('Error fetching links:', error);
  } else {
      console.log(`Found ${links.length} links directly assigned to this reseller.`);
      links.forEach(l => console.log(` - ${l.companies?.name} (${l.companies?.email})`));
  }
  
  // 3. Check if there are ORPHANED companies that might show up if logic is bad ?
  // No, the logic in ResellerDashboard relies on getResellerClients.
}

run();
