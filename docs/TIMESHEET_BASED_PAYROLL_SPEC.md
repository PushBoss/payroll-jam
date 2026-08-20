<!-- ai-context
feature: timesheets-and-timesheet-based-payroll
status: current
summary: Approved end-to-end business logic, data model, workflow, controls, and delivery estimate for PayrollJam timesheets and timesheet-based payroll.
do-not-change: Never let client-side state approve, lock, or associate time with payroll; payroll eligibility, rate snapshots, locks, and audit events are server-authoritative.
-->

# PayrollJam Timesheets & Timesheet-Based Payroll Specification

## 1. Purpose and scope

This is the source of truth for implementing timesheets and Timesheet-Based Payroll. It replaces the current assumption that a weekly aggregate is sufficient to approve, calculate, and lock time. The existing weekly timesheet screen remains, but it becomes a grouped view over authoritative daily time records.

This scope covers employee/admin entry, CSV import, future API and QR sources, approval, audit, reporting, Timesheet-Based Payroll, payroll locking, and post-payroll corrections. It does not change the existing Regular Payroll calculation path except where both paths share the same final payroll engine and statutory outputs.

## 2. Approved product decisions

| Decision | Rule |
| --- | --- |
| Authoritative unit | One **time record** represents one employee work date and one work interval (or an explicitly aggregated imported interval). Weekly sheets are derived/grouped views. |
| Initial status | Every newly created record is `LOGGED`, regardless of source. No source auto-approves time. |
| Approval | `OWNER`, `ADMIN`, and authorized `MANAGER` roles approve/reject individual records. Employees never approve their own time. |
| Edit indicator | “Edited” is an audit-derived visible flag (`revision_count > 0`), not a terminal status that replaces approval state. |
| Admin edit before payroll | An authorized admin may edit a `LOGGED` or `APPROVED` record before payroll association. An admin edit of approved time retains `APPROVED`; an employee edit moves it back to `LOGGED` for approval. Every edit creates an immutable revision. |
| Payroll eligibility | Only `APPROVED`, unlocked records fully inside the selected pay period qualify. Employees without qualifying time are excluded by default. |
| Payroll lock | The first persisted Timesheet-Based pay-run association locks included time. A draft can be explicitly discarded only before finalisation, which releases the association and records an audit event. Finalized/paid time is never unlocked. |
| Pay calculation | Payroll uses the rate and rules snapshot attached to each approved record. Effective-dated rate configuration resolves rate changes by work date. |
| Overtime | Weekly, not per-day: qualifying hours above the employee’s configured weekly threshold (initial configured baseline: 40) use the company’s enabled overtime multiplier where the employee’s rule applies. The product default is 1.5×; a company may disable the premium so those hours are paid at the normal hourly rate. |
| Holiday | Work on a configured applicable holiday is 2× where the employee’s rule applies. Holiday hours must not also receive a conflicting overtime multiplier; the approved rule precedence is the highest applicable multiplier unless a future policy explicitly supports stacking. |
| Audit | Create, edit, approve, reject, payroll-associate, unlock-draft, finalise, import, and correction events are append-only and server-authored. |
| CSV identity | Map employees by normalized email within the current company. Employee ID may be supplied as a secondary verification value, never as the sole identity. |
| Missing imported employee | Do not silently create a payroll employee. Stage as an import exception; an admin may create/invite the employee in a controlled confirmation flow, then revalidate the row. |

## 3. Roles and permissions

| Capability | Employee | Manager with time approval permission | Owner/Admin/Reseller acting for company | Super Admin impersonation |
| --- | --- | --- | --- | --- |
| Create own manual time | Yes | N/A | Yes, for any employee | Yes |
| View own time/status | Yes | N/A | Yes, company-wide | Yes |
| Enter/import team time | No | If granted | Yes | Yes |
| Edit logged time | Own records only | Assigned/company scope | Yes | Yes |
| Edit approved time before payroll | No | If granted | Yes | Yes |
| Approve/reject individual records | No | If granted | Yes | Yes |
| Run Timesheet-Based Payroll | No | No by default | Yes | Yes |
| View detailed audit history | No | Scope-limited | Yes | Yes |

All permission checks, lock checks, employee-company matching, approval, and payroll association happen in server-side handlers/RPCs using the authenticated actor. Browser state is never authoritative.

## 4. Lifecycle and state machine

