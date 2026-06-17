<!-- ai-context
feature: employee-portal-attendance
status: current
summary: Release checklist for Payroll-Jam 1.0.3 focused on a mobile-friendly employee portal, QR/pass-code attendance, clock-in/out, leave, payslips, and document self-service.
do-not-change: Keep v1.0.3 scoped to employee portal usability and attendance hardening; full multi-account switching remains a v2.0 roadmap item.
-->

# Version 1.0.3 Checklist

## Release Goal

Make the employee portal production-ready on mobile for daily employee self-service:

- Clock in and clock out from a company-generated QR code.
- Use a company-generated pass code when QR scanning/camera flow is unavailable.
- Request leave, view payslips, and request/download documents easily from a phone.
- Keep attendance entries reliable enough for payroll review and approval.

## Current App Baseline

- Company admin can generate a clock-in QR from Time Sheets.
- Employee portal can open a QR clock-in link and create an `AUTO_QR` timesheet entry.
- Employee portal has screens for leave, documents, profile, payslips, and manual timesheet entry.
- Gaps for 1.0.3:
  - [x] QR flow supports clock-in and clock-out.
  - [x] QR badge shows a human pass code.
  - [x] Employee portal timesheet screen uses saved timesheets instead of seeded demo week data.
  - [x] Clock-in/out has mobile-first pass-code fallback and clearer states.
  - [x] Document, hours, clock, and leave actions are easier to reach from the portal home screen.

## Product Requirements

- [x] Company QR badge displays both a scannable QR code and a short pass code.
- [x] Pass code is tied to the same company/location context as the QR.
- [x] Employee can clock in by scanning QR/opening QR link.
- [x] Employee can clock in by entering pass code.
- [x] Employee can clock out using the same QR/pass-code flow.
- [x] Employee sees current attendance state: not clocked in, clocked in, clocked out.
- [x] Duplicate clock-ins are blocked while an open shift exists.
- [x] Clock-out is blocked unless the employee has an open shift.
- [x] Mobile portal home has clear primary actions: Clock In/Out, Leave, Payslips, Documents.
- [ ] Leave request flow works comfortably on a phone, including date selection.
- [ ] Payslips are viewable and downloadable from mobile.
- [ ] Document request/upload/download flow is usable from mobile.

## Data And Backend

- [x] Add pass-code support to attendance payloads.
- [x] Store enough attendance state to distinguish open shifts from completed shifts.
- [x] Extend `WeeklyTimesheet`/entries or add an attendance-event model for:
  - clock-in timestamp
  - clock-out timestamp
  - location id/name
  - source: `AUTO_QR` timesheet with entry-level `QR` or `PASS_CODE`
  - device/geolocation verification result
- [x] Decide whether pass codes are:
  - static per active QR/location with rotation controls, or
  - rotating daily/weekly codes generated from a server-side secret.
- [x] Ensure pass-code validation is server-controlled or tamper-resistant.
- [x] Preserve payroll behavior: approved weekly totals still flow into pay runs.
- [x] Add attendance attempt logs for clock-in, clock-out, rejected location, and rejected pass-code attempts.

## Company Admin Experience

- [ ] Rename modal copy if needed from "Generate Clock-in QR" to support clock-in/out without changing primary button text unless product wants it.
- [x] QR badge includes:
  - company/location name
  - QR code
  - pass code
  - short instruction: "Scan QR or enter pass code in employee portal"
- [x] Admin can regenerate/rotate pass code.
- [x] Admin can print the QR/pass-code badge cleanly.
- [x] Time Sheets table shows open shifts and completed shifts clearly.
- [x] Manual Log Time remains available for corrections.

## Employee Mobile Experience

- [ ] Portal layout tested at common widths: 320px, 375px, 390px, 414px, 768px.
- [ ] Buttons are thumb-friendly, with no horizontal overflow.
- [x] Clock screen has two tabs or clear choices: Scan QR / Enter Pass Code.
- [x] Camera/geolocation permission failures show actionable messages.
- [x] Employee can recover from a failed scan by entering pass code.
- [x] Clock-in/out success shows branch and status.
- [x] Leave, payslip, and document cards appear above lower-priority dashboard content.
- [ ] File upload controls are usable on iOS Safari and Android Chrome.

## Attendance Rules

- [x] Geofence is enforced for QR and pass-code attendance where location is available.
- [x] If geolocation is unavailable, define product behavior:
  - reject attendance, or
  - allow pass-code with "location unavailable" audit flag.
- [x] Clock-out calculates total hours from clock-in to clock-out less default/manual break rules.
- [x] Overnight shifts are handled safely.
- [x] Overtime calculation remains consistent with payroll expectations.
- [x] Managers can approve/reject completed attendance-derived timesheets.

## Security And Abuse Protection

- [x] Pass codes are not guessable enough for casual abuse.
- [x] Rate-limit or throttle repeated wrong pass-code attempts.
- [x] Expired/rotated codes stop working.
- [x] QR payload cannot be forged client-side.
- [x] Employee can only clock against their own employee record.
- [x] Terminated/archived employees cannot clock in/out.
- [ ] Free-plan companies cannot use employee portal attendance if plan gates disallow it.

## Tests

- [x] Unit test QR/pass-code payload generation and validation.
- [ ] Unit test clock-in creates an open attendance entry.
- [ ] Unit test duplicate clock-in is blocked.
- [ ] Unit test clock-out closes the open entry and calculates hours.
- [ ] Unit test pass-code validation accepts current code and rejects stale/wrong codes.
- [ ] Component test employee clock screen mobile states.
- [ ] Component test Time Sheets QR/pass-code badge rendering.
- [ ] Regression test payroll still consumes approved timesheets.
- [ ] Manual mobile QA on iOS Safari and Android Chrome.

## Acceptance Criteria

- [x] A company can print one badge per location with QR and pass code.
- [x] An employee can clock in and clock out from a phone using QR.
- [x] An employee can clock in and clock out from a phone using pass code.
- [x] Attendance records appear in company Time Sheets for approval.
- [x] Approved attendance contributes correctly to payroll hours.
- [ ] Employee portal home makes leave, payslips, and documents easy to reach on mobile.
- [ ] No known horizontal scrolling or clipped controls on mobile.
- [x] `npm test -- --run` passes.
- [x] `npm run build` passes.

## Out Of Scope For 1.0.3

- Full multi-company/account switching for one auth user. Keep this in the version 2.0 roadmap.
- Native mobile app.
- Biometric/passkey authentication. The 1.0.3 "pass code" is a company/location attendance code, not WebAuthn.
- Payroll rule changes unrelated to attendance-derived hours.
