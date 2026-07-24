# Reseller role / plan decoupling, safe role downgrade, and mandatory signup phone

**Date:** 2026-07-24
**Status:** Approved design — pending implementation plan

## Context / Problem

"Reseller" is currently used as **both** a role (`Role.RESELLER`) **and** a subscription plan value (`companies.plan = "Reseller"`, defined as plan `p4` in `INITIAL_PLANS`). The two are glued together by `isResellerEquivalentPlan(plan)` ([src/utils/planNames.ts](../../../src/utils/planNames.ts)), which derives the reseller role from the plan string — at signup (`deriveCompanySignupRole`) and continuously via a client effect ([src/app/useAppData.ts:68-80](../../../src/app/useAppData.ts)).

This coupling produces role/plan mismatches:

- **aaron.gardiner1@outlook.com** — role `RESELLER`, plan `Free`. Became a reseller once, then the plan changed to Free; the role never downgraded because the sync effect is a **one-way ratchet** (only upgrades OWNER→RESELLER, never downgrades). Result: reseller interface but "Free" in the admin hub. (Already manually corrected to OWNER by the operator.)
- **rosealia19@gmail.com** — role `RESELLER`, plan `"Reseller"` (the conflated artifact; signed up on the p4 Reseller card).
- **andriw@dirtyhanddesigns.com** — role `RESELLER`, plan `Enterprise` (the *intended* model).

Two conventions coexist in the data. The intended model, per the product owner: **Reseller is a role; Enterprise is the plan.** There is currently **no Enterprise entry in the plan catalog** even though `Enterprise` exists as a DB plan value.

Separately, phone is required for company-owner signup and saved to `app_users.phone` and `companies.settings.phone`, but **not** to the dedicated `companies.phone` column (which exists but is never written at signup). Only 23 of 77 `app_users` have a phone.

## Goals

1. Decouple reseller **role** from the **plan**: RESELLER is a role only; a reseller's plan is **Enterprise**.
2. Retire `"Reseller"` as a plan value; add **Enterprise** to the plan catalog carrying the reseller economics.
3. Add a **safe, guarded bidirectional** role sync (fixes stuck roles without stripping real partners).
4. Make **phone mandatory + reliably persisted** for company-owner signup (incl. the empty `companies.phone` column).
5. **Do not break** signup, subscription limits, or upgrade/downgrade billing flows.

## Non-goals

- Changing phone requirements for team-member / reseller-client / employee-portal signups (stays optional there).
- Introducing a distinct non-reseller Enterprise tier (today every Enterprise customer is a reseller — YAGNI).
- Special-casing billing for partners who shouldn't pay — handled by **existing** mechanisms: billing gift / free months (`billingGift` in company settings) or the `isTestCompany` flag (`toggle-test-company`). No new billing-exception logic.

## Design

### 1. Target model

- **RESELLER = role only.** A reseller's plan is **Enterprise**.
- **`"Reseller"` retired as a *stored* plan value.** `"Reseller"` may remain as the client-side selection token for the "Become a Partner" card (a transient signup signal), but it is **never persisted** as `companies.plan` — it maps to `Enterprise` before persistence (see §2). Add an **Enterprise** plan to `INITIAL_PLANS` ([src/services/planService.ts](../../../src/services/planService.ts)) carrying the current Reseller terms: `baseFee 3000`, `perUserFee 500`, `resellerCommission 20`, `limit: 'Unlimited'`, and the white-label / multi-client / partner-support features. This is what stops `useSubscription` from falling back to Free and preserves reseller billing.
- **Reseller-ness is role-based, not plan-string-based.** `isResellerEquivalentPlan` stops being the source of truth for reseller detection; where reseller behavior is needed, key off `role === RESELLER` (and, for the downgrade guard, the `reseller_clients` relationship). The function may remain only to recognize the legacy `"Reseller"` plan string during migration/back-compat.

### 2. Signup flow (works from role OR card; doesn't break)

- The **reseller signal at signup = `userData.role === RESELLER` OR the partner/"Become a Partner" card (`userData.plan === 'Reseller'`)**. Either signal must yield the same result. (The client already computes `companyCreatorRole` from both — preserve that.)
- Client ([src/context/AuthContext.tsx](../../../src/context/AuthContext.tsx) `signup`): when the reseller signal is present, set `effectiveSignupRole = RESELLER` **and** map the stored DB plan to **`Enterprise`** (instead of `"Reseller"`).
- Backend ([supabase/functions/admin-handler/index.ts](../../../supabase/functions/admin-handler/index.ts) `finalize-signup`, `company_signup` branch): **stop deriving the role from the plan string.** Honor an **explicit role / reseller signal** in the payload so `plan = Enterprise` still assigns `role = RESELLER`. All other signup steps (company creation, `account_members`, billing gift, reseller-invite acceptance) unchanged.

### 3. Phone — mandatory + reliably persisted (owner signup only)

- Keep phone required for company-owner signup (already validated in `Signup.tsx`); leave the `input`'s `required` and the `handleAccountSubmit` guard in place.
- Fix persistence so the owner's phone reaches **all three** sinks consistently: `app_users.phone` (already), `companies.settings.phone` (already), **and `companies.phone`** — add `phone` to the `companies` upsert in `finalize-signup` (currently omitted).

