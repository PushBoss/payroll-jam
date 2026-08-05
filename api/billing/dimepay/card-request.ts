import type { VercelRequest, VercelResponse } from '@vercel/node';
import cardRequestHandler from '../../_dimepayCardRequest.js';
import { withCrashLogging } from '../../_crashLogger.js';

const renderCardReturn = (res: VercelResponse) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  return res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Card verification complete</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #111827; background: #fff; }
      main { width: min(420px, calc(100vw - 48px)); text-align: center; }
      .mark { width: 48px; height: 48px; border-radius: 999px; margin: 0 auto 16px; display: grid; place-items: center; color: #fff; background: #16a34a; font-weight: 800; }
      h1 { font-size: 20px; line-height: 1.3; margin: 0 0 8px; }
      p { margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">✓</div>
      <h1>Card verification complete</h1>
      <p>You can return to Payroll-Jam. This window will update automatically.</p>
    </main>
    <script>try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'dimepay-card-return' }, '*'); } catch (_) {}</script>
  </body>
</html>`);
};

const handler = (req: VercelRequest, res: VercelResponse) => {
  // /card-return is internally rewritten here to stay within Vercel Hobby's
  // function limit while keeping DimePay's registered callback URL unchanged.
  if (req.query._card_return === '1') return renderCardReturn(res);
  return cardRequestHandler(req, res);
};

export default withCrashLogging(handler, { endpoint: '/api/billing/dimepay/card-request', critical: true });
