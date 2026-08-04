# Server-confirmed billing

## Problem

`companies.plan` — the field that gates feature access — is currently set directly by the
browser the instant DimePay's embedded payment widget fires its client-side `onSuccess`
callback, in two places:

- `src/pages/Settings.tsx` (`CheckoutModal` → `finalizeUpgrade`) — existing customer upgrading.
- `src/pages/Signup.tsx` (`handleSubmit`) — new company signing up directly onto a paid plan.

Nothing server-side ever confirms the charge before granting access. This is how a customer
(Wayne Haye / Haye's Accounting) ended up on a paid plan with no card on file and no payment
records: the widget's JS callback is client-controlled and was trusted unconditionally.

The webhook handler (`api/_dimepayWebhook.ts`) is already signature-verified and already writes
`subscriptions` / `payment_history` correctly on real DimePay events — it just never touches
`companies.plan`. `api/upgrade-subscription.ts`'s `upgradeWithExistingCard` and
`upgradeWithBankTransfer` paths are already safe (server-to-server DimePay call checked before
any DB write, or routed through SuperAdmin manual approval) and are out of scope.

## Design

### 1. Webhook becomes the sole plan-grant authority

In `applySubscriptionCreated` (new paid signup / new paid upgrade) and `applyPaymentSucceeded`
(recurring renewal) in `api/_dimepayWebhook.ts`:

- After the existing subscription/payment_history writes, look up the real price for
  `metadata.plan_name` from `global_config` (`id = 'platform'`, the same source SuperAdmin
  writes to via `handleUpdatePlans`).
- Only if `data.amount` (the amount DimePay's signed payload confirms was actually charged)
  meets that plan's price, set `companies.plan = metadata.plan_name` alongside the existing
  `status = 'ACTIVE'` write in `updateCompanyBillingState`.
- If the amount doesn't meet the plan's price, do not grant the plan. Log it via
  `logCrash` (`api/_crashLogger.ts`) at `critical` severity so it surfaces in the SuperAdmin
  Crash Logs tab and emails `support@payrolljam.com`, instead of silently trusting
  client-supplied metadata.

### 2. Settings upgrade flow

`CheckoutModal`'s widget `onSuccess` no longer calls `finalizeUpgrade` (which currently writes
`companies.plan` itself). Instead:

- On `onSuccess`, flip to a blocking "Confirming payment..." state and poll until
  `companies.plan === targetPlan.name` (adapting the existing `waitForBillingSync` helper,
  whose success condition changes from "a subscription record with a card token exists" to
  the actual server-confirmed plan).
- On confirmation (typically seconds): close the modal, run the non-billing parts of
  `finalizeUpgrade` (audit log, reseller role/company-managed setup, notification email,
  success toast) — drop the `handleCompanyUpdate({ plan: ... })` call, since the webhook
  already set it.
- On timeout (~30-45s): show "We're still confirming your payment — you'll be upgraded
  automatically once it clears; refresh in a minute if this persists." Do not grant the plan
  client-side as a fallback.

### 3. Signup paid-plan flow

Same fix, at account-creation time:

- The company row is always created with `plan: 'Free'` when payment is by card, regardless
  of `formData.plan`. The target plan is already passed to DimePay as `metadata.plan` /
  `metadata.planName`, so the webhook has what it needs to grant the real plan once confirmed.
- The widget's `onSuccess` (which currently calls `handleSubmit()` directly) triggers the same
  "confirming payment" wait state as Settings after `handleSubmit()` completes account
  creation, polling `companies.plan === formData.plan` before treating signup as complete.
- On confirmation: proceed to the existing "redirect to verify email" success path.
- On timeout: same non-scary messaging as Settings — account exists, email verification can
  proceed, plan applies once confirmed.
- `paymentMethod === 'direct-deposit'` (bank transfer) and team-invitation signups are
  unaffected — they already go through manual approval or default to Free.

## Edge cases

- **Webhook never arrives** (DimePay outage/misconfiguration): the customer keeps
  waiting/sees the "still confirming" message but is never incorrectly upgraded — deny-by-
  default instead of grant-by-default. The crash-detection health check (shipped separately)
  also now watches this backend, catching an outage within 15 minutes instead of weeks.
- **Amount/plan mismatch** (tampered client metadata): denied and logged as a `critical`
  crash-log entry.
- **Duplicate/replayed webhook events**: already handled by existing `dimepay_webhook_events`
  event-id dedupe; untouched by this change.

## Out of scope

- `upgradeWithExistingCard` / `upgradeWithBankTransfer` server flows — already safe, untouched.
- Broader DimePay integration audit findings
  (`docs/dimepay-integration-security-audit-report.md`, F1-F6) — separate backlog item.
- Retroactive handling of the 5 customers found in the earlier billing-outage blast-radius
  scan — open decision, unrelated to this code change.

## Testing

- `npm run build` — typecheck.
- Manual, against the real Supabase project:
  1. Settings upgrade with a test card — confirm plan only flips after the "confirming" state
     resolves; verify `companies.plan` was set by the webhook path, not a direct client write.
  2. New paid signup with a test card — confirm company is created on Free and flips to the
     paid plan only post-webhook.
  3. Simulate a mismatched amount (temporarily point metadata at a pricier plan) to confirm
     it's denied and logged, not granted.
