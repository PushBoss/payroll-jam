<!-- ai-context
feature: product-roadmap
status: current
summary: Major-release scope for Payroll-Jam version 2.0 and version 3.0.
do-not-change: Keep v2 focused on multi-account foundations and operational hardening before expanding v3 into platform-scale automation, intelligence, and ecosystem features.
-->

# Major Release Roadmap

This document defines the intended scope for Payroll-Jam's next major releases. It is a planning boundary, not a promise that every item ships in one cut.

## Guiding Principle

Version 2.0 should make the current SaaS model structurally solid: one login, multiple contexts, stronger permission boundaries, cleaner operations, and reliable self-service.

Version 3.0 should build on that foundation with deeper automation, intelligence, integrations, and larger-company workflows.

## Version 2.0: Multi-Account And Operations Foundation

### Release Goal

Make Payroll-Jam safe and flexible for real-world identity overlap:

- A person can be an employee in one company and an owner/admin in another.
- A reseller can move between client companies without impersonation hacks.
- A user chooses the active company/context after login.
- The app no longer relies on a single `app_users.role` and `app_users.company_id` as the only source of access truth.

### Core Scope

- Account switching backed by `account_members`.
- Active context selector after login for users with more than one membership.
- Membership-aware route guards, feature gates, services, and edge functions.
- Role resolution from active membership/context instead of only the global app user profile.
- Clear handling for employee-plus-owner, employee-plus-admin, reseller-plus-owner, and super-admin contexts.
- Migration path from current `app_users.company_id` records into explicit memberships.
- Signup/invite flows that detect existing auth users and add memberships instead of blocking or overwriting accounts.
- Reseller dashboard rebuilt around memberships and client relationships.
- Better account cleanup/recovery tooling for failed onboarding or duplicate signup attempts.

### Employee Portal Scope

- Polish remaining mobile flows for leave, payslips, and documents.
- Add stronger employee document request tracking and employer response states.
- Attendance review improvements: open shifts, corrections, approvals, rejected clock attempts, and manager comments.
- Plan-gated employee portal access enforced consistently on client and server.

### Billing And Subscription Scope

- Server-side enforcement for plan limits and premium features.
- Billing state as the source of truth for plan access, including overdue, expired, gifted, trial, and reseller-managed accounts.
- Company-level entitlement checks reusable by frontend and edge functions.
- Cleaner reseller billing rules for client companies.

### Security And Compliance Scope

- RLS review for `account_members`, companies, employees, timesheets, documents, leave, and pay runs.
- Edge-function authorization audit with active-context membership checks.
- Audit trail coverage for high-risk operations: company switching, payroll edits, pay run deletion, user invites, attendance overrides, billing changes.
- Stronger admin tooling for orphaned auth users, duplicate profiles, and stale invitations.

### Data Model Scope

- Treat Supabase Auth as identity only.
- Treat `account_members` as the durable company-role relationship.
- Keep `app_users` as the personal profile and default preference record, not the sole authorization source.
- Add active-context persistence per session/user preference.
- Add migration/backfill scripts with dry-run reporting.

### Testing And Release Criteria

- Multi-membership login test matrix passes for owner, admin, manager, employee, reseller, and super-admin.
- Existing one-company accounts continue to land in the correct dashboard.
- Employee invite, company signup, reseller invite, and existing-user membership flows are covered.
- All edge functions reject access without the correct active membership.
- No payroll calculation regressions.
- `npm test -- --run` and `npm run build` pass.
- Manual QA covers at least one existing employee creating a company and one company owner being invited as an employee elsewhere.

### Out Of Scope For 2.0

- Native mobile app.
- Full HRIS replacement.
- AI payroll autopilot.
- Marketplace integrations beyond the core accounting/payment/email needs.
- Complex enterprise approval chains beyond basic payroll/attendance/document approvals.

## Version 3.0: Automation, Intelligence, And Ecosystem Scale

### Release Goal

Turn Payroll-Jam from a payroll app into a broader payroll operations platform for Jamaican companies, accountants, and growing teams.

### Core Scope

- Advanced workflow automation across payroll, leave, documents, attendance, and compliance.
- Deeper reseller/accountant operating console with portfolio analytics and bulk actions.
- Configurable approvals for payroll, timesheets, leave, documents, and employee changes.
- Multi-branch and multi-department reporting with stronger operational dashboards.
- More complete document lifecycle: requests, uploads, expiry reminders, employer-issued letters, employee acknowledgements.

### AI And Assistant Scope

- Payroll assistant that can explain pay runs, identify anomalies, and answer company-specific payroll questions.
- Guided compliance checks before pay run approval.
- Draft communications for payslips, document requests, leave responses, and onboarding.
- AI summaries for reseller portfolios, overdue tasks, and payroll risks.
- Human approval required before any payroll-affecting action.

### Integrations Scope

- Accounting export improvements beyond CSV.
- Payment provider resilience and reconciliation reporting.
- Email delivery monitoring and resend queues.
- Optional calendar integrations for leave and holidays.
- API/webhook foundation for partner integrations.

### Enterprise And Controls Scope

- Configurable approval chains by role, department, amount, or company policy.
- SSO-ready identity architecture if demand supports it.
- Fine-grained permissions beyond the current role enum.
- Retention policies and legal hold/export support.
- Audit log search, filtering, and export.

### Analytics Scope

- Workforce cost trends.
- Overtime and attendance anomaly dashboards.
- Leave liability and usage reports.
- Reseller portfolio MRR, churn-risk, and client activity health.
- Compliance readiness reporting.

### Testing And Release Criteria

- Workflow automation has clear rollback/failure states.
- AI features are explainable, permission-aware, and never silently modify payroll.
- Integration failures are visible and recoverable.
- Audit logs cover automated and human-triggered actions.
- Performance remains acceptable for larger reseller portfolios and larger employee counts.

### Out Of Scope For 3.0

- Replacing statutory/legal advice.
- Fully autonomous payroll submission without human approval.
- Country expansion unless Jamaican payroll stability remains strong.
- Native mobile app unless validated by customer demand.

## Cross-Version Backlog

These can be pulled into v2 or v3 depending on urgency:

- Version 1.0.5 support dashboard foundation: see `docs/VERSION_1_0_5_SUPPORT_DASHBOARD_PLAN.md`.
- Physical-device mobile QA checklist and recurring smoke suite.
- Stronger E2E test harness for signup, account switching, payroll, and employee portal.
- Better support tooling for deleting/resetting failed company accounts.
- Cache/versioning strategy so major releases can invalidate stale local data safely.
- Documentation cleanup and archived-doc labeling.
- Observability for edge functions and key product flows.

## Decision Rules

- If a feature changes who a user is acting as, it belongs in v2.
- If a feature depends on multiple memberships or active company context, it belongs after the v2 foundation.
- If a feature automates decisions or integrates external systems, it usually belongs in v3 unless it is required to stabilize billing/payroll now.
- If a feature risks payroll accuracy, it must include test coverage, audit trail, and rollback behavior before release.
