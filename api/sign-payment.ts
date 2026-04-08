import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
import { buildAbsoluteUrl } from './_dimepay';

// CORS headers for security
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production'
    ? 'https://www.payrolljam.com'
    : '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { payload, environment } = req.body;

    if (!payload) {
      return res.status(400).json({ error: 'Payload is required' });
    }

    // Inject webhook URL into payload if not already present
    if (!payload.webhookUrl) {
      payload.webhookUrl = buildAbsoluteUrl(req, '/api/dimepay-webhook');
    }

    // Determine effective environment based strictly on the client's request
    // This ensures sandbox client tests correctly use the sandbox secret, matching the sandbox API key cleanly.
    const effectiveEnvironment = environment === 'production' ? 'production' : 'sandbox';

    console.log(`🔍 [${effectiveEnvironment}] resolving keys...`);

    // Check for keys with and without VITE_ prefix to be robust against user naming mismatch
    const secretKey = effectiveEnvironment === 'production'
      ? (process.env.DIMEPAY_SECRET_KEY_PROD || process.env.VITE_DIMEPAY_SECRET_KEY_PROD || process.env.DIMEPAY_SECRET_KEY || process.env.VITE_DIMEPAY_SECRET_KEY)
      : (process.env.DIMEPAY_SECRET_KEY_SANDBOX || process.env.VITE_DIMEPAY_SECRET_KEY_SANDBOX || process.env.DIMEPAY_SECRET_KEY || process.env.VITE_DIMEPAY_SECRET_KEY);

    if (!secretKey) {
      console.error('❌ Secret key not configured for environment:', effectiveEnvironment);
      console.error('Available Env Vars (Keys only):', Object.keys(process.env).filter(k => k.includes('DIME')));
      return res.status(500).json({ error: 'Payment gateway not configured' });
    } else {
      console.log(`✅ Secret key found for ${effectiveEnvironment} (Length: ${secretKey.length})`);
    }

    // Create JWT
    const header = { alg: 'HS256', typ: 'JWT' };

    const base64url = (source: string) => {
      return Buffer.from(source)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    };

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    // Sign with HMAC-SHA256
    const signature = createHmac('sha256', secretKey)
      .update(signatureInput)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const jwt = `${encodedHeader}.${encodedPayload}.${signature}`;

    console.log('✅ JWT signed successfully for environment:', environment);

    return res.status(200).setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']).json({ jwt });
  } catch (error: any) {
    console.error('❌ JWT signing error:', error);
    return res.status(500).json({ error: 'Failed to sign payment data' });
  }
}