### 4. Safe role downgrade (guarded bidirectional sync)

Replace the one-way ratchet in [src/app/useAppData.ts:68-80](../../../src/app/useAppData.ts) with a guarded sync that also downgrades:

- **Upgrade** OWNER/ADMIN → RESELLER when the account is a partner (on Enterprise with the reseller signal) — preserves current intent.
- **Downgrade** RESELLER → OWNER **only when both**: (a) the account has **zero active `reseller_clients`**, **and** (b) it is **not on Enterprise** (nor the legacy `"Reseller"` plan). A genuine partner (has clients, or on Enterprise) is never stripped by a temporary billing lapse.
- Skip entirely while impersonating (`user.originalRole` set), as today.
- The downgrade needs to know the `reseller_clients` count for the account; source it from existing loaded data if available, otherwise a lightweight lookup. Persist the corrected role to the backend (as the current effect already does for the upgrade).

This auto-corrects accounts like aaron.gardiner1 (Free, no clients → OWNER) while leaving andriw (Enterprise) and rosealia19 (Enterprise after migration) untouched.

### 5. Data migration

- Versioned SQL migration: `UPDATE companies SET plan = 'Enterprise' WHERE plan = 'Reseller'` (affects the one company, rosealia19's; role already RESELLER, unchanged).
- aaron.gardiner1 already corrected manually — no migration row needed.
- No other rows affected (only 1 company on the `"Reseller"` plan at design time).

### 6. Subscription safety verification (explicit)

After the change, verify:

- Reseller (Enterprise) accounts keep **unlimited employees** — now via the Enterprise plan's `limit: 'Unlimited'` in `useSubscription`, rather than `isResellerEquivalentPlan`.
- **Reseller billing intact**: backend rate table (`getPlanMonthlyPricing` / `calculatePlanMRR` in `admin-handler`) charges Enterprise at `3000 + 500/user`; the 20% commission still applies. (Note: andriw, already on Enterprise, moves from the old $0 Enterprise rate to reseller rates — intended; non-paying partners are handled via gift/test-account.)
- `useSubscription`'s `activePlan` resolves to the real Enterprise entry (no silent fallback to `plans[0]` / Free).
- Upgrade / downgrade UI and DimePay flows still resolve the correct plan and pricing.

## Files to change (representative)

- [src/services/planService.ts](../../../src/services/planService.ts) — add the Enterprise plan (reseller economics); retire/relabel the `"Reseller"` catalog entry per the card-vs-plan split.
- [src/utils/planNames.ts](../../../src/utils/planNames.ts) — `normalizePlanToDatabase` maps the reseller signal → `Enterprise`; narrow/retire `isResellerEquivalentPlan` as the reseller-detection source.
- [src/context/AuthContext.tsx](../../../src/context/AuthContext.tsx) — signup: reseller signal → `Enterprise` plan + `RESELLER` role.
- [supabase/functions/admin-handler/index.ts](../../../supabase/functions/admin-handler/index.ts) — `finalize-signup`: honor explicit role signal (don't re-derive from plan); write `companies.phone`; confirm `getPlanMonthlyPricing` Enterprise rates.
- [src/app/useAppData.ts](../../../src/app/useAppData.ts) — guarded bidirectional role sync.
- [src/hooks/useSubscription.tsx](../../../src/hooks/useSubscription.tsx) — reseller/unlimited via Enterprise plan limit; role-based where needed.
- `supabase/migrations/<date>_migrate_reseller_plan_to_enterprise.sql` — data migration.
- Audit other `isResellerEquivalentPlan` / `plan === 'Reseller'` call sites (e.g. `ensure-self-profile`, `Signup.tsx`, `SuperAdmin.tsx`) for consistency.

## Verification

- `npm run build` (tsc + vite) — no type errors.
- Unit-level: existing payroll/subscription tests pass; add coverage for the downgrade guard (RESELLER + Free + no clients → OWNER; RESELLER + Enterprise → unchanged; RESELLER + Free + has clients → unchanged).
- Manual, against the real Supabase project (needs local `.env`):
  1. Sign up via the partner card → company provisioned as **Enterprise** plan + **RESELLER** role; lands on reseller dashboard; phone saved to `app_users.phone` **and** `companies.phone`.
  2. Sign up selecting RESELLER role directly (not the card) → same result.
  3. Normal owner signup → OWNER + selected plan; phone persisted to `companies.phone`.
  4. rosealia19 after migration → plan Enterprise, role RESELLER, unlimited employees, reseller billing intact.
  5. A RESELLER account on Free with no reseller_clients → auto-downgrades to OWNER on next load; a RESELLER on Enterprise (andriw) stays RESELLER.
  6. Confirm no account silently drops to Free limits/features.

## Risks

- **Billing change for andriw** (Enterprise $0 → reseller rates) is intended; if a specific partner must not pay, apply a billing gift or test-account flag (existing tooling) rather than code.
- **Broad `isResellerEquivalentPlan` usage** — must find every call site; a missed one could leave stale plan-based reseller detection. Mitigated by the call-site audit above.
- **Edge accounts** with `plan = Free` + `role = RESELLER` + existing reseller_clients would NOT be downgraded (by design) — acceptable; they represent genuine partners whose plan lapsed.
