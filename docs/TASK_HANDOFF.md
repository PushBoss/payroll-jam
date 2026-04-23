---
title: Payroll-Jam Multi-Agent Handoff
status: active
last_updated: 2026-04-23
primary_audience:
  - codex
  - claude
  - gemini
source_of_truth: true
repo: payroll-jam
primary_repo_path: C:\Users\chad_\OneDrive\Desktop\payroll-jam
gitnexus_repo: payroll-jam
primary_context_resource: gitnexus://repo/payroll-jam/context
primary_process_resource: gitnexus://repo/payroll-jam/processes
primary_index_command: npx gitnexus analyze
primary_change_command: gitnexus detect_changes(scope: "all")
---

# Payroll-Jam Multi-Agent Handoff

This file is the operational source of truth for AI-to-AI coordination in this repo.

If you are Claude, Gemini, Codex, or another tool-assisted agent:
1. Read this file first.
2. Treat this file as newer than `handoff.md`, older summary docs, or stale planning notes.
3. Update this file when you finish a material workstream or discover a blocker that changes the next step.

## Canonical Inputs

Use these in this order:
1. `docs/TASK_HANDOFF.md`
2. `AGENTS.md`
3. `gitnexus://repo/payroll-jam/context`
4. Current working tree via `git status --short` and `git diff --stat`
5. `gitnexus detect_changes(scope: "all")`

Do not rely on the old architectural notes in `handoff.md` except as historical context.

## GitNexus Connections

Repo identity:
- GitNexus repo: `payroll-jam`
- Context resource: `gitnexus://repo/payroll-jam/context`
- Processes resource: `gitnexus://repo/payroll-jam/processes`
- Clusters resource: `gitnexus://repo/payroll-jam/clusters`

Required GitNexus workflow for any agent doing code work:
1. Run `npx gitnexus analyze` if context says stale.
2. Read `gitnexus://repo/payroll-jam/context`.
3. Run `impact` before editing functions, classes, or methods.
4. Run `detect_changes(scope: "all")` before handoff or commit.

Known limitation:
- GitNexus MCP has been partially stale and sometimes reports the index as one commit behind HEAD even after `analyze`.
- When that happens, prefer:
  - `git status --short`
  - `git diff --stat`
  - `gitnexus detect_changes(scope: "all")`
  over the static context freshness warning.

## Current Workspace State

The branch contains coordinated but not fully integrated work from three parallel streams:

### Codex-owned runtime/data work detected
- `src/core/auditService.ts`
- `src/features/payroll/usePayrollData.ts`
- `src/pages/SuperAdmin.tsx`
- `src/pages/TimeSheets.tsx`
- `src/services/EmployeeService.ts`
- `src/services/PayrollService.ts`

### Claude-owned backend/schema work detected
- `src/services/BillingService.ts`
- `src/services/CompanyService.ts`
- `supabase/functions/admin-handler/index.ts`
- `db/migrations/20260423_companies_columns.sql`
- `db/migrations/20260423_global_config_cleanup.sql`

### Gemini-owned cleanup/docs work detected
- `ARCHITECTURE.md`
- `src/components/CookieConsent.tsx`
- `src/features/employees/EmployeeManager.tsx`
- `src/features/employees/inviteService.ts`
- `src/features/payroll/usePayroll.ts`
- `src/pages/FAQ.tsx`
- `src/pages/Reports.tsx`
- `src/pages/VerifyEmail.tsx`

## Verified Open Blockers

### Merge markers still unresolved
- `src/pages/Features.tsx`
- `src/pages/LandingPage.tsx`
- `src/pages/Pricing.tsx`

These must be resolved before the branch is considered integration-ready.

### Verification blockers
- `npm install` has been run successfully.
- The Vite dev server can run.
- Full build verification still needs to be rerun against the current merged workspace.
- `package.json` expects Node `20.x`, but the current environment has Node `22.14.0`.

## Current Risk Picture

Most recent consolidation found:
- Changed files: 17
- GitNexus change risk: `medium`

Known affected flows from `detect_changes(scope: "all")`:
- `Reports -> HandleDownloadGL`
- `Reports -> HandleDownloadBankFile`
- `MutateEmployeeRowWithSchemaFallback -> Update`

Interpretation:
- Reports still needs integration verification even though it was not the main target of the data fix work.
- Employee persistence changed materially and should be manually checked after merge cleanup.

## Immediate Next Step

The next integration pass should happen in this order:

1. Gemini resolves the remaining merge markers in:
   - `src/pages/Features.tsx`
   - `src/pages/LandingPage.tsx`
   - `src/pages/Pricing.tsx`
2. Codex reruns verification:
   - `npm run build`
   - `npx gitnexus analyze`
   - `gitnexus detect_changes(scope: "all")`
3. Claude reviews whether backend/schema changes require final rollout notes or migration sequencing updates.

## Manual Validation Checklist

After merge-marker cleanup, validate:
- Super-admin global config load does not auto-overwrite DB defaults.
- Employee save/update fails clearly on schema mismatch rather than silently dropping fields.
- Finalized pay runs write snapshots correctly.
- Timesheet updates persist to Supabase.
- Admin company list and billing screens still load with the new backend paths.
- Reports export flows still behave correctly.

## Agent Communication Contract

When an agent starts work:
- Read this file.
- Append new facts here if they change execution order, blockers, or ownership.
- Do not replace confirmed facts with assumptions.

When an agent finishes work:
- Update:
  - `Completed Since Last Update`
  - `New Risks`
  - `Next Recommended Owner`

### Completed Since Last Update
- Codex implemented active-path fixes for config persistence, payroll snapshots, timesheet persistence, and employee-save simplification.
- Claude added company/global-config migrations and backend aggregation work.
- Consolidation pass confirmed the prior `docs/TASK_HANDOFF.md` template was unusable and replaced it with this operator file.

### New Risks
- GitNexus MCP freshness warnings may lag behind working-tree reality.
- Root `handoff.md` was previously stale and could cause tool-to-tool divergence if not redirected.

### Next Recommended Owner
- Gemini for merge-marker cleanup in the public pages.

## Commands Reference

Workspace state:
- `git status --short`
- `git diff --stat`

GitNexus:
- `npx gitnexus analyze`
- `gitnexus detect_changes(scope: "all")`

Merge-marker scan:
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" src supabase db docs`

Build/dev:
- `npm run build`
- `npm run dev`

## Notes For Tool Builders

This file is intentionally structured for both humans and agents:
- short stable sections
- explicit ownership
- explicit ordering
- explicit GitNexus resources
- explicit fallback behavior when GitNexus is stale

If another tool needs a minimal entrypoint, use:
- file: `docs/TASK_HANDOFF.md`
- repo: `payroll-jam`
- context: `gitnexus://repo/payroll-jam/context`