```text
New record (employee/admin/CSV/API/QR)
  -> LOGGED
  -> APPROVED                  (authorized approver)
  -> INCLUDED_IN_PAYROLL       (persisted Timesheet-Based pay-run association; locked)
  -> PAID / LOCKED             (pay run finalised)

LOGGED -> REJECTED             (authorized approver; reason required)
REJECTED -> LOGGED             (authorized correction/resubmission)
APPROVED -> LOGGED             (employee edits their own record; re-approval required)
APPROVED -> APPROVED + edited  (authorized admin edit; immutable revision recorded)
INCLUDED_IN_PAYROLL -> LOGGED  (only if the associated DRAFT run is explicitly discarded)
PAID/LOCKED -> adjustment only (no in-place time edit)
```

The displayed lifecycle label may read `Edited` after an edit, but the stored approval state remains either `LOGGED`, `APPROVED`, `REJECTED`, `INCLUDED_IN_PAYROLL`, or `LOCKED`.

## 5. Authoritative data model

The current `timesheets` table stores one weekly aggregate with JSON entries. Preserve it for historical reads during migration, but do not extend it as the authoritative workflow model.

### 5.1 New tables

`time_records`

- `id`, `company_id`, `employee_id`, `work_date`, `start_at`, `end_at`, `break_minutes`, `worked_minutes`
- `source`: `EMPLOYEE`, `ADMIN`, `CSV`, `API`, `QR`
- `approval_status`: `LOGGED`, `APPROVED`, `REJECTED`, `INCLUDED_IN_PAYROLL`, `LOCKED`
- `holiday_code`, `holiday_multiplier`, `overtime_multiplier`, `regular_minutes`, `overtime_minutes`, `holiday_minutes`
- `rate_snapshot` JSONB: rate type, amount, currency, effective date/rule version, overtime eligibility, weekly threshold, holiday eligibility
- `approved_at`, `approved_by`, `rejected_at`, `rejected_by`, `rejection_reason`
- `pay_run_id`, `pay_run_line_item_id`, `locked_at`, `locked_by`
- `source_event_id` and `idempotency_key` for API/QR/import de-duplication
- `revision_count`, `created_at`, `updated_at`

`time_record_revisions` (append-only)

- `id`, `time_record_id`, `company_id`, `revision_number`, `event_type`
- `before_value` JSONB, `after_value` JSONB, `changed_fields` JSONB
- `actor_user_id`, `actor_role`, `actor_source`, `reason`, `created_at`
- `pay_run_id` where relevant

`pay_run_time_records`

- `pay_run_id`, `time_record_id`, `employee_id`, `company_id`
- immutable calculation snapshot: regular/overtime/holiday minutes, rate components, gross components, rule version
- unique `time_record_id` for an active association; explicit release only for discarded drafts

`employee_compensation_rates`

- `employee_id`, `company_id`, `rate_type` (`HOURLY`, `DAILY`, future `PIECE`), `amount`, `currency`
- `effective_from`, `effective_to`, `overtime_eligible`, `weekly_overtime_threshold`, `holiday_eligible`, `holiday_multiplier`
- `approved_by`, `created_at`, `superseded_at`

`company_holidays`

- `company_id`, `holiday_date`, `name`, `applies_to`/policy code, `multiplier`, `active`

`timesheet_import_batches` and `timesheet_import_rows`

- original filename, checksum, uploader, mapping version, row result, validation errors, duplicate decision, linked time record, created-at.

### 5.2 Integrity constraints and indexes

- `work_date`, company, employee, and positive worked time are required.
- Prevent overlapping approved/locked intervals for the same employee/date unless the admin explicitly records an overlap override with reason.
- Unique `(company_id, source, source_event_id)` when a source event ID exists.
- Unique active payroll association per time record.
- Index `(company_id, employee_id, work_date, approval_status)` and `(company_id, pay_run_id)`.
- Database trigger/RPC rejects any update to a `INCLUDED_IN_PAYROLL` or `LOCKED` record except controlled draft-release metadata before finalization.
- RLS permits employees to see/create only their own unlocked records; approval/audit/payroll operations use secure server procedures.

### 5.3 Historical migration

1. Keep historical weekly records read-only as `legacy_weekly` data.
2. Convert JSON entry rows into `time_records` where employee, date, and hours are unambiguous.
3. Tag converted rows `source=ADMIN` or `LEGACY_MIGRATION`, retain the originating weekly ID, and create a migration audit event.
4. Do not fabricate approval, rates, payroll associations, or locks. Ambiguous rows remain legacy display-only until an admin reviews them.

