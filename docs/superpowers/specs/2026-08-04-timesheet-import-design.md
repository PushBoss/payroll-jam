# Timesheet import

## Context

Timesheets currently support only two creation paths — manual entry and QR-code clock-in
(`WeeklyTimesheet.source: 'MANUAL' | 'AUTO_QR'` in `src/core/types.ts`). There is no file-based
import. As of this design, the feature has **zero usage in production** (0 rows in the
`timesheets` table across every company), despite 29 `HOURLY`-pay-type employees on the platform
who are the only pay type whose gross pay is actually driven by timesheet hours
(`payrollEngine.ts:298-324`: `grossPay = totalRegularHours × hourlyRate`, plus 1.5× overtime for
`totalOvertimeHours`, filtered to `status === 'APPROVED'` timesheets within the pay period).
`SALARIED`/`PIECE_RATE`/`COMMISSION` employees don't read timesheet hours for gross pay at all.

The working hypothesis is that manual/QR entry is too much friction for customers switching from
another payroll or time-and-attendance system with existing timesheet data — import is scoped
now so it's ready when that need comes up, not because current usage justifies it on its own.

## Scope

- Import creates `WeeklyTimesheet` records for **any** pay type, matching how manual entry works
  today (no pay-type restriction there either). Only `HOURLY` employees' imported records will
  actually affect gross pay, via the existing engine logic unchanged by this feature — everyone
  else's imported hours become attendance history with no payroll effect. This feature does not
  add new pay-type branching to `payrollEngine.ts`; it produces standard timesheet records that
  the existing `HOURLY` path already consumes.
- Two source-file shapes are supported, since customers export from different systems and the
  actual shape they'll bring is unknown up front:
  - **Raw daily punches**: one row per employee per day (identifier, date, start time, end time,
    optional break duration). Hours are computed the same way manual entry already does
    (`summarizeEntries` in `TimeSheets.tsx`: first 8 hours/day = regular, remainder = overtime).
  - **Pre-summarized hours per period**: one row per employee per week (identifier, week start
    date, regular hours, overtime hours already totaled). Maps directly onto `WeeklyTimesheet`
    fields, no time-math needed.
  - The wizard does not force a shape choice up front. A single mapping step exposes all
    possible target fields; which fields get mapped determines which shape is in play (see
    Mapping below).

## Design

### Entry point

A new "Import Timesheets" button on `TimeSheets.tsx`, alongside the existing manual-entry/QR
actions, opens a new `TimesheetImportWizard` component. Structurally modeled on
`src/features/employees/CsvImportWizard.tsx` (upload → map → validate/preview → confirm), reusing
its proven patterns rather than inventing new ones.

### Steps

1. **Upload** — CSV/Excel file, reusing the existing parsing already used by `CsvImportWizard` /
   `ComplianceImportWizard`.

2. **Map columns** — a `SYSTEM_FIELDS`-style list (same shape as `CsvImportWizard.tsx`'s
   `SYSTEM_FIELDS`: `{ key, label, isMandatory, aliases }`) with alias auto-detection so common
   headers pre-fill:
   - `employeeIdentifier` (mandatory) — matched against employee email, employee number, or full
     name, using the same fallback chain `ComplianceImportWizard.tsx` already uses for TRN/name
     matching.
   - `date` (for the daily-punch shape)
   - `startTime`, `endTime` (for the daily-punch shape)
   - `breakDuration` (optional, daily-punch shape)
   - `weekStartDate` (for the pre-summarized shape)
   - `regularHours`, `overtimeHours` (for the pre-summarized shape)

   Shape is inferred per-file from which fields got mapped: if `startTime`/`endTime` are mapped,
   compute hours from them; if `regularHours`/`overtimeHours` are mapped directly, use them
   as-is. At least one complete shape (both daily-punch fields or both summarized-hours fields)
   must be mapped, alongside `employeeIdentifier`, or the wizard blocks progressing past this
   step with a clear message about which fields are still needed.

