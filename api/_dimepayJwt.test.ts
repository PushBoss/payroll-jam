import { describe, expect, it } from 'vitest';
import {
  decodeDimePayJwt,
  extractDimePayJwt,
  normalizeDimePayWebhookPayload,
  signDimePayJwt,
  verifyDimePayJwt
} from './_dimepayJwt';

describe('DimePay JWT utilities', () => {
  it('signs and verifies HS256 payloads', () => {
    const token = signDimePayJwt({ type: 'invoice.payment_succeeded', data: { invoice_id: 'inv_1' } }, 'sk_test');

    expect(verifyDimePayJwt(token, 'sk_test')).toEqual({
      type: 'invoice.payment_succeeded',
      data: { invoice_id: 'inv_1' }
    });
  });

  it('rejects tampered payloads', () => {
    const token = signDimePayJwt({ status: 'SUCCESS', token: 'card_123' }, 'sk_test');
    const [header, payload, signature] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ status: 'FAILED', token: 'card_123' }))
      .toString('base64url');

    expect(() => verifyDimePayJwt(`${header}.${tamperedPayload}.${signature}`, 'sk_test'))
      .toThrow('Invalid DimePay JWT signature');
    expect(() => verifyDimePayJwt(token, 'wrong_secret'))
      .toThrow('Invalid DimePay JWT signature');
    expect(() => decodeDimePayJwt(`${header}.${payload}`))
      .toThrow('Malformed DimePay JWT');
  });

  it('extracts tokens from body or authorization headers', () => {
    const token = signDimePayJwt({ ok: true }, 'sk_test');

    expect(extractDimePayJwt({ data: token })).toBe(token);
    expect(extractDimePayJwt({}, { authorization: `Bearer ${token}` })).toBe(token);
  });

  it('normalizes card request success payloads', () => {
    expect(normalizeDimePayWebhookPayload({ status: 'SUCCESS', token: 'card_123' })).toEqual({
      type: 'card_request.succeeded',
      data: { status: 'SUCCESS', token: 'card_123' }
    });
  });
});
