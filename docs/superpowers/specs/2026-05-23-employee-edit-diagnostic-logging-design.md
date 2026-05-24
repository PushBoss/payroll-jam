<!-- ai-context
feature: employee-edit / payroll diagnostic logging
status: current
summary: Design for a lightweight trace logger that instruments the employee edit flow to diagnose an infinite loading bug that surfaces after a pay run completes.
do-not-change: Correlation ID format, diagnostic_logs table schema, PII exclusion rules, TraceLogger API surface.
-->

# Design: Employee Edit Diagnostic Logging

**Date:** 2026-05-23
**Status:** Approved — ready for implementation planning
**Scope:** Dev/staging only (guarded by `import.meta.env.DEV` flag; backend writes to `diagnostic_logs` table in all environments so cross-session data is preserved)

---

## Problem Statement

After a pay run is completed, attempting to edit an employee record causes the UI to enter an infinite loading state. The Save button spinner never clears and no error message is shown. The bug is not consistently reproducible and leaves no observable trace in the current logs.

The goal of this design is **not to fix the bug** — it is to add enough diagnostic visibility to determine exactly where the process breaks. The logging system must be able to answer ten questions:

1. Did the frontend action start?
2. Was the API request sent?
3. Did the backend receive the request?
4. Did the DB write complete?
5. Did the frontend receive the response?
6. Did the loading state reset?
7. Did any promise fail silently?
8. Did the request time out?
9. Was the employee blocked by pay run status, permissions, or locking?
10. What was the exact failure point?

---

## Security Constraints

**Never log:** full employee records, payroll amounts, bank details, TRN, NIS, passwords, raw auth tokens.

**Safe to log:** employee ID (UUID), company ID (UUID), user ID (UUID), user role (enum string), step name, status (start/ok/error/timeout), HTTP status code, error code (not message body), duration (ms), correlation ID, timestamp.

These constraints are non-negotiable and apply to both frontend console output and rows written to `diagnostic_logs`.

---

## Architecture Overview

```
Employees.tsx (handleEmployeeManagerSave)
    │ creates TraceLogger
    │ logs: action-start, save-dispatched, save-result, loading-reset
    ▼
useWorkforceData.ts (handleUpdateEmployee)
    │ receives _trace
    │ logs: primary-attempt-start, primary-attempt-result
    │ logs: fallback-attempt-start, fallback-attempt-result (if triggered)
    ▼
EmployeeService.ts (saveEmployee)
    │ receives _trace
    │ attaches x-correlation-id header on edge function call
    ▼
admin-handler edge function (save-employee-for-company)
    │ reads x-correlation-id
    │ logs: request-received, caller-resolved, company-access-checked,
    │       schema-attempt-N (each of up to 8), write-result
    │ writes structured logs to diagnostic_logs table
    │ emits console.log (visible in Supabase dashboard)
    ▼
diagnostic_logs table (Supabase)
    └── queryable after the fact for full cross-session correlation
```

---

## Data Model

### `diagnostic_logs` Table (new migration)

```sql
create table if not exists diagnostic_logs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  correlation_id text not null,
  source        text not null,          -- 'frontend' | 'edge-fn'
  step          text not null,
  status        text not null,          -- 'start' | 'ok' | 'error' | 'timeout'
  duration_ms   integer,
  employee_id   text,                   -- UUID string, no PII
  company_id    text,
  user_id       text,
  user_role     text,
  http_status   integer,
  error_code    text,
  detail        jsonb                   -- safe supplemental fields only
);

create index on diagnostic_logs (correlation_id);
create index on diagnostic_logs (created_at desc);
```

RLS: **disabled** on this table. The edge function writes using the service_role key, and the table contains no PII so open read is acceptable in dev/staging. Production access should be restricted to SUPER_ADMIN via a separate policy if the table is kept long-term.

Row TTL: No automatic expiry in this design. Prune manually after the bug is diagnosed, or add a cron job later.

---

## New File: `src/utils/employeeEditTrace.ts`

### Correlation ID

Format: `emp-edit-<unix-ms>-<4 random chars>`
Example: `emp-edit-1716499200000-k7qx`

Generated once per `handleEmployeeManagerSave` invocation and threaded through all layers.

### TraceLogger Class

```typescript
interface TraceContext {
  correlationId: string;
  employeeId: string;
  companyId: string;
  userId: string;
  userRole: string;
}

type StepStatus = 'start' | 'ok' | 'error' | 'timeout';

interface TraceEvent {
  step: string;
  status: StepStatus;
  durationMs?: number;
  detail?: Record<string, unknown>;  // no PII values
}
```

