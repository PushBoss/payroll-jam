import { createHmac, timingSafeEqual } from 'crypto';

const base64url = (source: Buffer | string) => Buffer.from(source)
  .toString('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

const fromBase64url = (source: string) => {
  const normalized = source.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf8');
};

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export const signDimePayJwt = (payload: Record<string, any>, secretKey: string) => {
  if (!secretKey) {
    throw new Error('DimePay secret key is required');
  }

  const encodedHeader = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', secretKey)
    .update(signatureInput)
    .digest();

  return `${signatureInput}.${base64url(signature)}`;
};

export const decodeDimePayJwt = (token: string) => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed DimePay JWT');
  }

  const [encodedHeader, encodedPayload] = parts;
  const header = JSON.parse(fromBase64url(encodedHeader));
  const payload = JSON.parse(fromBase64url(encodedPayload));

  return { header, payload };
};

export const verifyDimePayJwt = (token: string, secretKey: string) => {
  if (!secretKey) {
    throw new Error('DimePay secret key is required');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed DimePay JWT');
  }

  const [encodedHeader, encodedPayload, receivedSignature] = parts;
  const { header, payload } = decodeDimePayJwt(token);

  if (header.alg !== 'HS256') {
    throw new Error(`Unsupported DimePay JWT alg: ${header.alg || 'unknown'}`);
  }

  const expected = createHmac('sha256', secretKey)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  if (!safeEqual(receivedSignature, base64url(expected))) {
    throw new Error('Invalid DimePay JWT signature');
  }

  return payload;
};

export const extractDimePayJwt = (body: any, headers: Record<string, any> = {}) => {
  const authHeader = headers.authorization || headers.Authorization;
  const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : undefined;

  const candidates = [
    body,
    body?.data,
    body?.token,
    body?.jwt,
    body?.payload,
    bearer,
    headers['x-dimepay-jwt'],
    headers['dimepay-jwt']
  ];

  return candidates.find((candidate) => (
    typeof candidate === 'string' && candidate.split('.').length === 3
  ));
};

export const normalizeDimePayWebhookPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') {
    return { type: 'unknown', data: {} };
  }

  if (payload.type && payload.data) {
    return payload;
  }

  const eventType = payload.event_type || payload.event || payload.notification_type;
  if (eventType) {
    return {
      type: eventType,
      data: payload.data || payload
    };
  }

  if (payload.status === 'SUCCESS' && (payload.token || payload.card_token)) {
    return {
      type: 'card_request.succeeded',
      data: payload
    };
  }

  return {
    type: payload.type || 'unknown',
    data: payload.data || payload
  };
};

