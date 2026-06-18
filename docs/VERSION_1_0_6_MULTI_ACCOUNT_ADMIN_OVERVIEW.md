<!-- ai-context
feature: multi-account-admin-operations
status: current
summary: Version 1.0.6 scope for completing practical multi-account support and improving Super Admin overview drill-downs for tenants and paying customers.
do-not-change: Keep 1.0.6 focused on operationally safe account switching and admin detail visibility; broader permission rewrites remain a v2.0 foundation item unless explicitly pulled forward.
-->

# Version 1.0.6 Multi-Account And Admin Overview

## Release Goal

Finish the practical multi-account support needed for real customers and make Super Admin tenant/billing views drillable enough for support, billing review, and onboarding follow-up.

## Product Focus

- A single auth user can safely hold more than one company membership through `account_members`.
- Users with multiple memberships can choose or switch active company context after login.
- Employee-plus-owner and owner-plus-employee cases stop breaking signup, invite, and dashboard routing.
- Super Admin overview, tenant, and paying-client rows open detail views with enough context to understand the account without jumping between tables.

## Multi-Account Scope

- [ ] Backfill `account_members` for existing `app_users.company_id` owner/admin/manager/employee records.
- [ ] Treat `account_members` as the durable membership source for active company context.
- [ ] Keep `app_users.company_id` as a default/preferred context during 1.0.6, not the only authority.
- [ ] Add active context state after login:
  - selected `companyId`
  - selected role
  - selected company name
  - membership id/source
- [ ] Add a context picker when a user has more than one accepted membership.
- [ ] Add a compact account switcher in the app shell.
- [ ] Update auth bootstrap so company data loads from the active context, not only `user.companyId`.
- [ ] Update route defaults for:
  - owner/admin company context
  - employee portal context
  - reseller context
  - super-admin context
- [ ] Existing-user company signup should create a new membership when safe instead of overwriting employee context.
- [ ] Employee invite acceptance should add/link membership when an auth account already exists.
- [ ] Reseller/client switching should use active context rather than impersonation where possible.

## Super Admin Drill-Down Scope

- [x] Paying-client rows open a details modal using currently loaded billing/activity fields.
- [ ] Tenant rows open a company detail modal.
- [ ] Add server detail endpoint for `get-company-admin-detail` with:
  - company profile and plan
  - owner/admin users
  - last login/account created timestamps
  - employee count and active employee count
  - onboarding/account health flags
  - manual payment notes and gifted access history
  - recent payment history
  - DimePay card/subscription state
  - recent ledger events
  - support notes and repair actions
- [ ] Paying-client detail modal includes:
  - transfer/manual payment history
  - manual payment internal notes
  - card payment history
  - DimePay ledger state timeline
  - last login and account created date
  - account status and access window
  - risk flags and recommended support action
- [ ] Overview cards can drill into filtered lists:
  - recently signed up
  - recently active
  - needs billing attention
  - missing card schedule
  - manual access expiring soon
  - account health issues

## Data Model And Backend

- [ ] Add or confirm indexes:
  - `account_members(user_id, status)`
  - `account_members(email, status)`
  - `account_members(account_id, status)`
  - `payment_history(company_id, created_at)`
  - `audit_logs(company_id, timestamp)`
- [ ] Add support notes/case table if not already completed in 1.0.5.
- [ ] Add append-only manual payment/access events instead of only storing latest `settings.billingGift`.
- [ ] Add `get-user-memberships` edge action.
- [ ] Add `switch-active-context` edge action or client helper with server validation.
- [ ] Add `get-company-admin-detail` edge action.
- [ ] Add detail endpoints to avoid over-fetching entire platform tables on row click.

## Security Rules

- [ ] Active context must be validated server-side before loading company data.
- [ ] A user can only switch to accepted memberships for their auth identity/email.
- [ ] Employee context must not grant company-admin pages.
- [ ] Owner/admin context must not grant employee-only records from another company.
- [ ] Super Admin can view detail records but destructive actions remain typed-confirmation gated.
- [ ] Every context switch and support/admin drill-down action writes an audit event where appropriate.

## UI Acceptance Criteria

- [ ] Multi-membership user sees a context selection screen after login.
- [ ] Single-membership user continues straight to the correct dashboard.
- [ ] Account switcher is visible for users with more than one accepted membership.
- [ ] Switching context refreshes company, employees, payroll, timesheets, leave, documents, billing, and route guards.
- [ ] Paying-client details modal is usable on desktop and mobile.
- [ ] Tenant detail modal is usable on desktop and mobile.
- [ ] Detail modals never clip behind banners or browser viewport edges.
- [ ] Tables remain scannable and dense; row click opens details, action buttons still work independently.

## Test Matrix

- [ ] Existing owner with one company.
- [ ] Existing employee with one portal account.
- [ ] Same email: employee in company A, owner in company B.
- [ ] Same email: owner in company A, employee in company B.
- [ ] Same email: reseller plus owned company.
- [ ] Super Admin viewing and drilling into tenant/paying-client records.
- [ ] Existing employee invite accepted by an auth user that already exists.
- [ ] Existing auth user creates another company.
- [ ] Account repair playbooks still work after membership backfill.

## Out Of Scope For 1.0.6

- Full v2 permission rewrite across every edge function unless needed by active-context switching.
- Native mobile app.
- Complex enterprise permissions beyond role-per-company membership.
- Automated billing reconciliation beyond surfacing DimePay/manual payment history.