3. **Validate + preview** — for every row:
   - Resolve `employeeIdentifier` against the company's employees. Unmatched rows are excluded
     from import and listed separately in the preview (not silently dropped).
   - Daily punches are grouped into Monday-Sunday weeks per employee (same week-bounds logic as
     `getWeekBounds` in `TimeSheets.tsx`), producing one `WeeklyTimesheet` per employee per week
     with its `entries` populated from the grouped punches.
   - Computed regular/overtime hours are shown per resulting timesheet.
   - **Duplicate handling**: if the employee already has a timesheet for a given week, the row is
     flagged with a skip/overwrite choice (per-row or a global "apply to all duplicates" toggle),
     matching `CsvImportWizard`'s existing duplicate-handling pattern for employees.
   - Malformed dates/times and rows failing validation are surfaced here, before any DB write.

4. **Confirm** — creates `WeeklyTimesheet` records with `status: 'SUBMITTED'`,
   `source: 'MANUAL'`. No new `source` enum value is introduced — imported timesheets are
   functionally manual entries, just bulk-created, and existing UI (filters, approve/reject) needs
   no changes to recognize them.

### Bulk approve

`TimeSheets.tsx` currently has only a per-row Approve action (`handleApprove`, line 94), no bulk
mechanism. Since imported timesheets land as `SUBMITTED` (see Status below) and an import could
mean dozens or hundreds of rows, the post-import result screen gets an **"Approve All Imported"**
action scoped to just that import batch (not all pending timesheets platform-wide). The existing
per-row Approve/Reject on the main Timesheets list is unchanged and still works normally for
anyone who wants to review individually instead.

### Status: SUBMITTED, not auto-approved

Imported timesheets land as `SUBMITTED`, requiring approval (bulk or per-row) before they affect
a pay run - even though manual entry today defaults straight to `APPROVED`. Rationale: an import
can silently carry bad data (wrong hours, misparsed dates, mismatched employees) at a scale a
single manual entry can't, and a pay run change is the actual consequence. The preview step in
Section "Validate + preview" is a pre-write sanity check, not a substitute for a human approving
what actually counts toward payroll.

## Error handling

- Unmapped mandatory fields, or an incomplete shape (e.g. `startTime` mapped without `endTime`) →
  blocked at the mapping step with a specific message.
- Unmatched employees → excluded from import, listed separately in the preview, never silently
  dropped.
- Malformed dates/times → flagged per-row in the preview, excluded from the confirm step until
  fixed or the row is excluded.
- Duplicate weeks → explicit skip/overwrite choice, never silently overwritten.
- Nothing partially imports: validation happens entirely before any DB write in step 4.

## Out of scope

- Changes to `payrollEngine.ts` — the existing `HOURLY`-only gross-pay-from-hours logic is
  unchanged; this feature only produces the `WeeklyTimesheet` records that logic already reads.
- A new `source` enum value for imported timesheets — they're tagged `MANUAL`.
- Investigating why the base timesheets feature has zero production usage — noted as a real open
  question, but explicitly deferred; this spec scopes import on the working hypothesis that it
  may be the missing piece for adoption, not on confirmed demand.

## Testing

- `npm run build` — typecheck.
- Manual, against the real Supabase project: import a daily-punch CSV and a pre-summarized-hours
  CSV separately, for a mix of HOURLY and SALARIED employees, including one intentional duplicate
  week and one intentionally unmatched employee row. Confirm: (1) daily punches produce correct
  regular/overtime split per week; (2) summarized-hours rows pass through unchanged; (3)
  unmatched rows are listed, not imported; (4) duplicate week is flagged and respects the
  skip/overwrite choice; (5) imported timesheets land as SUBMITTED; (6) "Approve All Imported"
  approves only the batch just imported; (7) after approval, a pay run for an HOURLY employee in
  the imported period reflects the imported hours; a SALARIED employee's pay run is unaffected by
  their imported timesheet.
