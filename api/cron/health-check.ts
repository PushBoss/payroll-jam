import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logCrash } from '../_crashLogger.js';
import { buildAbsoluteUrl } from '../_dimepay.js';

// Calls /api/health on a schedule (see .github/workflows/health-check-cron.yml)
// and logs a critical crash if it fails. This is what would have caught the
// July 21 incident within minutes instead of two weeks -- see
// docs/superpowers/specs/2026-08-04-crash-detection-and-alerting-design.md

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const healthUrl = buildAbsoluteUrl(req, '/api/health');

  try {
    const response = await fetch(healthUrl);
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      await logCrash({
        source: 'vercel-api',
        endpoint: '/api/health',
        severity: 'critical',
        error: new Error(`Health check failed: ${JSON.stringify(body)}`),
        context: { status: response.status }
      });
      return res.status(200).json({ healthy: false, details: body });
    }

    return res.status(200).json({ healthy: true });
  } catch (error: any) {
    await logCrash({
      source: 'vercel-api',
      endpoint: '/api/health',
      severity: 'critical',
      error,
      context: { healthUrl }
    });
    return res.status(200).json({ healthy: false, error: error?.message || String(error) });
  }
}
