import { supabase } from '../services/supabaseClient';

export interface TraceContext {
  employeeId: string;
  companyId: string;
  userId: string;
  userRole: string;
}

type StepStatus = 'start' | 'ok' | 'error' | 'timeout';

type DiagnosticRow = {
  correlation_id: string;
  source: string;
  step: string;
  status: StepStatus;
  duration_ms: number | null;
  employee_id: string;
  company_id: string;
  user_id: string;
  user_role: string;
  detail: Record<string, unknown>;
};

export interface TraceLogger {
  correlationId: string;
  log(step: string, status: StepStatus, detail?: Record<string, unknown>): void;
  logError(step: string, error: unknown): void;
  withTrace<T>(promise: Promise<T>, step: string, timeoutMs: number): Promise<T>;
  flush(): void;
}

function generateCorrelationId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const rand = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `emp-edit-${Date.now()}-${rand}`;
}

export function createEmployeeEditTrace(ctx: TraceContext): TraceLogger {
  const correlationId = generateCorrelationId();
  const events: DiagnosticRow[] = [];

  function log(step: string, status: StepStatus, detail: Record<string, unknown> = {}) {
    console.log(`[EMP-EDIT ${correlationId}] ${step} | ${status} | ${JSON.stringify(detail)}`);
    events.push({
      correlation_id: correlationId,
      source: 'frontend',
      step,
      status,
      duration_ms: typeof detail.durationMs === 'number' ? detail.durationMs : null,
      employee_id: ctx.employeeId,
      company_id: ctx.companyId,
      user_id: ctx.userId,
      user_role: ctx.userRole,
      detail,
    });
  }

  function logError(step: string, error: unknown) {
    const e = error as Record<string, unknown>;
    log(step, 'error', {
      errorCode: e?.code ?? e?.error_code,
      httpStatus: e?.status ?? e?.statusCode,
    });
  }

  async function withTrace<T>(promise: Promise<T>, step: string, timeoutMs: number): Promise<T> {
    const startedAt = Date.now();
    log(step, 'start');
    try {
      const result = await Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`${step} timed out`)), timeoutMs)
        ),
      ]);
      log(step, 'ok', { durationMs: Date.now() - startedAt });
      return result;
    } catch (error: unknown) {
      const durationMs = Date.now() - startedAt;
      if ((error as Error)?.message?.includes('timed out')) {
        log(step, 'timeout', { durationMs, timeoutMs });
      } else {
        logError(step, error);
      }
      throw error;
    }
  }

  function flush() {
    if (!import.meta.env.DEV || !supabase || events.length === 0) return;
    supabase.from('diagnostic_logs').insert(events).then(null, () => {});
  }

  return { correlationId, log, logError, withTrace, flush };
}
