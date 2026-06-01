import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDimePayCredentials, normalizeDimePayExternalUrl, resolveDimePayEnvironment } from './_dimepay';
import { signDimePayJwt } from './_dimepayJwt';

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production'
    ? 'https://www.payrolljam.com'
    : '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
    res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { payload, environment } = req.body || {};
    if (!payload) {
      return res.status(400).json({ error: 'Payload is required' });
    }

    const payloadObject = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!payloadObject || typeof payloadObject !== 'object' || Array.isArray(payloadObject)) {
      return res.status(400).json({ error: 'Payload must be an object' });
    }

    const webhookUrl = normalizeDimePayExternalUrl(
      req,
      payloadObject.webhookUrl || payloadObject.webhook_url,
      '/api/webhooks/dimepay'
    );
    const credentials = getDimePayCredentials(resolveDimePayEnvironment(environment, req));
    const jwt = signDimePayJwt({
      ...payloadObject,
      webhookUrl,
      webhook_url: webhookUrl
    }, credentials.secretKey);

    return res
      .status(200)
      .setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin'])
      .json({ jwt });
  } catch (error: any) {
    console.error('DimePay signing error:', error);
    return res.status(500).json({ error: error.message || 'Failed to sign payment data' });
  }
}
