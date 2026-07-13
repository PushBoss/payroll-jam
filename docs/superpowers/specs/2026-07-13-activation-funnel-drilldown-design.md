<!-- ai-context
feature: super-admin/growth-analytics
status: current
summary: Design for drilling into the Super Admin activation funnel to see which tenants are stuck at each onboarding stage (signed up / onboarded / added team / ran payroll).
do-not-change: get_activation_funnel (existing aggregate RPC) is untouched - the new per-company classification lives in a sibling function, get_activation_funnel_companies.
-->

# Design: Activation Funnel Drill-Down

**Date:** 2026-07-13
**Status:** Approved — ready for implementation
**Scope:** New migration, `supabase/functions/admin-handler/index.ts`, `src/pages/SuperAdmin.tsx`
**Ticket:** ClickUp 86e2abyzf — "drill into activaton funnel" (Normal priority, title only)

---

## Problem

The Super Admin "Activation Funnel" panel (`SuperAdmin.tsx:1816-1864`) shows aggregate counts per stage (Signed Up / Onboarded / Added Team / Ran Payroll) via the existing `get_activation_funnel` SQL RPC (`db/migrations/20260619_activation_funnel_rpc.sql`), but there's no way to see *which* tenants are in each bucket. The ticket asks for a drill-down: click a stage, see a filtered tenant list, to identify which businesses need a nudge at which point in onboarding.

"Which phase a business is in" means its **furthest reached stage** — a tenant who's onboarded and added a team but hasn't run payroll should show up under "Added Team" (where they're stuck), not under both "Onboarded" and "Added Team." This is confirmed intentional: stages are meant to be mutually exclusive per tenant for this view, unlike the existing aggregate counts (which are cumulative reach-counts, not exclusive buckets, and are unaffected by this change).

---

## Backend: per-company stage classification

New migration, sibling to the existing RPC (which stays untouched):

```sql
CREATE OR REPLACE FUNCTION public.get_activation_funnel_companies(
  start_date timestamptz DEFAULT NULL,
  end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(company_id uuid, stage text, stage_order int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := COALESCE(start_date, date_trunc('month', now()) - interval '11 months');
  v_end timestamptz := COALESCE(end_date, now());
BEGIN
  RETURN QUERY
  WITH cohort AS (
    SELECT id, owner_id FROM public.companies
    WHERE created_at >= v_start AND created_at <= v_end
  ),
  classified AS (
    SELECT
      c.id,
      EXISTS (
        SELECT 1 FROM public.app_users u
        WHERE u.is_onboarded = true AND u.role IN ('OWNER', 'ADMIN', 'RESELLER')
          AND (u.company_id = c.id OR u.id = c.owner_id OR u.auth_user_id = c.owner_id)
      ) AS is_onboarded,
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.company_id = c.id AND COALESCE(e.status, 'ACTIVE') NOT IN ('ARCHIVED', 'TERMINATED')
      ) AS has_team,
      EXISTS (
        SELECT 1 FROM public.pay_runs pr
        WHERE pr.company_id = c.id AND pr.status = 'FINALIZED'
      ) AS ran_payroll
    FROM cohort c
  )
  SELECT
    id,
    CASE
      WHEN ran_payroll THEN 'Ran Payroll'
      WHEN has_team THEN 'Added Team'
      WHEN is_onboarded THEN 'Onboarded'
      ELSE 'Signed Up'
    END,
    CASE
      WHEN ran_payroll THEN 4
      WHEN has_team THEN 3
      WHEN is_onboarded THEN 2
      ELSE 1
    END
  FROM classified;
END;
$$;

REVOKE ALL ON FUNCTION public.get_activation_funnel_companies(timestamptz, timestamptz) FROM PUBLIC;
```

Same `EXISTS` conditions as the existing `get_activation_funnel`, just returning a per-company classification (furthest stage) instead of aggregate counts. Mirrors it deliberately rather than refactoring the existing function to share code — keeps the already-shipped aggregate funnel untouched and low-risk.

---

## Backend: new admin-handler action

`get-activation-funnel-tenants`, payload `{ stage: 1 | 2 | 3 | 4, page, pageSize }`:

1. Call `get_activation_funnel_companies`, filter to rows matching `stage_order`.
2. Fetch those companies' base rows and enrich them with the same fields the Tenants tab shows (`companyName`, `email`, `phone`, `contactName`, `plan`, `status`, `employeeCount`, `createdAt`).
3. Paginate, return `{ companies, total }` — same response shape as `get-all-companies`.

The enrichment logic (owner lookup via `app_users`, active employee count, plan/MRR) is currently inlined inside `get-all-companies`'s `Promise.all` block (`admin-handler/index.ts:2269-2307`). Extract it into a shared helper, `enrichCompanies(adminClient, companies)`, used by both `get-all-companies` and this new action — avoids duplicating ~40 lines of already-tested lookup logic. This is the one refactor in scope, directly motivated by this feature reusing that exact logic.

Deliberately *not* folded into `get-all-companies` as another filter option: classifying every company's funnel stage requires two extra per-company existence checks (onboarded flag, finalized-pay-run existence) beyond what that action already computes. Adding that cost to the main Tenants tab's every page load — for a filter most loads never use — isn't worth it. Keeping it a separate, on-demand action confines the extra cost to when a Super Admin actually drills in.

---

## Frontend

The four stat cards next to the funnel chart (`SuperAdmin.tsx:1849-1860`) become clickable buttons. Clicking one opens a new lightweight modal (`ActivationFunnelDrillDownModal`) that calls `get-activation-funnel-tenants` with that stage's number and renders a simple list: company name, contact name, email, phone, plan, and days since signup. Same visual conventions (card styling, spacing) as the Tenants tab for consistency, but a separate, simpler component — no sorting/search/status-filter controls, since a single funnel-stage bucket is expected to be small enough not to need them (YAGNI; can be added later if a stage's list grows large enough to need it).

---

## Testing

- Verify a company that's onboarded + added a team but hasn't run payroll appears under "Added Team," not "Onboarded" or "Ran Payroll" (furthest-stage classification, not cumulative).
- Verify the four drill-down counts sum to the total cohort size (every company lands in exactly one bucket).
- Verify `get_activation_funnel`'s existing aggregate counts are unchanged by this migration (regression check on the untouched function).
- Verify `get-all-companies` (Tenants tab) still returns correct results after the `enrichCompanies` extraction — same output, refactor only.
