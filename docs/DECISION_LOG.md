# Decision Log

---

## ADR-001: Employee Edit Diagnostic Logging

### 1. Status
- **Date**: 2026-05-26
- **Status**: Accepted
- **Deciders**: Chad (product), Claude Code (implementation)

### 2. Context
- **Problem Statement**: After a pay run completes, editing an employee record intermittently enters an infinite loading state with no visible error and no server-side trace. The bug is non-deterministic and not reproducible on demand.
- **Constraints**: Must not log PII (TRN, NIS, bank details, payroll amounts, passwords). Must be safe for dev/staging before production. Must not break existing save behavior.

### 3. Options Considered

#### Option A: Lightweight Trace Logger (chosen)
- **Pros**: Zero new infrastructure, uses existing Supabase client, single new utility file, fire-and-forget so it never blocks the UI, correlation ID threads across frontend and edge function.
- **Cons**: Frontend flush is dev-only so production failures won't write to the table (console still works).

#### Option B: External observability service (Sentry, Datadog)
- **Pros**: Production-grade, dashboards, alerting.
- **Cons**: Cost, new dependency, more setup time, overkill for a targeted diagnostic.

#### Option C: Verbose console.log only (no DB flush)
- **Pros**: Simplest.
- **Cons**: Requires browser DevTools open at the time of failure; cross-session correlation impossible.

### 4. Final Decision
- **Chosen Option**: A — Lightweight TraceLogger
- **Rationale**: Diagnostic goal is narrow (find the failure point, then fix). Option A gives cross-session queryability via `diagnostic_logs` without new infrastructure or production risk.

### 5. Consequences
- **Positive Impacts**: Any future occurrence of the infinite loading bug produces a queryable trace in `diagnostic_logs` linked by `correlation_id`. Console output works in all environments.
- **Negative Impacts / Risks**: `diagnostic_logs` table has no TTL — prune manually after the bug is diagnosed.
- **Future Work**: Once the bug is identified and fixed, remove the trace instrumentation or promote it to a structured logging service.

### 6. Related Decisions
- Spec: `docs/superpowers/specs/2026-05-23-employee-edit-diagnostic-logging-design.md`
- Plan: `docs/superpowers/plans/2026-05-26-employee-edit-diagnostic-logging.md`

---

## Template (copy for new entries)

### 1. Status
- **Date**: 
- **Status**: (Proposed / Accepted / Rejected / Superseded)
- **Deciders**: 

### 2. Context
- **Problem Statement**: 
- **Constraints**: 

### 3. Options Considered
#### Option A: [Title]
- **Pros**: 
- **Cons**: 

#### Option B: [Title]
- **Pros**: 
- **Cons**: 

### 4. Final Decision
- **Chosen Option**: 
- **Rationale**: 

### 5. Consequences
- **Positive Impacts**: 
- **Negative Impacts / Risks**: 
- **Future Work**: 

### 6. Related Decisions
- (Link to other decision logs)
