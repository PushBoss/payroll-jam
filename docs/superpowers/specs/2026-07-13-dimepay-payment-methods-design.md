<!-- ai-context
feature: payments/dimepay, billing/subscriptions
status: current
summary: Design for multi-card payment methods (up to 5, one primary), bank transfer as an upgrade option, DimePay ledger completeness for card mutations, and subscription expiry/expired email notifications.
do-not-change: payment_methods primary-uniqueness invariant, subscriptions.dime_card_token sync-with-primary invariant (read by api/cron/dimepay-billing.ts), dimepay_ledger append-only trigger, CRON_SECRET bearer-auth pattern for cron endpoints.
-->

# Design: DimePay Payment Methods, Bank Transfer Upgrades & Expiry Notifications

**Date:** 2026-07-13
**Status:** Approved — ready for implementation planning
**Scope:** Backend (Vercel serverless functions, Supabase schema), frontend (Signup, Settings → Billing)

---

## Problem Statement

Payroll-Jam runs on a subscription model via DimePay, but the current implementation has gaps:

1. **Single card slot only.** `subscriptions` stores exactly one card (`dime_card_token`, `card_last_four`, `card_brand`). There is no way for a user to keep more than one card on file or choose which one is charged.
2. **Upgrade flow is card-only.** `Settings.tsx`'s upgrade path (`PaymentMethodModal`) only offers the DimePay card widget. Bank transfer — already a working option at signup (`Signup.tsx`, "direct-deposit") — has no equivalent when upgrading an existing account.
3. **Card additions don't always land in the ledger.** `dimepay_ledger` (append-only, tamper-proof) is fed only from the DimePay webhook handler. The client-initiated card-add flow (`api/update-subscription-payment-method.ts`) never writes a ledger row itself — it depends on an async webhook to backfill it, which is a gap, not a design choice.
4. **No expiry/renewal emails exist.** `src/app/api/cron/expiry-check/route.ts` looks like it implements a 5-day warning, but it is dead code: Next.js App Router format (never executes on this Vite/Vercel app), and it uses a fake in-memory `db` client and a "Mock Email sender" — no real email has ever been sent by it. Grepping `api/` confirms there is currently no billing-lifecycle email of any kind (no failed-payment, no expiring, no expired notices).

This design adds: a real multi-card vault with a primary selector, bank transfer as an upgrade payment option (reusing the signup bank-transfer screen), ledger completeness for card mutations, and a real expiry/expired notification cron.

---

## Decisions Locked In During Brainstorming

- Card-on-file is required for **paid-plan signups only**. Free-plan and team-invite signups keep skipping billing entirely, unchanged.
- Choosing bank transfer (at signup or upgrade) does **not** exempt a paid account from having a card on file — a card is still tokenized in the background so the subscription is renewal-ready even if a transfer is late or rejected.
- The "5 methods, 1 primary" cap applies to **cards only**. Bank transfer stays a one-off action (submit details → admin approval), not a saved/reusable method — DimePay cannot auto-debit a bank account, so there's nothing to "save" in the same sense.
- Upgrade's card step lets the user **pick an existing saved card or add a new one**, rather than always forcing a fresh card entry.
- Expiring-soon emails go only to subscriptions that actually need action: bank-transfer subscriptions, and card subscriptions with no valid card on file. Card subscriptions with a valid card auto-renew via DimePay and are not notified by this system.
- Cancelling a subscription (existing feature, `api/cancel-subscription.ts` — unchanged by this design) does **not** delete saved cards. `payment_methods` rows and the primary flag are left intact so a resubscribe doesn't require re-entering card details, consistent with the cancel flow's existing "can resubscribe anytime" messaging.

---

## Architecture Overview

```
Signup.tsx (paid plan)
  ├─ card path ──────────────► DimePay widget tokenizes ──► payment_methods (is_primary=true, 1st row)
  └─ bank-transfer path ─────► bank details submitted           │
                                  │                              │
                                  └──► DimePay widget (required second step, same as card path)

Settings.tsx (Billing tab, upgrade)
  PlanSelectorModal ──► choose plan ──► choose payment method
     ├─ card: pick saved method (radio, default = primary) OR "Add new card" (DimePay widget)
     └─ bank transfer: reuses <BankTransferInstructions> component (extracted from Signup.tsx)
                         → PENDING_APPROVAL → admin-handler `approve-payment` (extended for upgrades)

Settings.tsx (Billing tab, new "Payment Methods" section)
  list payment_methods ──► Set Primary / Remove ──► sync subscriptions.dime_card_token + DimePay update

api/update-subscription-payment-method.ts (existing, extended)
  └─ on every card add/primary-change/remove: insert payment_methods row + write dimepay_ledger row synchronously

api/cron/subscription-expiry-check.ts (new, replaces dead route)
  └─ daily: find subscriptions needing "expiring soon" or "expired" email → send via send-email edge function
```

