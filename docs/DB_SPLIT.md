# DB Split Runbook (Prod → Staging)

Date: 2026-04-09

Goal: create a **separate Supabase project** for `staging.payrolljam.com` that has:
- a copy of the **prod schema** (tables, functions, RLS/policies, triggers)
- a **small, curated data slice** (1–N “test tenants”) so staging behaves realistically

This runbook assumes:
- Production site: `https://www.payrolljam.com`
- Staging site: `https://staging.payrolljam.com`
- The app uses:
  - Frontend env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  - Serverless API env vars (Vercel functions like `api/dimepay-webhook.ts`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - Supabase Edge Functions (e.g. `supabase/functions/admin-handler`) deployed via Supabase CLI

---

## 0) Pre-flight decisions

### A) Pick the staging data slice (recommended)
Pick **1–3 tenant companies** that are safe to copy (ideally internal/test tenants). For each chosen company:
- capture `company_id` (UUID)
- capture “owner/user” ids (from `companies.owner_id` or membership tables)

Recommended rule: **Do not copy real payroll/employees for real customers.** If you need realism, copy structure and then anonymize (see “PII safety” below).

### B) Authentication strategy
You have two viable options:
1) **Fresh staging auth** (recommended): staging users re-sign up / re-invite; easiest + safest.
2) **Copy some users** into staging: only do this for internal/test accounts and only if you’re comfortable with the security implications.

---

## 1) Create new Supabase project (staging)

1. Supabase dashboard → New project
2. Name: `payroll-jam-staging`
3. Save:
   - `STAGING_PROJECT_REF`
   - `STAGING_DB_PASSWORD` (or the connection string)
   - Anon key + Service role key

---

## 2) Copy schema from prod → staging (schema-only)

This is the fastest way to make staging identical to prod.

### 2.1 Get connection strings
In Supabase:
- Project → Settings → Database → Connection string

You’ll need:
- `PROD_DB_URL` (postgres connection string)
- `STAGING_DB_URL`

### 2.2 Export schema from prod
Run locally:

```bash
pg_dump "$PROD_DB_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  > prod_schema.sql
```

### 2.3 Import schema into staging

```bash
psql "$STAGING_DB_URL" -f prod_schema.sql
```

Notes:
- This should bring over functions, triggers, RLS policies, etc.
- If you get permission errors, re-check you’re using the right DB user/connection string.

---

## 3) Seed required “platform” rows (if any)

Some systems require platform rows to exist before the app can run (examples):
- `global_config` single-row config
- `pricing_plans` table (if used)

If your prod schema already has defaults inserted via migrations, you might not need this.

Sanity check in staging SQL editor:
- confirm `global_config` exists and has a row if your app expects one

---

## 4) Copy a data slice (company-centric)

Because `pg_dump` can’t easily “WHERE-filter” rows across many tables, the safest repeatable approach is:
1) build an **ID list** (company ids + related ids)
2) export each table slice with `COPY (SELECT … WHERE …)`
3) import into staging with `COPY table FROM STDIN` OR plain inserts

### 4.1 Identify the tables you want to slice
These are typical for this app; adjust based on your actual schema:
- `companies`
- `subscriptions`
- `payment_history` / `payments` (if exists)
- `account_members` (team members)
- `app_users` (profile rows)
- `employees`
- `pay_runs`
- `leave_requests`, `timesheets` (if you want realistic payroll history)

### 4.2 Export slice from prod (example approach)

In a `psql` session connected to PROD:

```sql
-- 1) Choose your staging companies
-- Replace with your selected UUIDs
\set company_ids '''11111111-1111-1111-1111-111111111111'',''22222222-2222-2222-2222-222222222222'''

-- 2) Export companies
\copy (
  select * from companies where id in (:company_ids)
) to 'companies.csv' csv header;

-- 3) Export subscriptions (if company_id exists)
\copy (
  select * from subscriptions where company_id in (:company_ids)
) to 'subscriptions.csv' csv header;

-- 4) Export employees
\copy (
  select * from employees where company_id in (:company_ids)
) to 'employees.csv' csv header;

-- 5) Export pay_runs
\copy (
  select * from pay_runs where company_id in (:company_ids)
) to 'pay_runs.csv' csv header;

-- 6) Export account_members (if used)
\copy (
  select * from account_members where account_id in (:company_ids)
) to 'account_members.csv' csv header;

-- 7) Export app_users for users who belong to those accounts
-- This depends on your schema. Typical approaches:
--   - app_users.company_id in company_ids
--   - OR join via account_members.user_id
\copy (
  select au.*
  from app_users au
  where au.company_id in (:company_ids)
) to 'app_users.csv' csv header;
```

