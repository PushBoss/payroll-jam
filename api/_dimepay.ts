import type { VercelRequest } from '@vercel/node';
import { createHmac } from 'crypto';

export type DimePayEnvironment = 'sandbox' | 'production';

interface DimePayCredentials {
  environment: DimePayEnvironment;
  clientKey: string;
  secretKey: string;
  baseUrl: string;
}

const base64url = (source: string) => {
  return Buffer.from(source)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

export const resolveDimePayEnvironment = (
  requested?: string,
  req?: VercelRequest
): DimePayEnvironment => {
  if (requested === 'production' || requested === 'sandbox') {
    return requested;
  }

  const host = (req?.headers.host || '').split(':')[0].toLowerCase();
  const isProductionHost = host === 'payrolljam.com' || host === 'www.payrolljam.com';
  const isProductionEnv = process.env.VERCEL_ENV === 'production' || process.env.APP_ENV === 'production';

  return isProductionHost || isProductionEnv ? 'production' : 'sandbox';
};

export const getDimePayCredentials = (environment: DimePayEnvironment): DimePayCredentials => {
  const clientKey = environment === 'production'
    ? (process.env.DIMEPAY_CLIENT_ID_PROD || process.env.VITE_DIMEPAY_CLIENT_ID_PROD || process.env.DIMEPAY_CLIENT_ID || process.env.VITE_DIMEPAY_API_KEY_PROD || process.env.VITE_DIMEPAY_API_KEY || '')
    : (process.env.DIMEPAY_CLIENT_ID_SANDBOX || process.env.VITE_DIMEPAY_CLIENT_ID_SANDBOX || process.env.DIMEPAY_CLIENT_ID || process.env.VITE_DIMEPAY_API_KEY_SANDBOX || process.env.VITE_DIMEPAY_API_KEY || '');

  const secretKey = environment === 'production'
    ? (process.env.DIMEPAY_SECRET_KEY_PROD || process.env.VITE_DIMEPAY_SECRET_KEY_PROD || process.env.DIMEPAY_SECRET_KEY || process.env.VITE_DIMEPAY_SECRET_KEY || '')
    : (process.env.DIMEPAY_SECRET_KEY_SANDBOX || process.env.VITE_DIMEPAY_SECRET_KEY_SANDBOX || process.env.DIMEPAY_SECRET_KEY || process.env.VITE_DIMEPAY_SECRET_KEY || '');

  if (!clientKey || !secretKey) {
    throw new Error(`Missing DimePay credentials for ${environment}`);
  }

  return {
    environment,
    clientKey,
    secretKey,
    baseUrl: environment === 'production'
      ? 'https://api.dimepay.app/dapi/v1'
      : 'https://sandbox.api.dimepay.app/dapi/v1'
  };
};

export const signDimePayPayload = (payload: Record<string, any>, secretKey: string) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
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

export const postSignedDimePayRequest = async (
  path: string,
  payload: Record<string, any>,
  environment: DimePayEnvironment,
  method: 'POST' | 'PUT' = 'POST'
) => {
  const credentials = getDimePayCredentials(environment);
  const jwt = signDimePayPayload(payload, credentials.secretKey);

  return fetch(`${credentials.baseUrl}${path}`, {
    method,
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

export const getDimePayRequest = async (path: string, environment: DimePayEnvironment) => {
  const credentials = getDimePayCredentials(environment);

  return fetch(`${credentials.baseUrl}${path}`, {
    method: 'GET',
    headers: {
      client_key: credentials.clientKey
    }
  });
};

export const buildAbsoluteUrl = (req: VercelRequest, path: string) => {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  return `${proto}://${host}${path}`;
};

export const buildCardReferenceId = (params: {
  companyId: string;
  localSubscriptionId?: string;
  dimepaySubscriptionId?: string;
}) => {
  return [
    params.companyId,
    params.localSubscriptionId || 'none',
    params.dimepaySubscriptionId || 'none',
    Date.now().toString()
  ].join('__');
};

export const parseCardReferenceId = (referenceId?: string) => {
  if (!referenceId) return null;
  const [companyId, localSubscriptionId, dimepaySubscriptionId] = referenceId.split('__');
  if (!companyId) return null;

  return {
    companyId,
    localSubscriptionId: localSubscriptionId && localSubscriptionId !== 'none' ? localSubscriptionId : undefined,
    dimepaySubscriptionId: dimepaySubscriptionId && dimepaySubscriptionId !== 'none' ? dimepaySubscriptionId : undefined
  };
};

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

export const updateDimePaySubscriptionCard = async (params: {
  environment: DimePayEnvironment;
  subscriptionId: string;
  cardToken: string;
  cardRequestToken?: string;
}) => {
  const overridePath = params.environment === 'production'
    ? process.env.DIMEPAY_SUBSCRIPTION_UPDATE_PATH_PROD || process.env.DIMEPAY_SUBSCRIPTION_UPDATE_PATH
    : process.env.DIMEPAY_SUBSCRIPTION_UPDATE_PATH_SANDBOX || process.env.DIMEPAY_SUBSCRIPTION_UPDATE_PATH;

  const candidatePaths = unique([
    overridePath || '',
    '/subscriptions/update',
    '/subscriptions/update-card',
    '/subscriptions/rebind',
    '/subscriptions/payment-method',
    '/subscription/update'
  ]);

  let lastError = 'No DimePay subscription update endpoint succeeded.';

  for (const path of candidatePaths) {
    for (const method of ['POST', 'PUT'] as const) {
      try {
        const response = await postSignedDimePayRequest(path, {
          subscription_id: params.subscriptionId,
          card_token: params.cardToken,
          payment_method_token: params.cardToken,
          token: params.cardToken,
          ...(params.cardRequestToken ? { card_request_token: params.cardRequestToken } : {})
        }, params.environment, method);

        if (response.ok) {
          return {
            ok: true,
            path,
            method,
            data: await response.json().catch(() => null)
          };
        }

        const errorText = await response.text();
        lastError = `${method} ${path} failed with ${response.status}: ${errorText}`;

        if (![404, 405].includes(response.status)) {
          return { ok: false, path, method, error: lastError };
        }
      } catch (error: any) {
        lastError = `${method} ${path} failed: ${error.message}`;
      }
    }
  }

  return { ok: false, error: lastError };
};

export const cancelDimePaySubscription = async (params: {
  environment: DimePayEnvironment;
  subscriptionId: string;
}) => {
  const overridePath = params.environment === 'production'
    ? process.env.DIMEPAY_SUBSCRIPTION_CANCEL_PATH_PROD || process.env.DIMEPAY_SUBSCRIPTION_CANCEL_PATH
    : process.env.DIMEPAY_SUBSCRIPTION_CANCEL_PATH_SANDBOX || process.env.DIMEPAY_SUBSCRIPTION_CANCEL_PATH;

  const candidatePaths = unique([
    overridePath || '',
    '/subscriptions/cancel'
  ]);

  let lastError = 'No DimePay cancellation endpoint succeeded.';

  for (const path of candidatePaths) {
    for (const method of ['POST', 'PUT'] as const) {
      try {
        const response = await postSignedDimePayRequest(path, {
          subscription_id: params.subscriptionId
        }, params.environment, method);

        if (response.ok) {
          return {
            ok: true,
            path,
            method,
            data: await response.json().catch(() => null)
          };
        }

        const errorText = await response.text();
        lastError = `${method} ${path} failed with ${response.status}: ${errorText}`;

        if (![404, 405].includes(response.status)) {
          return { ok: false, path, method, error: lastError };
        }
      } catch (error: any) {
        lastError = `${method} ${path} failed: ${error.message}`;
      }
    }
  }

  return { ok: false, error: lastError };
};
