const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env
const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    envVars[match[1]] = value;
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseAnonKey = envVars.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase config in .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  try {
    console.log('🔍 Querying Supabase for aarongardiner6@gmail.com...');
    
    // Find the user
    const { data: user, error: userError } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', 'aarongardiner6@gmail.com')
      .maybeSingle();
      
    if (userError) {
      console.error('Error fetching user:', userError);
    } else if (!user) {
      console.log('User not found.');
    } else {
      console.log('👤 User details:', {
        id: user.id,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
        created_at: user.created_at
      });
      
      // Find the company
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', user.company_id)
        .maybeSingle();
        
      if (companyError) {
        console.error('Error fetching company:', companyError);
      } else if (!company) {
        console.log('Company not found.');
      } else {
        console.log('🏢 Company details:', {
          id: company.id,
          name: company.name,
          plan: company.plan,
          status: company.status,
          settings: company.settings
        });
        
        // Find subscriptions
        const { data: sub, error: subError } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('company_id', company.id)
          .order('created_at', { ascending: false });
          
        if (subError) {
          console.error('Error fetching subscriptions:', subError);
        } else {
          console.log('💳 Subscription records:', sub.map(s => ({
            id: s.id,
            plan_name: s.plan_name,
            status: s.status,
            start_date: s.start_date,
            next_billing_date: s.next_billing_date,
            dimepay_subscription_id: s.dimepay_subscription_id
          })));
        }
      }
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

run();
