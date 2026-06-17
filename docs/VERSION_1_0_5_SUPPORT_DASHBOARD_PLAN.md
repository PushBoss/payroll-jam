<!-- ai-context
feature: support-operations
status: current
summary: Version 1.0.5 scope for a support role and audited support dashboard.
do-not-change: Support actions must stay server-controlled, permission-gated, audited, and reversible where possible.
-->

# Version 1.0.5 Support Dashboard Plan

## Release Goal

Give Payroll-Jam operators a safer way to help customers without granting full super-admin access for routine support work.

The support dashboard should make it easy to identify active clients, recently onboarded companies, failed signups, orphaned accounts, and billing/account setup issues. Any high-risk action must be explicit, audited, and recoverable.

## Role Scope

Add a `SUPPORT` role with narrower privileges than `SUPER_ADMIN`.

Support users can:

- View company, owner, billing, onboarding, and recent login metadata.
- Search by company name, owner email, phone, plan, status, and signup date.
- Impersonate a client only through an audited support session.
- Run approved account repair actions from server-side playbooks.
- Add internal support notes and issue tags.

Support users cannot:

- Change payroll calculations or tax settings without owner/admin approval.
- Delete companies or auth users directly.
- Change platform pricing, global config, or super-admin users.
- Export broad platform data outside scoped support cases.

## Dashboard Views

### Client Activity

- Recently signed up companies.
- Recently active companies by owner/admin last login.
- Companies with no owner login.
- Companies with incomplete onboarding.
- Companies with `EMPLOYEE` owner-role anomalies.
- Companies with no linked owner profile.

### Account Health

- Orphaned auth user with no `app_users` profile.
- `app_users` profile with no auth user.
- Owner profile with no company.
- Company with no owner/admin.
- Duplicate profiles for the same email.
- Stale invitations and failed invite acceptances.

### Billing Health

- Paying client with no card schedule.
- Active subscription with missing access date.
- Suspended/past-due companies.
- Gifted access expiring soon.
- DimePay ledger mismatch or failed webhook state.

## Support Actions

Each action should be an edge-function action in `admin-handler` or a dedicated `support-handler`. The client never performs direct service-role operations.

### Account Repair Playbooks

- Repair orphaned company signup:
  - verify auth user exists
  - verify no active company membership already exists
  - create or repair `app_users`
  - create missing company if the signup payload exists
  - link owner role
  - mark onboarding state consistently

- Repair owner role anomaly:
  - detect company signup profile stuck as `EMPLOYEE`
  - promote only the verified company owner to `OWNER` or `RESELLER`
  - leave real employee profiles untouched

- Reset failed onboarding:
  - clear incomplete company setup state
  - preserve auth identity
  - preserve audit trail
  - allow user to restart company setup

- Resend invite or verification:
  - invalidate stale token where needed
  - issue fresh token
  - log the operator and reason

### Impersonation

- Support can start an impersonation session only after selecting a support reason.
- Session records operator id, target company id, target user id, reason, start time, end time, and changed records.
- UI shows a persistent impersonation banner.
- High-risk pages remain read-only unless explicitly allowed.
- End session button is always visible.

## Audit Requirements

Audit every support action with:

- operator id and role
- target company id
- target user id/email when applicable
- action name
- before/after summary
- request correlation id
- operator-entered reason
- timestamp

## Data Model Needs

- Add `SUPPORT` to role enum and database constraints.
- Add `support_cases` table for case notes and tags.
- Add `support_action_runs` table for playbook execution logs.
- Add `support_impersonation_sessions` table.
- Consider a `last_support_reviewed_at` field or derived view for client health queues.

## UI Scope

- Add Support Dashboard route and layout item.
- Add searchable client health table.
- Add account health detail drawer.
- Add guarded action buttons for approved playbooks.
- Add dry-run preview before repair actions.
- Add confirmation requiring typed company name for destructive or broad actions.

## Release Criteria

- `SUPPORT` users cannot access super-admin settings, pricing, global config, or raw destructive actions.
- Every impersonation session and support action creates an audit record.
- Dry-run output is available before each account repair.
- Orphaned signup repair has automated tests for safe and unsafe cases.
- Tenant and paying-client activity sorting remains available for operators.
- `npm test -- --run` and `npm run build` pass.

## Out Of Scope

- Fully automated repair without operator confirmation.
- Multi-account switching foundation, which remains Version 2.0 scope.
- Support access to modify payroll amounts or statutory tax results.