## 6. End-to-end workflows

### 6.1 Capture and review

1. A source creates time. Server validates company, employee, date/times, non-negative break, duplicate/idempotency key, and any overlap policy.
2. Server resolves the employee’s effective compensation policy for the work date and stores a rate/rule snapshot.
3. Record is saved as `LOGGED`; source stays immutable.
4. Employee sees only their records and current status. Admin review shows filters, source, edited indicator, and exceptions.
5. Admin approves/rejects each work-date record. Approval records actor and timestamp; rejection requires a reason.
6. Authorized admin edits create a revision. If the record was approved, the authorized admin’s revised version remains approved. Employee edits require fresh approval.

### 6.2 Timesheet-Based Payroll

1. Admin selects **New Payroll** then chooses **Regular Payroll** or **Timesheet-Based Payroll**.
2. For Timesheet-Based Payroll, reuse the existing pay-frequency/period selector and persist exact inclusive start and end dates.
3. Server fetches `APPROVED`, unlocked `time_records` whose work date falls fully within the period. It groups records by employee and Monday–Sunday week.
4. For each employee/week, calculate regular, overtime, and holiday minutes using the snapshot rules. The 40-hour baseline is configurable and only applies where the snapshot says overtime is eligible.
5. Calculate pay components from those approved minutes and snapshots. Generate the candidate employee list; employees with no qualifying records are absent.
6. Admin may remove a candidate. Removal creates no payroll association and leaves the time approved for a later run.
7. On **Create Draft Payroll**, atomically create the pay run and `pay_run_time_records` associations, snapshot the components, and move associated records to `INCLUDED_IN_PAYROLL`/locked. If any record was just used by another run, fail the whole transaction with a clear conflict list.
8. Feed the resulting gross/addition components into the existing payroll engine. Existing statutory deductions, YTD processing, reports, bank files, and payslips remain on the common payroll path.
9. Finalizing the pay run transitions associated records to `PAID`/`LOCKED`. No historical hours/rates are recalculated after finalization.
10. Discarding an unfinalized draft is an explicit privileged action: it removes only its associations, restores records to their previous approved state, and writes audit events. It cannot be used after finalization.

### 6.3 Correction after lock

1. Admin starts **Timesheet Adjustment** and selects the original locked record/pay run.
2. System creates a new adjustment record for a later selected payroll period; it references the original but never changes it.
3. Adjustment can be positive or negative, requires a reason and approval, and appears as a distinct line on the later pay run/payslip/audit report.
4. An adjustment is subject to the same approval, payroll association, and lock process.

## 7. Pay and rate rules

- Time-based payroll supports employees configured with `PayType.TIMESHEET` (and legacy `PayType.HOURLY`) plus a valid effective hourly rate. Salaried, commission, contractor, and piece-rate employees remain on Regular Payroll unless a later approved policy supports their time-based treatment.
- The system must not infer overtime from “over eight hours in one entry.” It groups qualifying minutes by employee, ISO week, and rate-rule version.
- A work-date rate snapshot makes a mid-period rate change deterministic. A rate change takes effect only from its configured effective date; previously approved records retain their original snapshot unless an authorized correction is made before payroll.
- Holiday multiplier and overtime applicability come from versioned company/employee policy data, not constants in React code.
- The stated Jamaican 40-hour / 1.5× / 2× rule is a product baseline pending Jamaican employment-law and contractual-policy validation. Legal review must approve the employee categories, exemptions, holiday definitions, multiplier precedence, and any collective agreement exceptions before production enforcement.

## 8. User interface requirements

### Timesheets

