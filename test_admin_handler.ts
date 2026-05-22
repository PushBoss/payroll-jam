import * as fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1];

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
}

async function test() {
  // Let's invoke the admin-handler directly to see the full error
  const res = await fetch(`${url}/functions/v1/admin-handler`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      action: 'save-employee-for-company',
      payload: {
        companyId: '9418e1bc-222d-4468-9953-c900710a62c8',
        mode: 'insert',
        employee: {
          id: 'test-id-1234',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe.csv.test@example.com',
          trn: '',
          nis: 'PENDING',
          grossSalary: 1000,
          payType: 'SALARIED',
          payFrequency: 'MONTHLY',
          employeeType: 'STAFF',
          role: 'EMPLOYEE',
          status: 'ACTIVE',
          hireDate: '2026-01-01',
          bankDetails: {
            bankName: 'NCB',
            accountNumber: '',
            accountType: 'SAVINGS',
            currency: 'JMD'
          }
        }
      }
    })
  });

  const text = await res.text();
  console.log(`Status: ${res.status}`);
  console.log(`Body: ${text}`);
}

test();
