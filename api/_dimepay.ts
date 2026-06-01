import type { VercelRequest } from '@vercel/node';
import { signDimePayJwt } from './_dimepayJwt.ts';

export type DimePayEnvironment = 'sandbox' | 'production';

interface DimePayCredentials {
  environment: DimePayEnvironment;
  clientKey: string;
  secretKey: string;
  baseUrl: string;
}

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

  const secretKey = environment === 'production'
    ? (process.env.DIMEPAY_SECRET_KEY || process.env.DIMEPAY_SECRET_KEY_PROD || process.env.VITE_DIMEPAY_SECRET_KEY_PROD || process.env.VITE_DIMEPAY_SECRET_KEY || '')
    : (process.env.DIMEPAY_SECRET_KEY || process.env.DIMEPAY_SECRET_KEY_SANDBOX || process.env.VITE_DIMEPAY_SECRET_KEY_SANDBOX || process.env.VITE_DIMEPAY_SECRET_KEY || '');

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
  return signDimePayJwt(payload, secretKey);
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
  const externalBaseUrl = getConfiguredExternalBaseUrl();
  if (externalBaseUrl) {
    return `${externalBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  const normalizedHost = String(host || '').split(':')[0].toLowerCase();

  if (isLocalHost(normalizedHost)) {
    return `https://www.payrolljam.com${path.startsWith('/') ? path : `/${path}`}`;
  }

  return `${proto}://${host}${path}`;
};

const isLocalHost = (host?: string) => {
  const normalized = String(host || '').split(':')[0].toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0' || normalized === '::1';
};

const getConfiguredExternalBaseUrl = () => {
  const raw = (
    process.env.DIMEPAY_PUBLIC_BASE_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.APP_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    process.env.VITE_SITE_URL ||
    process.env.VITE_APP_URL ||
    ''
  ).trim();

  if (!raw) return null;
  return raw.replace(/\/$/, '');
};

export const normalizeDimePayExternalUrl = (req: VercelRequest, url: string | undefined, fallbackPath: string) => {
  if (!url) return buildAbsoluteUrl(req, fallbackPath);

  try {
    const parsed = new URL(url);
    if (isLocalHost(parsed.hostname)) {
      return buildAbsoluteUrl(req, parsed.pathname + parsed.search + parsed.hash);
    }
    return url;
  } catch {
    return buildAbsoluteUrl(req, fallbackPath);
  }
};

export const buildCardReferenceId = (params: {
  companyId: string;
  flow?: string;
  localSubscriptionId?: string;
  dimepaySubscriptionId?: string;
  intentId?: string;
}) => {
  return [
    params.flow || 'card_update',
    params.companyId,
    params.localSubscriptionId || 'none',
    params.dimepaySubscriptionId || 'none',
    params.intentId || 'none',
    Date.now().toString()
  ].join('__');
};

export const parseCardReferenceId = (referenceId?: string) => {
  if (!referenceId) return null;
  const parts = referenceId.split('__');
  const hasFlowPrefix = ['signup', 'card_update', 'subscription_update'].includes(parts[0]);
  const [flow, companyId, localSubscriptionId, dimepaySubscriptionId, intentId] = hasFlowPrefix
    ? parts
    : ['card_update', parts[0], parts[1], parts[2], undefined];
  if (!companyId) return null;

  return {
    flow,
    companyId,
    localSubscriptionId: localSubscriptionId && localSubscriptionId !== 'none' ? localSubscriptionId : undefined,
    dimepaySubscriptionId: dimepaySubscriptionId && dimepaySubscriptionId !== 'none' ? dimepaySubscriptionId : undefined,
    intentId: intentId && intentId !== 'none' ? intentId : undefined
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

export const createDimePayRecurringSubscription = async (params: {
  environment: DimePayEnvironment;
  companyId: string;
  planName: string;
  planType?: string;
  amount: number;
  currency?: string;
  customerId?: string;
  cardToken: string;
  billingFrequency?: string;
  billingCycles?: number;
  metadata?: Record<string, any>;
}) => {
  const overridePath = params.environment === 'production'
    ? process.env.DIMEPAY_SUBSCRIPTION_CREATE_PATH_PROD || process.env.DIMEPAY_SUBSCRIPTION_CREATE_PATH
    : process.env.DIMEPAY_SUBSCRIPTION_CREATE_PATH_SANDBOX || process.env.DIMEPAY_SUBSCRIPTION_CREATE_PATH;

  const candidatePaths = unique([
    overridePath || '',
    '/subscriptions',
    '/subscriptions/create',
    '/subscription/create',
    '/recurring/subscriptions'
  ]);

  const payload = {
    customer_id: params.customerId,
    card_token: params.cardToken,
    payment_method_token: params.cardToken,
    amount: params.amount,
    currency: params.currency || 'JMD',
    recurring: true,
    recurring_frequency: params.billingFrequency || 'monthly',
    frequency: params.billingFrequency || 'monthly',
    billing_cycles: params.billingCycles || 9999,
    description: `${params.planName} recurring subscription`,
    metadata: {
      ...(params.metadata || {}),
      company_id: params.companyId,
      plan_name: params.planName,
      plan_type: params.planType || params.planName.toLowerCase()
    }
  };

  let lastError = 'No DimePay subscription creation endpoint succeeded.';

  for (const path of candidatePaths) {
    try {
      const response = await postSignedDimePayRequest(path, payload, params.environment);

      if (response.ok) {
        return {
          ok: true,
          path,
          data: await response.json().catch(() => null)
        };
      }

      const errorText = await response.text();
      lastError = `POST ${path} failed with ${response.status}: ${errorText}`;

      if (![404, 405].includes(response.status)) {
        return { ok: false, path, error: lastError };
      }
    } catch (error: any) {
      lastError = `POST ${path} failed: ${error.message}`;
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
