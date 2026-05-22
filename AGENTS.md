<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **payroll-jam** (1215 symbols, 2398 relationships, 65 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/payroll-jam/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/payroll-jam/context` | Codebase overview, check index freshness |
| `gitnexus://repo/payroll-jam/clusters` | All functional areas |
| `gitnexus://repo/payroll-jam/processes` | All execution flows |
| `gitnexus://repo/payroll-jam/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

---

> **Non-Claude AI tools** (Codex, Gemini, etc.): The section above contains GitNexus MCP tools you likely cannot use. Skip it and use the shared project context below. For Gemini, also read `GEMINI.md`.

---

# Payroll-Jam — Shared Project Context

## What This App Does

Multi-tenant SaaS payroll platform for the **Jamaican market**. Handles statutory compliance (PAYE, NIS, NHT, Education Tax, Estate Levy), pay run automation, employee self-service, document generation, and a reseller channel for accountants managing multiple companies.

- **Frontend**: React 18 + TypeScript + Vite + Tailwind → Vercel
- **Backend**: Supabase (Auth + PostgreSQL + 4 Deno edge functions)
- **Payments**: DimePay (primary), PayPal (secondary)
- **AI assistant**: Google Gemini via `payroll-chat` edge function
- **Currency**: JMD (Jamaican Dollar), USD supported in some flows

## Roles & Plans

```
Roles:  SUPER_ADMIN | RESELLER | OWNER | ADMIN | MANAGER | EMPLOYEE
Plans:  Free → Starter → Pro → Enterprise → Reseller
```

---

## CRITICAL: Dead Code — Do Not Trust These Files

| File | Why it is dead | Real implementation |
|---|---|---|
| `src/middleware.ts` | Uses Next.js APIs — this is a **Vite SPA**, not Next.js | Route guards: `src/app/useAuthRedirects.ts` |
| `src/app/api/cron/expiry-check/route.ts` | Next.js App Router format — never runs on Vercel Vite | Billing expiry: not yet wired |
| `src/services/supabaseService_monolith_DO_NOT_USE.ts` | Retired legacy file | Use individual service files in `src/services/` |
| `src/services/mockBackend.ts` | Dev fixture data, not wired in production | Real data via EmployeeService → Supabase |

---

## Codebase Map

```
src/
  app/            ← App shell: routing, auth redirects, data bootstrap hooks
  components/     ← Shared UI components
  constants/      ← App-wide constants
  context/        ← AuthContext.tsx — auth state, login/signup/logout
  core/
    types.ts      ← MASTER domain model — all types and enums (check here first)
    taxUtils.ts   ← Jamaica statutory tax calculations
    auditService.ts
  features/
    company/      ← Company config, settings data hooks
    employees/    ← Employee manager, CSV import, invite service
    payroll/      ← Payroll engine, pay run workflow, Jamaica 2026 fiscal
  hooks/          ← Custom React hooks
  pages/          ← 30 page components (one per route)
  services/       ← 20 service files — all Supabase data access lives here
  utils/          ← Auth helpers, cache, domain config, export, feature access

api/              ← 7 Vercel serverless functions (DimePay payment processing)
supabase/functions/
  admin-handler/  ← Privileged ops (user creation, company mgmt) — service_role only
  get-payslip/    ← PDF payslip generation
  payroll-chat/   ← Gemini AI assistant
  send-email/     ← Brevo transactional email
db/migrations/    ← Supabase SQL migrations
docs/             ← Feature docs, decision logs, setup guides (see docs/AI_INDEX.md)
```

## Key Architectural Invariants

- **Auth split**: Supabase Auth (`auth.users`) = identity only. App profile lives in `app_users` table. A user missing from `app_users` → "account setup incomplete" error. Both rows must exist.
- **Paywall enforcement**: Client-side in `src/app/useAuthRedirects.ts`. NOT in middleware (middleware.ts does not run).
- **Admin operations**: Any `service_role` key operation goes through `admin-handler` edge function — never called directly from frontend.
- **Tax values**: Always reference `src/features/payroll/jamaica2026Fiscal.ts`. Do not hardcode tax rates anywhere else.
- **Email**: `emailService.ts` → `send-email` edge function (primary). `smtpEmailService.ts` = direct SMTP fallback. Edge function is the production path.
- **Storage**: `storage.ts` = localStorage user cache. `storageService.ts` = Supabase file storage. Not interchangeable.

---

## Docs Routing

Read only the doc(s) relevant to your current task. Full index: `docs/AI_INDEX.md`.

| Feature area | Read first |
|---|---|
| Auth / login / email verification | `docs/SUPABASE_AUTH_CONFIG.md`, `docs/EMAIL_VERIFICATION_SYSTEM.md` |
| Signup / onboarding | `docs/PROFILE_SETUP.md`, `docs/IMPLEMENTATION_GUIDE.md` |
| Billing / subscriptions / plans | `docs/SUBSCRIPTION_SETUP.md`, `docs/PRICING_PLANS_BACKEND_ONLY.md`, `docs/RECURRING_BILLING_SETUP.md` |
| DimePay payments | `docs/DIMEPAY_CONFIGURATION_GUIDE.md` |
| Employee portal / invites | `docs/EMPLOYEE_PORTAL_INVITE_FEATURE.md`, `docs/INVITATION_SYSTEM_IMPLEMENTATION.md` |
| Payroll engine / pay runs | `docs/PAYROLL_MODULE_SPEC.md` |
| Payslip generation | `docs/PAYSLIP_EDGE_FUNCTION_SETUP.md` |
| Email delivery | `docs/BREVO_SETUP_AND_TEST.md`, `docs/EMAIL_DELIVERY_FIX.md` |
| Deployment / env setup | `docs/DEPLOYMENT.md`, `docs/ENV_SETUP.md` |
| Reseller management | `docs/RESELLER_UPGRADE_TEST_CHECKLIST.md` |
| Architecture overview | `docs/VISUAL_ARCHITECTURE.md`, `docs/PROJECT_OVERVIEW.md` |
| 2026 refactor context | `docs/REFACTOR_2026_INTEGRATION_GUIDE.md`, `docs/README_2026_REFACTOR.md` |
| Database schema | `docs/DB_SPLIT.md` |

---

## Shared Rules — All AI Assistants

**Must do:**
- Check `src/core/types.ts` first when working with any domain entity.
- Read the relevant routing table doc before making changes to a feature area.
- Confirm both `auth.users` and `app_users` rows exist when debugging login/auth issues.

**Must not do:**
- Edit `src/middleware.ts` expecting it to enforce anything — it does not run.
- Add logic to `supabaseService_monolith_DO_NOT_USE.ts` — it is retired.
- Hardcode API keys or tax rates in source code.
- Call `service_role` operations directly from frontend code.
- Rename enums in `core/types.ts` without checking all service files — they serialize to the database.

---

## Docs Standard

Every doc in `docs/` should open with this header block so AI tools can orient quickly:

```
<!-- ai-context
feature: <area>
status: current | outdated | archived | fix-guide | template
summary: One sentence — what this doc covers.
do-not-change: Invariants this doc describes that AI must not "fix".
-->
```

When you create or significantly update a doc, add this block at the top.