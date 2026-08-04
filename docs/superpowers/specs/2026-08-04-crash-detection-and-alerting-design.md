# Crash detection and alerting (SuperAdmin Crash Logs + admin email)

**Date:** 2026-08-04
**Status:** Approved design — pending implementation

## Context

On 2026-07-21, a security fix removed an insecure env var fallback in `api/_supabaseAdmin.ts`. The replacement env var (`SUPABASE_SERVICE_ROLE_KEY`) was never added to Vercel Production, so every serverless function importing `_supabaseAdmin.ts` crashed at module load (`Node.js process exited with exit status: 1`) for roughly two weeks — including the DimePay webhook handler, card-request creation, and payment-methods listing. Nothing surfaced this: no logs page, no alert, no health check. It was only discovered by chance while investigating an unrelated customer report (Wayne Haye's missing card-on-file). In that window, at least two real customers (Wayne Haye, i-Doc Concierge) ended up with paid-plan access and zero billing records.

Separately, a related but independent bug (see the companion server-confirmed-billing work) let a client-side "payment succeeded" signal grant paid access without server verification — but that's a different fix, tracked separately. This spec is scoped purely to **detecting and surfacing crashes going forward**, so an incident like this is caught in minutes, not weeks.

## Goals

1. Log crashes from both runtimes this app uses — Vercel API routes (`api/*.ts`) and the Supabase edge function (`admin-handler`) — to one place.
2. Specifically catch **module-load-time crashes** (the actual failure mode of the July 21 incident), which a normal in-handler try/catch cannot see, since the process dies before handler code runs.
3. Give SuperAdmin a page to see all logged failures.
4. Email `support@payrolljam.com` for **critical** failures only, throttled so a sustained outage doesn't flood the inbox.

## Non-goals

- A resolve/acknowledge workflow for crash log rows (list + filter only, for now).
- Per-user/role alert preferences — one fixed destination address.
- Third-party monitoring (Sentry, Datadog, etc.) — nothing like that exists in this project today; this is a self-contained, in-app mechanism consistent with how `audit_logs` and `dimepay_webhook_events` already work.
- Fixing the client-trust billing gap itself — tracked as its own, separate design.

## Design

### 1. Data model

New table `system_crash_logs`:

```sql
create table public.system_crash_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('vercel-api', 'supabase-edge')),
  endpoint text not null,
  severity text not null check (severity in ('critical', 'error')),
  error_message text not null,
  error_stack text,
  context jsonb,
  email_sent boolean not null default false
);
```

Row-level security: readable only by `SUPER_ADMIN` (mirrors existing `audit_logs`/platform-level tables); writes go through the service-role client only (both runtimes already have one).

`context` is passed through the **same `redact()` helper already used in `api/_dimepayWebhook.ts`** for logging webhook payloads, so request bodies/headers never leak tokens or secrets into a log row.

### 2. Two capture mechanisms (the core of this design)

**In-handler wrapper** — `api/_crashLogger.ts` exports `withCrashLogging(handler, { endpoint, critical })`, a thin wrapper applied to each `api/*.ts` default export. It catches anything thrown during handler execution, logs a row (`severity: critical ? 'critical' : 'error'`), then re-throws/responds exactly as the handler already does today — no behavior change on the happy path, and no change to existing error responses.

**Scheduled health check** — this is what specifically closes the July 21 gap. A static top-level `import { supabaseAdmin } from './_supabaseAdmin.js'` is exactly what crashed the process before any handler code ran; wrapping the *handler body* in try/catch can't help, because the crash happens during module resolution, before the wrapper itself is even reachable. So:
- New `api/health.ts` — inside the handler function (not at module top level), it does `await import('./_supabaseAdmin.js')` and a DimePay credential resolution check, each in their own try/catch, returning `{ ok: true }` (200) or `{ ok: false, failures: [...] }` (500) with which specific dependency failed.
- New `api/cron/health-check.ts` (same pattern as the existing `api/cron/dimepay-billing.ts`), scheduled every 15 minutes via `vercel.json`, calls `/api/health`. Any non-200 is logged as `severity: 'critical'` immediately.

### 3. Supabase edge function (`admin-handler`) side

`admin-handler` already has one outer `catch (error: any)` wrapping its entire action switch (`console.error('Admin Handler Error:', error.message)` today). Extend that single catch block to also insert a `system_crash_logs` row (`source: 'supabase-edge'`, `endpoint: action`) using the adminClient already in scope there — no changes needed inside individual actions. `severity: 'critical'` when the action is billing/payment-related (matching the existing action names touching `subscriptions`/`payment_history`/`dimepay_billing_intents`/`approve-payment`); everything else is `'error'`.

### 4. Severity → email logic

`critical`: health-check failures, and unhandled errors on the payment-critical `api/*.ts` endpoints (`dimepay-webhook`, `billing/dimepay/card-request`, `payment-methods`, `upgrade-subscription`, `sign-payment`, `cancel-subscription`, `update-subscription-payment-method`) or billing-related edge actions.
`error`: everything else — logged and visible on the SuperAdmin page, no email.

Before sending, check for an existing `critical` row with the same `(endpoint, error_message)` pair inserted in the last 30 minutes; if found, skip the email (the row still gets logged). This is a simple dedupe query against `system_crash_logs`, no new infrastructure.

Email delivery reuses the existing Brevo integration (the same mechanism `sendManualUpgradeNotification` in `admin-handler` already uses) — destination is a new env var `CRASH_ALERT_EMAIL=support@payrolljam.com`, not hardcoded, set as a Vercel env var (for the `api/*.ts` side) and a Supabase edge function secret (for `admin-handler`).

### 5. SuperAdmin → Crash Logs page

New tab in `SuperAdmin.tsx`, following the existing tab pattern already used there (e.g., the activation funnel/broadcasts tabs). Table columns: timestamp, source, endpoint, severity (colored badge, red for critical), error message. Filters: severity, source, date range. Backed by a new `get-crash-logs` `admin-handler` action (mirrors `get-compliance-reports`'s shape: `assertSuperAdmin`, paginated select from `system_crash_logs`).

## Files to change

- **New migration** `supabase/migrations/<date>_system_crash_logs.sql` — table + RLS.
- **`api/_crashLogger.ts`** (new) — `logCrash()` + `withCrashLogging()` wrapper, reusing the `redact()` pattern from `api/_dimepayWebhook.ts`.
- **`api/health.ts`** (new) — dynamic-import health check.
- **`api/cron/health-check.ts`** (new) — calls `/api/health` on a schedule; `vercel.json` cron entry added.
- **Payment-critical `api/*.ts` files** — wrap each handler with `withCrashLogging(..., { critical: true })`: `dimepay-webhook.ts`, `billing/dimepay/card-request.ts`, `payment-methods.ts`, `upgrade-subscription.ts`, `sign-payment.ts`, `cancel-subscription.ts`, `update-subscription-payment-method.ts`. Other `api/*.ts` files get the wrapper with `critical: false` (logged, not emailed) — same pattern repeated, not enumerated per-file here.
- **`supabase/functions/admin-handler/index.ts`** — extend the existing outer `catch` block; add `get-crash-logs` action.
- **`src/pages/SuperAdmin.tsx`** — new Crash Logs tab.
- **`example.env`** — document `CRASH_ALERT_EMAIL`.

## Verification

- `npm run build` — no type errors.
- Manually trigger a handled error in a non-critical endpoint → confirm a row appears in `system_crash_logs` with `severity: 'error'` and **no** email sends.
- Manually trigger a failure in a payment-critical endpoint (e.g., temporarily point DimePay credentials at an invalid value in a test environment) → confirm a `critical` row and one email to `support@payrolljam.com`.
- Trigger the same critical error twice within 30 minutes → confirm only one email sends, two rows logged.
- Temporarily break `/api/health` (simulate the original bug) and confirm the next cron run logs a `critical` row and emails, without needing any real user traffic to hit the broken endpoint first.
- Load the SuperAdmin Crash Logs page, confirm filtering by severity/source works and only `SUPER_ADMIN` can access it.
