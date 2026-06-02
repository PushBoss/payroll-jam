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

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const unwrapDimePayResponse = (data: any) => {
  const body = typeof data?.body === 'string' ? safeJsonParse(data.body) : data?.body;
  return data?.data?.response || data?.data || body?.response || data?.response || data || {};
};

const getDimePayMessage = (data: any) => {
  const body = typeof data?.body === 'string' ? safeJsonParse(data.body) : data?.body;
  return data?.message || body?.message || data?.details?.body?.message || '';
};

const normalizeCardDetails = (data: any) => {
  const source = unwrapDimePayResponse(data);
  const card = source.card || source;
  const status = source.status || card.status || (card.token || card.card_token ? 'SUCCESS' : data?.status);

  return {
    ...data,
    ...source,
    status,
    token: card.token || card.card_token || source.token || source.card_token || data?.token,
    card_token: card.card_token || card.token || source.card_token || source.token || data?.card_token,
    card_request_token: card.card_request_token || source.card_request_token || data?.card_request_token,
    last_four_digits: card.last_four_digits || card.card_last4 || card.card_last_four || source.last_four_digits || source.card_last4 || source.card_last_four || data?.last_four_digits,
    card_scheme: card.card_scheme || card.card_brand || source.card_scheme || source.card_brand || data?.card_scheme,
    card_expiry: card.card_expiry || source.card_expiry || data?.card_expiry
  };
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
      const message = getDimePayMessage(data);
      if (/not verified/i.test(message)) {
        return res.status(200).json({
          status: 'PENDING',
          token: null,
          card_request_token: token,
          message
        });
      }

      return res.status(response.status).json({ error: 'Failed to load card details', details: data });
    }

    return res.status(200).json(normalizeCardDetails(data));
  } catch (error: any) {
    console.error('❌ Error getting card details:', error);
    return res.status(500).json({ error: error.message || 'Failed to get card details' });
  }
}