---

## Data Model

### New table: `payment_methods`

```sql
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  dime_card_token text NOT NULL,
  card_last4 text,
  card_brand text,
  card_expiry_month int,
  card_expiry_year int,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Exactly one primary per company
CREATE UNIQUE INDEX idx_payment_methods_one_primary
  ON public.payment_methods(company_id)
  WHERE is_primary;

CREATE INDEX idx_payment_methods_company
  ON public.payment_methods(company_id, created_at DESC);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
```

The 5-method cap is enforced in the API layer (a count check before insert), not the database — it's a product rule that may change, and a DB constraint would need a migration to adjust.

### `subscriptions` (unchanged schema, new invariant)

`dime_card_token`, `card_last_four`, `card_brand` remain on `subscriptions`. They are a **denormalized cache of whichever `payment_methods` row is primary** for that company, kept in sync on every add/set-primary/remove. This is intentional: `api/cron/dimepay-billing.ts` reads these columns directly to charge recurring subscriptions, and this design does not touch that cron job. Any code path that changes which card is primary must update `subscriptions` in the same transaction/request.

### Bank transfer — no new storage

Bank transfer continues to use the existing `payment_history` table (already has a `payment_method` column distinguishing card vs. bank transfer) and the existing `CompanyStatus = 'PENDING_APPROVAL'` state, both already used by the signup direct-deposit path. No new table needed.

---

## Flow: Signup (paid plans)

Unchanged for the card path except that the tokenized card is now inserted into `payment_methods` (`is_primary = true`, since it's the account's first card) instead of only being written onto `subscriptions`.

For the bank-transfer path: after the user submits bank transfer details (same screen as today), signup now requires a **second step** — the DimePay card widget — before the account is created, with copy explaining that a card is needed to keep the subscription active even though this cycle is being paid by transfer. The resulting card is saved as primary. Free-plan and team-invite signups are unaffected — they still skip billing entirely.

---

## Flow: Upgrade (Settings → Billing)

1. User opens `PlanSelectorModal`, picks a plan (unchanged).
2. New payment-method step:
   - **Bank transfer**: renders `<BankTransferInstructions>`, a component extracted from `Signup.tsx`'s existing bank-transfer block (same bank details/instructions copy, no duplicated markup). Submitting sets the company to `PENDING_APPROVAL` and creates a `payment_history` row, exactly as signup does today. If the account has no card on file yet (e.g. a legacy account), the same "add a card" prompt from signup is shown before the upgrade request completes.
   - **Card**: if `payment_methods` has rows, show them as a radio list (brand, last4, "Primary" badge), defaulting to the primary method, with an "Add new card" option that opens the existing DimePay widget (`PaymentMethodModal`, unchanged UI, new persistence target). A newly added card is **not** auto-primary unless it's the account's first card.
3. Admin approval for upgrade-via-bank-transfer reuses the existing `approve-payment` admin-handler action, extended to handle "upgrade an existing active subscription" in addition to "activate a new signup" (it currently assumes the latter).

---

## Flow: Payment Methods Management (new UI)

New section in Settings → Billing, below the existing subscription/payment-history cards:

- Lists saved cards: brand, last4, expiry, "Primary" badge.
- **Set as primary**: updates `payment_methods.is_primary`, re-syncs `subscriptions.dime_card_token`/`card_last_four`/`card_brand`, and calls DimePay (`updateDimePaySubscriptionCard`, already exists in `api/_dimepay.ts`) so the *next* recurring charge uses the new card.
- **Remove**: blocked if it's the only card on an active subscription (must set another primary first, or the subscription would have no working card).
- **Add payment method**: opens the DimePay widget; button is disabled once 5 cards exist, with a tooltip explaining the cap.

---

## Ledger Completeness