- Retain the weekly dashboard, totals, QR/clock-in surfaces, and employee portal views.
- Weekly view is the default/convenience view, not a reporting limitation. Company admins have a high-priority management view over all company time records.
- Add an employee selector plus arbitrary inclusive date-range filter (for example, Aug 1 through Aug 29); both filters compose with `AND` semantics.
- With no date range, retain the selected/predefined weekly view. With a date range, show every matching daily record across the full inclusive range rather than forcing records into one predefined week.
- The table updates to show only matching records and identifies the active employee/date filters, result count, and aggregate regular/overtime/holiday totals.
- Show day-level rows or expandable weekly groups: work date, in/out, break, hours by component, rate indicator, source, lifecycle state, edited badge, lock/pay-run reference, and actions.
- Lifecycle state must distinguish `LOGGED`, `APPROVED`, `INCLUDED_IN_PAYROLL`, `PAID`, and `LOCKED`; records with one or more revisions have an additional visible **Edited** indicator. The detailed before/after change history remains restricted to the admin audit log.
- Approve/reject one day at a time and bulk approve only after showing selected record count and exceptions.
- Do not show edit controls for included/locked records. Show “Create adjustment” instead.
- Management export uses the active employee/date-range/status filters and includes source, lifecycle state, approval actor/date, edit indicator, rate components, payroll reference, and totals. It is a report for review/sign-off and is never the import template.

### Payroll

- Add an explicit first-step choice between Regular and Timesheet-Based Payroll.
- In timesheet mode, show the selected period, qualifying-record count, excluded employee count, per-employee regular/overtime/holiday hours, gross preview, and conflicts.
- Preserve the existing add/remove employee, review, deductions, approval, and finalization experience after the candidate list is created.

### Import

- Separate **Download Template** and **Import Timesheet CSV** controls from management export.
- The sample template is a versioned, stable import schema. It is never generated from the visible report table and the report must never be accepted as an import file.
- Template v1 required columns: `employee_email`, `work_date`, `start_time`, `end_time`, `break_minutes`.
- Optional columns: `employee_id`, `source_reference`, `location`, `notes`, `rate_override_reason` (not a rate amount), `holiday_code`.
- Expected formats are documented beside the download and in the CSV header notes: normalized employee email; `YYYY-MM-DD` work date; `HH:MM` 24-hour start/end time; non-negative integer break minutes; optional external source reference no longer than 100 characters.
- The imported interval must have a positive calculated duration after the break. The server resolves applicable rate/rule data from the employee’s effective compensation configuration; arbitrary CSV rate amounts are not accepted in v1. A future authorized rate-override workflow requires a reason, permission, and audit event.
- Import supports current, bulk, and retroactive dates. Payroll eligibility still depends on later company-admin approval and the selected payroll period.
- Every committed imported record has `source=CSV`, starts `LOGGED`, and requires company-admin approval. Any exception requires a separately approved and auditable policy; CSV alone cannot mark a record approved.
- Import preview reports accepted, duplicate, invalid, missing-employee, date/time, duration, rate-configuration, and overlap exceptions before commit. Commit is all-or-nothing by default; a later “valid rows only” option requires an explicit confirmation/audit record.
- A CSV email that does not match an employee under the current employer is an exception, not an automatic account. The administrator may explicitly open the existing employee-induction flow, create the employee with the normal required data and invitation controls, then revalidate the affected import rows before committing.

### Export / management report

- **Export Report** produces a human-readable management review/sign-off output, not an import file. Its column set may evolve to support review and must not be relied upon as an import schema.
- It exports only the active company plus the selected employee and arbitrary inclusive date-range filters; employee and date range compose.
- Required report fields: employee name/email, work date, start/end, break, calculated regular/overtime/holiday hours, source, approval state, edited indicator/revision count, approver and approval date where applicable, payroll lock/pay-run reference, and report totals.
- The report can include an audit-summary column (for example, “edited by admin on date”) but detailed before/after values remain in the protected audit report.

## 9. Reporting and audit

Management reports support employee, date range, source, approval state, payroll state, and edited-only filters. Required summaries:

- hours/gross by employee, week, location, source, and status;
- approval aging and rejected time;
- overtime/holiday usage;
- imported batch outcomes;
- locked time by pay run and adjustment lineage;
- audit export containing before/after values, actor, timestamp, source, and reason.

The management report and the import template are deliberately separate artifacts:

| Artifact | Purpose | Contract |
| --- | --- | --- |
| Download Template | Machine-readable data entry/import | Stable, versioned CSV schema with documented required fields and formats. |
| Export Report | Human management review, sign-off, and analysis | Filtered, readable output with operational/audit context; schema is not an import API. |

Audit records are append-only. The detailed history is admin-only; employees see their own resulting status and approved values, not internal review notes or other actors’ private information.

## 10. API and QR contract rules

