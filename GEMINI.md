# Payroll-Jam — Gemini Code Assist Context

> For full project context, shared rules, and docs routing, read `AGENTS.md` first.
> This file contains Gemini-specific navigation guidance.

---

## You Do Not Have a Code Graph

Unlike Claude (which has GitNexus MCP tools for call graph analysis), you navigate this codebase through file reads and the routing table in `AGENTS.md`. Use these strategies:

### Finding code by concept
1. Check `src/core/types.ts` — all domain types and enums are here. The type name often matches the service and page name.
2. Match type → service → page: `Employee` type → `EmployeeService.ts` → `Employees.tsx`
3. Check `src/services/` for any data operation. Each service file maps to one domain entity.
4. Check `src/features/` for complex feature modules (payroll engine, employee management, company config).

### Understanding a feature before changing it
1. Read the relevant doc from the routing table in `AGENTS.md`
2. Read the service file (e.g., `src/services/BillingService.ts`)
3. Read the page component (e.g., `src/pages/Settings.tsx`)
4. Check for a matching hook in `src/hooks/` or `src/features/`

### Before any edit
- Read `AGENTS.md` section "CRITICAL: Dead Code" — do not edit those files expecting results
- Read `AGENTS.md` section "Shared Rules"
- Read the relevant doc from the routing table

---

## Key Files to Know

| Purpose | File |
|---|---|
| All domain types | `src/core/types.ts` |
| Auth state + login logic | `src/context/AuthContext.tsx` |
| Route guards / paywall | `src/app/useAuthRedirects.ts` |
| Jamaica tax calculations | `src/core/taxUtils.ts` + `src/features/payroll/jamaica2026Fiscal.ts` |
| Payroll calculation engine | `src/features/payroll/payrollEngine.ts` |
| App entry + routing | `src/App.tsx` → `src/app/AuthenticatedApp.tsx` / `PublicApp.tsx` |
| Feature gating by plan | `src/utils/featureAccess.ts` + `src/utils/tierUtils.ts` |
| Supabase client init | `src/services/supabaseClient.ts` |
| Admin privileged ops | `supabase/functions/admin-handler/index.ts` |

---

## Jamaica Domain Context

This app is Jamaica-specific. Key statutory deductions every AI must understand:

| Deduction | Abbrev | Who pays |
|---|---|---|
| Pay As You Earn | PAYE | Employee (income tax) |
| National Insurance Scheme | NIS | Employee + Employer |
| National Housing Trust | NHT | Employee + Employer |
| Education Tax | Ed Tax | Employee + Employer |
| Human Employment and Resource Training | HEART | Employer only |
| Estate Levy | — | Employer (high earners) |

Tax rates and thresholds are in `src/features/payroll/jamaica2026Fiscal.ts`. Do not hard-code tax values — always reference that file.

---

## Docs Convention

Every doc in `docs/` should have an `<!-- ai-context -->` header block (see `docs/AI_INDEX.md` for the standard). When you create or significantly update a doc, add this block:

```
<!-- ai-context
feature: <feature-area>
status: current | outdated | archived | template
summary: One sentence describing what this doc covers.
do-not-change: Any invariants this doc describes that AI must not "fix".
-->
```