If `app_users.company_id` is not sufficient (e.g., team members can belong to multiple accounts), export `app_users` via `account_members.user_id`:

```sql
\copy (
  select au.*
  from app_users au
  where au.id in (
    select distinct user_id
    from account_members
    where account_id in (:company_ids)
      and user_id is not null
  )
) to 'app_users.csv' csv header;
```

### 4.3 Import slice into staging

In a `psql` session connected to STAGING:

```sql
\copy companies from 'companies.csv' csv header;
\copy subscriptions from 'subscriptions.csv' csv header;
\copy app_users from 'app_users.csv' csv header;
\copy account_members from 'account_members.csv' csv header;
\copy employees from 'employees.csv' csv header;
\copy pay_runs from 'pay_runs.csv' csv header;
```

If you hit foreign key ordering issues:
- import parent tables first (`companies`, `app_users`)
- then membership tables (`account_members`)
- then children (`employees`, `pay_runs`, etc.)

If you hit unique conflicts (because defaults already exist):
- use temporary tables + `INSERT ... ON CONFLICT DO NOTHING/UPDATE`

---

## 5) PII safety (recommended)

Before importing into staging, anonymize at least:
- emails
- phone numbers
- names
- addresses

Two approaches:
- Anonymize in CSV before import
- Or import then run `UPDATE` statements in staging:

```sql
-- Example anonymization patterns (adjust columns as needed)
update app_users
set email = concat('test+', id, '@example.com')
where email not like '%@yourcompany.com';

update employees
set email = null,
    phone = null,
    address = null;
```

---

## 6) Configure Supabase Auth URLs for staging

In **staging Supabase project**:
- Auth → URL configuration
  - Site URL: `https://staging.payrolljam.com`
  - Redirect URLs: `https://staging.payrolljam.com/*`

In **prod Supabase project**:
- Site URL: `https://www.payrolljam.com`
- Redirect URLs: `https://www.payrolljam.com/*`

This is critical for password reset + email verification.

---

## 7) Configure Vercel env vars (staging vs prod)

### 7.1 Staging (Preview/Branch) env vars
Set in the Vercel project/environment that powers `staging.payrolljam.com`:
- `VITE_SUPABASE_URL=https://<STAGING_PROJECT_REF>.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<STAGING_ANON_KEY>`
- `SUPABASE_URL=https://<STAGING_PROJECT_REF>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<STAGING_SERVICE_ROLE_KEY>`

Redeploy staging.

### 7.2 Production env vars
Keep pointing at prod Supabase:
- `VITE_SUPABASE_URL=https://<PROD_PROJECT_REF>.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<PROD_ANON_KEY>`
- `SUPABASE_URL=https://<PROD_PROJECT_REF>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<PROD_SERVICE_ROLE_KEY>`

---

## 8) Redeploy Supabase Edge Functions (staging)

Your repo includes Supabase functions under `supabase/functions/*`.

Deploy to staging Supabase:

```bash
supabase login
supabase link --project-ref <STAGING_PROJECT_REF>

# secrets (if needed)
# supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."

supabase functions deploy admin-handler --no-verify-jwt
supabase functions deploy send-email --no-verify-jwt
```

---

## 9) DimePay webhooks (sandbox vs production)

After DB split, **never point sandbox webhooks at prod**.

- DimePay Sandbox dashboard → webhook endpoint:
  - `https://staging.payrolljam.com/api/dimepay-webhook`
  - Staging env var: `DIMEPAY_WEBHOOK_SECRET_SANDBOX=...`

- DimePay Production dashboard → webhook endpoint:
  - `https://www.payrolljam.com/api/dimepay-webhook`
  - Production env var: `DIMEPAY_WEBHOOK_SECRET_PROD=...`

Redeploy the site after env var changes.

---

## 10) Validation checklist

### 10.1 Staging
- Login works
- `app_users` row exists for authenticated users
- Company loads
- Payroll basics load
- Sandbox DimePay webhook events update staging DB (not prod)

### 10.2 Production
- No change expected except continuing to work normally
- Production DimePay webhook events update prod DB

---

## 11) Rollback plan

If staging breaks:
- revert staging Vercel env vars back to prod Supabase temporarily
- or redeploy previous known-good staging deployment

---

## Notes specific to this repo

- Frontend Supabase client initialization: `src/services/supabaseClient.ts`
- Serverless webhook uses admin key: `api/_supabaseAdmin.ts` + `api/dimepay-webhook.ts`
- Supabase Edge Functions: `supabase/functions/admin-handler/*`