- API uses company-scoped credentials, source event ID, idempotency key, employee email/validated external employee reference, and UTC timestamps with the company time zone explicitly supplied.
- QR creates `LOGGED` records only. QR clock events must carry a signed event ID and must be deduplicated; their later clock-out update creates an audit revision rather than silently rewriting history.
- API/QR retries are safe: same idempotency key returns the original result, not a duplicate time record.

## 11. Acceptance criteria

1. A new employee/admin/CSV/API/QR record is always `LOGGED`.
2. An employee cannot approve their own record or edit another employee’s record.
3. Admin can approve a single day, edit it before payroll, and view full before/after audit history.
4. Timesheet payroll lists only employees with approved, unlocked records in the exact pay period.
5. Weekly overtime is calculated from the configured weekly threshold, not daily entry length.
6. A record used by a persisted payroll draft cannot be edited or selected by a second payroll.
7. Finalized payroll time cannot be changed; an adjustment creates a later linked entry.
8. CSV import and report export are distinct formats and flows.
9. A missing imported employee is an exception until an admin completes controlled creation/invitation.
10. Existing Regular Payroll, tax calculations, payslips, S01/S02/HEART exports, and employee portal access continue to work unchanged.
11. An admin can filter any employee’s time by an arbitrary inclusive date range, use both filters together, view the matching records, and export exactly that filtered management report.
12. The management view visibly distinguishes logged, approved, payroll-included, paid/locked, and edited records without exposing detailed audit history to employees.

## 12. Delivery plan and estimate

The estimate assumes one engineer familiar with this codebase, Supabase migrations/functions, and the current payroll engine. It excludes legal counsel time and production data-cleanup decisions.

| Workstream | Deliverables | Engineering estimate | AI-assisted implementation time | AI usage estimate* |
| --- | --- | ---: | ---: | ---: |
| Product/legal rule closure | written policy matrix, rate/holiday/overtime sign-off, adjustment decisions | 12–20 h | 4–8 h | 60k–120k tokens |
| Data model and migration | tables, constraints, RLS, legacy conversion, backfill review tooling | 28–42 h | 12–20 h | 160k–260k tokens |
| Server workflow | secure create/edit/approve/reject/lock/release/adjust RPC or Edge actions | 42–60 h | 18–28 h | 250k–390k tokens |
| Payroll integration | candidate selection, weekly component calculator, atomic association, common engine handoff | 36–52 h | 16–24 h | 220k–340k tokens |
| Timesheet and payroll UI | entry review, date filters, day approval, edited/locked indicators, payroll-mode selector | 34–50 h | 14–24 h | 200k–320k tokens |
| CSV import | template, preview/mapping, exceptions, batch audit and controlled employee induction | 24–36 h | 10–18 h | 150k–240k tokens |
| Reporting and export | management report filters, totals, CSV/XLSX export, audit report | 16–26 h | 7–13 h | 100k–180k tokens |
| QA, security, migration rehearsal | unit/integration/e2e tests, concurrency/lock tests, RLS, UAT, rollback rehearsal | 42–64 h | 18–30 h | 260k–420k tokens |
| Release and monitoring | deployment, feature flag, telemetry, runbook, support handoff | 8–14 h | 3–6 h | 40k–80k tokens |
| **Baseline total** | **full production-ready release** | **242–364 h** | **102–171 h** | **1.44M–2.35M tokens** |

\*AI usage is a planning range, not a billable-credit quote. Codex credit consumption depends on model, reasoning level, retries, test failures, and included context; it cannot be converted reliably to account credits without the account’s current pricing/metering view. A practical delivery schedule is 6–10 engineer weeks, or 4–7 calendar weeks with two engineers plus QA.

## 13. Recommended phased execution

1. **Phase 0 – rule sign-off (blocker):** Jamaican legal/contract policy matrix, rate effective-date decision, holiday calendar ownership, adjustment authorization.
2. **Phase 1 – trustworthy time:** schema, secure server operations, audit/revisions, employee/admin capture, legacy-read migration.
3. **Phase 2 – approval and import:** day-level review, CSV template/preview, reporting filters/export.
4. **Phase 3 – payroll integration:** candidate selection, weekly computation, atomic lock/association, existing engine handoff.
5. **Phase 4 – adjustments and rollout:** correction workflow, parallel payroll reconciliation, feature flag, pilot customers, production rollout.

Do not enable Timesheet-Based Payroll for live customers until Phase 3 has passed reconciliation against manually calculated sample periods and Phase 4’s lock/concurrency tests.
