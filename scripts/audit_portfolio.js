
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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
  console.log('🔄 Auditing Companies & Links...');

  // 1. All Companies
  const { data: companies } = await supabase.from('companies').select('id, name, email, reseller_id');
  console.log(`\n🏢 Total Companies: ${companies.length}`);
  console.table(companies.map(c => ({ 
      name: c.name, 
      email: c.email, 
      reseller_linked: c.reseller_id ? 'YES' : 'NO' 
  })));

  // 2. All Links
  const { data: links } = await supabase.from('reseller_clients').select('reseller_id, client_company_id');
  console.log(`\n🔗 Total Active Links: ${links.length}`);
  console.table(links);

  // 3. Current Reseller
  const resellerEmail = 'aarongardiner6@gmail.com';
  const { data: resellerUser } = await supabase.from('app_users').select('company_id').eq('email', resellerEmail).single();
  
  if (resellerUser) {
      console.log(`\n👤 Current Reseller ID: ${resellerUser.company_id}`);
      
      const myLinks = links.filter(l => l.reseller_id === resellerUser.company_id);
      console.log(`✅ You own ${myLinks.length} links.`);
      
      const orphaned = companies.filter(c => 
          c.id !== resellerUser.company_id && // Not me
          !links.find(l => l.client_company_id === c.id) // Not linked to ANYONE
      );
      
      console.log(`\n⚠️ Orphaned Companies (Not linked to any reseller): ${orphaned.length}`);
      if (orphaned.length > 0) {
          console.table(orphaned.map(c => ({ id: c.id, name: c.name, email: c.email })));
      }
  }
}

run();
