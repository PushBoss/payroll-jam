import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redact } from './_redact.js';

// See docs/superpowers/specs/2026-08-04-crash-detection-and-alerting-design.md
//
// Two distinct capture paths exist for this system:
//   1. withCrashLogging() below -- catches errors thrown DURING handler execution.
//   2. api/health.ts + api/cron/health-check.ts -- catches module-load-time crashes
//      (like the July 21 incident), which a try/catch around handler code can
//      never see, because the process dies before the handler is even reachable.
// Both paths call logCrash() with the same shape.

const DEDUPE_WINDOW_MINUTES = 30;

const getSupabaseFunctionsUrl = () => {
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  if (!base) return null;
  return `${base}/functions/v1/send-email`;
};

const sendCrashAlertEmail = async (endpoint: string, severity: string, message: string) => {
  const to = process.env.CRASH_ALERT_EMAIL;
  const functionsUrl = getSupabaseFunctionsUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!to || !functionsUrl || !serviceRoleKey) {
    console.error('Cannot send crash alert email: CRASH_ALERT_EMAIL/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured');
    return false;
  }

  try {
    const response = await fetch(functionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        to,
        subject: `[Payroll-Jam] Critical failure: ${endpoint}`,
        html: `<p><strong>Severity:</strong> ${severity}</p><p><strong>Endpoint:</strong> ${endpoint}</p><p><strong>Error:</strong> ${message}</p><p>Check SuperAdmin &rarr; Crash Logs for details.</p>`
      })
    });
    return response.ok;
  } catch (error) {
    console.error('Failed to send crash alert email:', error);
    return false;
  }
};

export const logCrash = async (params: {
  source: 'vercel-api' | 'supabase-edge';
  endpoint: string;
  severity: 'critical' | 'error';
  error: unknown;
  context?: Record<string, unknown>;
}) => {
  const { source, endpoint, severity, error, context } = params;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // console.error is the last-resort fallback: if Supabase itself is what's down
  // (the exact scenario that caused the original incident), this is the only
  // record of the crash, visible in Vercel's own function logs.
  console.error(`[crash-logger] ${source} ${endpoint} (${severity}):`, errorMessage);

  try {
    const { supabaseAdmin } = await import('./_supabaseAdmin.js');

    const { data: existing } = await supabaseAdmin
      .from('system_crash_logs')
      .select('id')
      .eq('endpoint', endpoint)
      .eq('error_message', errorMessage)
      .eq('severity', 'critical')
      .gte('created_at', new Date(Date.now() - DEDUPE_WINDOW_MINUTES * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();

    let emailSent = false;
    if (severity === 'critical' && !existing) {
      emailSent = await sendCrashAlertEmail(endpoint, severity, errorMessage);
    }

    await supabaseAdmin.from('system_crash_logs').insert({
      source,
      endpoint,
      severity,
      error_message: errorMessage,
      error_stack: errorStack || null,
      context: context ? redact(context) : null,
      email_sent: emailSent
    });
  } catch (loggingError) {
    // Logging itself must never take down the handler it's instrumenting.
    console.error('[crash-logger] failed to persist crash log:', loggingError);
  }
};

type VercelHandlerResult = void | VercelResponse | Promise<void | VercelResponse>;

export const withCrashLogging = (
  handler: (req: VercelRequest, res: VercelResponse) => VercelHandlerResult,
  options: { endpoint: string; critical: boolean }
) => {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      await handler(req, res);
    } catch (error) {
      await logCrash({
        source: 'vercel-api',
        endpoint: options.endpoint,
        severity: options.critical ? 'critical' : 'error',
        error,
        context: { method: req.method, path: req.url }
      });

      if (!res.headersSent) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
      }
    }
  };
};