**Public API:**

| Method | Purpose |
|--------|---------|
| `createEmployeeEditTrace(ctx)` | Factory — creates a logger with the given context |
| `.log(step, status, detail?)` | Append an event; immediately `console.log` it |
| `.logError(step, error)` | Shorthand: extracts `error.message`, `error.code`, `httpStatus` (no stack) |
| `.withTrace(promise, step, timeoutMs)` | Race the promise against a timeout; logs start/ok/error/timeout; re-throws on failure |
| `.flush()` | Fire-and-forget: POST all events to `diagnostic_logs` via Supabase client; swallows errors so logging never breaks the UI |

**Console format:**
```
[EMP-EDIT emp-edit-1716499200000-k7qx] action-start | start | {"employeeId":"abc-123","userRole":"ADMIN"}
[EMP-EDIT emp-edit-1716499200000-k7qx] primary-save  | ok    | {"durationMs":342}
[EMP-EDIT emp-edit-1716499200000-k7qx] loading-reset | ok    | {}
```

**Flush behavior:** calls `supabase.from('diagnostic_logs').insert(rows)` in a `try/catch` that swallows errors. Never `await`ed by callers. Runs regardless of whether the save succeeded or failed.

**Guard:** The `.flush()` method checks `import.meta.env.DEV` before writing to Supabase to prevent diagnostic noise in production. Console output is always emitted (useful in browser DevTools regardless of environment).

---

## Modified File: `src/pages/Employees.tsx`

Function: `handleEmployeeManagerSave`

Trace events added (in order):

| Step | Status logged | When |
|------|--------------|------|
| `action-start` | `start` | First line of function, before `setIsSavingEmployee(true)` |
| `loading-state-set` | `ok` | After `setIsSavingEmployee(true)` |
| `save-dispatched` | `start` | Before `await onUpdateEmployee(employee)` |
| `save-result` | `ok` / `error` | After the await resolves (or in catch) |
| `modal-close` | `ok` | After `setIsEmployeeManagerOpen(false)` |
| `loading-reset` | `ok` | Inside `finally` block, after `setIsSavingEmployee(false)` |

The `finally` block guarantees `loading-reset` is always logged. If `loading-reset` never appears in the trace, the async function's own promise never settled — the `withEmployeeSaveTimeout` race did not fire.

The `trace` object is passed to `onUpdateEmployee` as a second argument (forwarded via `handleUpdateEmployee`).

---

## Modified File: `src/features/employees/useWorkforceData.ts`

Interface change:
```typescript
interface EmployeeMutationOptions {
  refreshAfterSave?: boolean;
  _trace?: TraceLogger;  // optional; no-op if absent
}
```

Function: `handleUpdateEmployee`

Trace events added:

| Step | Status logged | When |
|------|--------------|------|
| `primary-attempt-start` | `start` | Before `withEmployeeSaveTimeout(...useAdminHandler:false...)` |
| `primary-attempt-result` | `ok` / `error` | After primary resolves or throws |
| `fallback-check` | `ok` / `error` | Result of `canUseEmployeeAdminFallback(user)` |
| `fallback-attempt-start` | `start` | Before `withEmployeeSaveTimeout(...useAdminHandler:true...)` |
| `fallback-attempt-result` | `ok` / `error` | After fallback resolves or throws |
| `refresh-start` | `start` | Before `EmployeeService.getEmployees(...)` (if refreshAfterSave) |
| `refresh-result` | `ok` / `error` | After refresh resolves |

The existing `withEmployeeSaveTimeout` calls are replaced with `trace.withTrace(...)` calls where a trace is present, preserving the same timeout values (15 000 ms primary, 20 000 ms fallback).

---

## Modified File: `src/services/EmployeeService.ts`

Interface change:
```typescript
type EmployeeSaveOptions = {
  useAdminHandler?: boolean;
  _trace?: TraceLogger;
};
```

When `useAdminHandler: true`, the edge function call gains the header:
```
x-correlation-id: <trace.correlationId>
```

No other changes to `EmployeeService`. The schema fallback loop (`mutateEmployeeRowWithSchemaFallback`) is not instrumented in this iteration — if the bug is not found at the higher layers, a second iteration can add per-attempt logging there.

---

## Modified File: `supabase/functions/admin-handler/index.ts`

Case: `save-employee-for-company`

The edge function reads the correlation ID from the incoming request:
```typescript
const correlationId = req.headers.get('x-correlation-id') ?? `edge-${Date.now()}`;
```