`dimepay_ledger` is append-only and already has a `card_bound` state. Today it's only written from the webhook handler (`api/_dimepayWebhook.ts`). This design adds a **synchronous** ledger write from `api/update-subscription-payment-method.ts` on every card add, primary change, and removal, using the existing `appendDimePayLedgerEvent` helper. Because ledger inserts are deduped by `event_id`/`dimepay_reference_id` (existing unique index), a later webhook event for the same action is a no-op duplicate, not a double-count — so both the synchronous write (immediate, reliable) and the webhook (eventual, authoritative) can coexist safely.

---

## Expiry & Expired Email Notifications

Replaces `src/app/api/cron/expiry-check/route.ts` (dead — Next.js format, fake DB client, mock email sender, never runs) with `api/cron/subscription-expiry-check.ts`, following the same pattern as the working `api/cron/dimepay-billing.ts`: a Vercel serverless function gated by `Authorization: Bearer ${CRON_SECRET}`, intended to be hit by whatever external scheduler already triggers `dimepay-billing` (this repo has no Vercel `crons` config or GitHub Action driving that job today — scheduling is an existing external/ops concern, not something this design changes).

**Expiring soon** (send once, ~3 days before `access_until`):
- Eligible: subscriptions where `payment_method` is bank transfer, OR the company has no row in `payment_methods` (no valid card on file).
- Card subscriptions with a valid primary card are skipped — DimePay auto-renews them.
- Guarded by `subscriptions.metadata.expiry_warning_sent_at` so it fires once per billing period, not once per cron run.
- Email sent via the existing `send-email` Supabase edge function (generic `to`/`subject`/`html` — no template changes needed there) to the company's admin email.

**Expired** (send once, when `access_until` has passed and status is still `past_due`/`pending`, i.e. grace period exhausted):
- Applies regardless of payment method — this is the "you've actually lost access" notice.
- Guarded by `subscriptions.metadata.expiry_notice_sent_at`.
- Does not change existing status-transition logic (`past_due` → `SUSPENDED` handling elsewhere is unaffected) — this cron only adds the email side effect on top of whatever status the subscription already ends up in.

Out of scope: failed-payment-attempt emails (DimePay's own retry/webhook cycle already handles those operationally; the user asked specifically for expiring/expired, not full dunning emails — adding that here would be scope creep).

---

## Error Handling & Edge Cases

- **Card removal race**: removing the primary card while it's the only one is rejected at the API level (`400`, "set another card as primary first").
- **5-card cap**: enforced server-side in the add-card endpoint, not just the UI, so it can't be bypassed by direct API calls.
- **Duplicate ledger events**: existing unique index on `dimepay_ledger(event_id)` (partial, `WHERE event_id IS NOT NULL`) already deduplicates; the new synchronous write path relies on this, no new dedup logic needed.
- **Bank transfer upgrade with no card on file**: blocked from completing until a card is added, consistent with the "card always required for paid accounts" rule.
- **Cron re-runs**: both expiry email paths are idempotent via the `metadata.*_sent_at` guards, so re-running the cron (e.g. after a retry) never double-sends.
- **DimePay primary-card update failure**: if `updateDimePaySubscriptionCard` fails when setting a new primary, the `payment_methods.is_primary` flag and `subscriptions.dime_card_token` sync are not committed — the UI surfaces the DimePay error and the previous primary remains active, so the recurring-billing cron never ends up pointing at an unconfirmed card.

---

## Testing Plan

- **Sandbox DimePay test cards** (`4242 4242 4242 4242` success / `4000 0000 0000 0002` failure, per existing `RECURRING_BILLING_SETUP.md`) for: signup card path, signup bank-transfer-then-card path, upgrade with existing card, upgrade with new card, add/remove/set-primary sequences.
- **Primary-sync invariant**: after any add/remove/set-primary sequence, assert `subscriptions.dime_card_token` always matches the current `payment_methods` row where `is_primary = true`.
- **5-card cap**: attempt a 6th add via direct API call, expect rejection.
- **Ledger dedup**: trigger a card add, confirm one ledger row; simulate the corresponding webhook firing afterward, confirm no duplicate row (or an ignored duplicate per the existing `error.code === '23505'` handling).
- **Cron dry run**: seed subscriptions with `access_until` at various offsets (both payment methods, with/without saved cards) and invoke the cron directly with `CRON_SECRET`, asserting the right subset gets emails and the `*_sent_at` guards prevent resends on a second invocation.
- **Bank-transfer upgrade approval**: verify the extended `approve-payment` admin action correctly transitions an *existing active* subscription (not just a brand-new signup).
