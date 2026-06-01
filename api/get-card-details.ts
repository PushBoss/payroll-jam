import type { VercelRequest, VercelResponse } from '@vercel/node';

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
      process.env.DIMEPAY_CLIENT_KEY ||
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
      process.env.DIMEPAY_CLIENT_KEY ||
      process.env.DIMEPAY_CLIENT_ID_SANDBOX ||
      process.env.DIMEPAY_API_KEY_SANDBOX ||
      process.env.VITE_DIMEPAY_CLIENT_ID_SANDBOX ||
      process.env.VITE_DIMEPAY_API_KEY_SANDBOX ||
      process.env.DIMEPAY_CLIENT_ID ||
      process.env.DIMEPAY_API_KEY ||
      process.env.VITE_DIMEPAY_API_KEY ||
      ''
    );

  if (!clientKey) {
    throw new Error(`Missing DimePay client key for ${environment}`);
  }

  return {
    clientKey,
    baseUrl: environment === 'production'
      ? 'https://api.dimepay.app/dapi/v1'
      : 'https://sandbox.api.dimepay.app/dapi/v1'
  };
};

const getDimePayRequest = async (path: string, environment: DimePayEnvironment) => {
  const credentials = getDimePayCredentials(environment);

  return fetch(`${credentials.baseUrl}${path}`, {
    method: 'GET',
    headers: {
      client_key: credentials.clientKey
    }
  });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = typeof req.query.token === 'string' ? req.query.token : undefined;
    const environment = typeof req.query.environment === 'string' ? req.query.environment : undefined;

    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    const dimePayEnvironment = resolveDimePayEnvironment(environment, req);
    const response = await getDimePayRequest(`/cards/${encodeURIComponent(token)}`, dimePayEnvironment);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to load card details', details: data });
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('❌ Error getting card details:', error);
    return res.status(500).json({ error: error.message || 'Failed to get card details' });
  }
}