Log events written to both `console.log` (Supabase dashboard) and `diagnostic_logs`:

| Step | Status logged | When |
|------|--------------|------|
| `edge-request-received` | `start` | Top of case handler |
| `edge-body-parsed` | `ok` / `error` | After JSON.parse |
| `edge-caller-resolved` | `ok` / `error` | After `getCallerProfile` returns |
| `edge-company-access-checked` | `ok` / `error` | After `assertCompanyAccess` |
| `edge-payload-built` | `ok` | After `buildEmployeePayload` |
| `edge-schema-attempt-N` | `ok` / `error` | Each iteration of the 8-attempt loop (N = 1–8) |
| `edge-write-complete` | `ok` | After successful upsert |
| `edge-response-sent` | `ok` / `error` | Just before `return new Response(...)` |

Edge function writes to `diagnostic_logs` using the `adminClient` (service_role), so RLS never blocks the write even if the employee upsert itself fails due to RLS.

Console format matches frontend:
```
[EMP-EDIT emp-edit-1716499200000-k7qx] edge-request-received | start | {"companyId":"...","userId":"..."}
```

---

## Scenario → Expected Trace Outputs

### Scenario A — Happy path
```
action-start          | start
loading-state-set     | ok
save-dispatched       | start
primary-attempt-start | start
edge-request-received | start  (edge)
edge-caller-resolved  | ok     (edge)
edge-write-complete   | ok     (edge)
primary-attempt-result| ok
save-result           | ok
modal-close           | ok
loading-reset         | ok
```

### Scenario B — Primary times out, fallback succeeds
```
primary-attempt-start  | start
primary-attempt-result | timeout  (after 15 000 ms)
fallback-check         | ok
fallback-attempt-start | start
...edge events...
fallback-attempt-result| ok
save-result            | ok
loading-reset          | ok
```

### Scenario C — Both paths time out (infinite loading root cause)
```
primary-attempt-start  | start
primary-attempt-result | timeout  (15 000 ms)
fallback-attempt-start | start
fallback-attempt-result| timeout  (20 000 ms)
save-result            | error
loading-reset          | ok       ← finally block fires
```
If `loading-reset` is absent: the outer async function itself hung — a promise was created but never settled before `withEmployeeSaveTimeout` was called.

### Scenario D — Edge function RLS block
```
edge-request-received  | start
edge-caller-resolved   | ok
edge-company-access-checked | error  {"errorCode":"42501"}
edge-response-sent     | error
primary-attempt-result | error
fallback-check         | ok
...
```

### Scenario E — Silent catch swallows error, loading never resets
```
action-start           | start
loading-state-set      | ok
save-dispatched        | start
[no further events]
```
This pattern (save-dispatched with no following events) means the promise chain entered a branch that neither resolves nor rejects — the most likely infinite loading cause.

---

## Implementation Scope

| File | Change type |
|------|------------|
| `src/utils/employeeEditTrace.ts` | **New file** |
| `db/migrations/<timestamp>_diagnostic_logs.sql` | **New migration** |
| `src/pages/Employees.tsx` | Modified (`handleEmployeeManagerSave`) |
| `src/features/employees/useWorkforceData.ts` | Modified (`handleUpdateEmployee`, `EmployeeMutationOptions`) |
| `src/services/EmployeeService.ts` | Modified (`saveEmployee`, `EmployeeSaveOptions`) |
| `supabase/functions/admin-handler/index.ts` | Modified (`save-employee-for-company` case) |

Total: 1 new utility, 1 new migration, 4 modified files.

---

## Reading the Logs

After a failed save attempt:

1. Open browser DevTools → Console. Filter by `[EMP-EDIT`.
2. The correlation ID is in every line — copy it.
3. In Supabase dashboard → Table Editor → `diagnostic_logs`, filter `correlation_id = '<value>'`, order by `created_at`.
4. Find the last event with `status = 'ok'` — the step immediately after is where the flow broke.
5. If `loading-reset` is absent, the break is in a promise that was never created (before `withEmployeeSaveTimeout`).
6. If `edge-request-received` never appears but `save-dispatched` does, the HTTP request never reached the edge function.

---

## Out of Scope

- Fixing the underlying infinite loading bug (this design only diagnoses it)
- Logging inside `mutateEmployeeRowWithSchemaFallback` per-column-drop (second iteration if needed)
- Production alerting or dashboards
- Automatic log pruning / TTL
- Instrumenting other employee operations (add, delete)
