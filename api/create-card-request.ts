import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';

type DimePayEnvironment = 'sandbox' | 'production';

const resolveDimePayEnvironment = (requested: string | undefined, req: VercelRequest): DimePayEnvironment => {
  if (requested === 'production' || requested === 'sandbox') return requested;

  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  const isProductionHost = host === 'payrolljam.com' || host === 'www.payrolljam.com';
  const isProductionEnv = process.env.VERCEL_ENV === 'production' || process.env.APP_ENV === 'production';
  return isProductionHost || isProductionEnv ? 'production' : 'sandbox';
};

const getDimePayCredentials = (environment: DimePayEnvironment) => {
  const clientKey = environment === 'production'
    ? (
      process.env.DIMEPAY_CLIENT_ID_PROD ||
      process.env.DIMEPAY_API_KEY_PROD ||
      process.env.VITE_DIMEPAY_CLIENT_ID_PROD ||
      process.env.VITE_DIMEPAY_API_KEY_PROD ||
      process.env.DIMEPAY_CLIENT_ID ||
      process.env.DIMEPAY_API_KEY ||
      process.env.VITE_DIMEPAY_API_KEY ||
      ''
    )
    : (
      process.env.DIMEPAY_CLIENT_ID_SANDBOX ||
      process.env.DIMEPAY_API_KEY_SANDBOX ||
      process.env.VITE_DIMEPAY_CLIENT_ID_SANDBOX ||
      process.env.VITE_DIMEPAY_API_KEY_SANDBOX ||
      process.env.DIMEPAY_CLIENT_ID ||
      process.env.DIMEPAY_API_KEY ||
      process.env.VITE_DIMEPAY_API_KEY ||
      ''
    );

  const secretKey = environment === 'production'
    ? (process.env.DIMEPAY_SECRET_KEY_PROD || process.env.VITE_DIMEPAY_SECRET_KEY_PROD || process.env.DIMEPAY_SECRET_KEY || process.env.VITE_DIMEPAY_SECRET_KEY || '')
    : (process.env.DIMEPAY_SECRET_KEY_SANDBOX || process.env.VITE_DIMEPAY_SECRET_KEY_SANDBOX || process.env.DIMEPAY_SECRET_KEY || process.env.VITE_DIMEPAY_SECRET_KEY || '');

  if (!clientKey || !secretKey) {
    throw new Error(`Missing DimePay credentials for ${environment}`);
  }

  return {
    clientKey,
    secretKey,
    baseUrl: environment === 'production'
      ? 'https://api.dimepay.app/dapi/v1'
      : 'https://sandbox.api.dimepay.app/dapi/v1'
  };
};

const base64url = (source: string) => Buffer.from(source)
  .toString('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

const signDimePayPayload = (payload: Record<string, unknown>, secretKey: string) => {
  const encodedHeader = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', secretKey)
    .update(signatureInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

const buildAbsoluteUrl = (req: VercelRequest, path: string) => {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  return `${proto}://${host}${path}`;
};

const buildCardReferenceId = (params: {
  companyId: string;
  localSubscriptionId?: string;
  dimepaySubscriptionId?: string;
}) => [
  params.companyId,
  params.localSubscriptionId || 'none',
  params.dimepaySubscriptionId || 'none',
  Date.now().toString()
].join('__');

const postSignedDimePayRequest = async (
  path: string,
  payload: Record<string, unknown>,
  environment: DimePayEnvironment
) => {
  const credentials = getDimePayCredentials(environment);
  const jwt = signDimePayPayload(payload, credentials.secretKey);

  return fetch(`${credentials.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      client_key: credentials.clientKey
    },
    body: JSON.stringify({
      lang: 'en',
      data: jwt
    })
  });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      company_id,
      local_subscription_id,
      subscription_id,
      redirect_url,
      environment
    } = req.body || {};

    if (!company_id) {
      return res.status(400).json({ error: 'company_id is required' });
    }

    const dimePayEnvironment = resolveDimePayEnvironment(environment, req);
    const response = await postSignedDimePayRequest(
      '/card-request',
      {
        id: buildCardReferenceId({
          companyId: company_id,
          localSubscriptionId: local_subscription_id,
          dimepaySubscriptionId: subscription_id
        }),
        webhookUrl: buildAbsoluteUrl(req, '/api/dimepay-card-webhook'),
        redirectUrl: redirect_url || buildAbsoluteUrl(req, '/?page=settings')
      },
      dimePayEnvironment
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Failed to create card request',
        details: data
      });
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('❌ Error creating card request:', error);
    return res.status(500).json({ error: error.message || 'Failed to create card request' });
  }
}
