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
  const clientEmail = 'info@pushtechsolutions.com'; // The managed company

  const { data: clientUser } = await supabase.from('app_users').select('company_id').eq('email', clientEmail).single();
  const companyId = clientUser.company_id;

  console.log(`\n🏢 DEBUG: Company ID for ${clientEmail}: ${companyId}`);

  // 1. Fetch Employees for this company
  const { data: emps } = await supabase.from('employees').select('id, first_name, email').eq('company_id', companyId);
  console.log(`\n👥 Employees Found for Company ${companyId}:`);
  console.table(emps);

  // 2. Fetch PayRuns
  const { data: runs } = await supabase.from('pay_runs').select('id, status, pay_date').eq('company_id', companyId);
  console.log(`\n💰 Pay Runs Found for Company ${companyId}:`);
  console.table(runs);
}

run();
