import { describe, it, expect, vi, afterEach } from 'vitest';
import { createEmployeeEditTrace } from './employeeEditTrace';

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}));

const ctx = {
  employeeId: 'emp-abc',
  companyId: 'co-xyz',
  userId: 'usr-123',
  userRole: 'ADMIN',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createEmployeeEditTrace', () => {
  it('generates a correlation ID in the expected format', () => {
    const trace = createEmployeeEditTrace(ctx);
    expect(trace.correlationId).toMatch(/^emp-edit-\d{13}-[a-z0-9]{4}$/);
  });

  it('two traces have different correlation IDs', () => {
    const a = createEmployeeEditTrace(ctx);
    const b = createEmployeeEditTrace(ctx);
    expect(a.correlationId).not.toBe(b.correlationId);
  });

  it('log emits to console in expected format', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const trace = createEmployeeEditTrace(ctx);
    trace.log('action-start', 'start', { employeeId: 'emp-abc' });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[EMP-EDIT emp-edit-\d+-[a-z0-9]{4}\] action-start \| start \|/)
    );
  });

  it('logError captures errorCode and httpStatus but not a raw message', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const trace = createEmployeeEditTrace(ctx);
    const err = { message: 'sensitive detail', code: '42501', status: 403 };
    trace.logError('db-write', err);
    const logged = consoleSpy.mock.calls[0][0] as string;
    expect(logged).toContain('error');
    expect(logged).toContain('42501');
    expect(logged).not.toContain('sensitive detail');
  });

  it('withTrace resolves and logs start then ok', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const trace = createEmployeeEditTrace(ctx);
    const result = await trace.withTrace(Promise.resolve('value'), 'test-step', 5000);
    expect(result).toBe('value');
    const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes('test-step') && c.includes('start'))).toBe(true);
    expect(calls.some((c) => c.includes('test-step') && c.includes('ok'))).toBe(true);
  });

  it('withTrace logs error and re-throws on rejection', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const trace = createEmployeeEditTrace(ctx);
    await expect(
      trace.withTrace(Promise.reject(new Error('boom')), 'fail-step', 5000)
    ).rejects.toThrow('boom');
    const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes('fail-step') && c.includes('error'))).toBe(true);
  });

  it('withTrace logs timeout and re-throws when promise exceeds timeoutMs', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const trace = createEmployeeEditTrace(ctx);
    await expect(
      trace.withTrace(new Promise<string>(() => {}), 'slow-step', 1)
    ).rejects.toThrow();
    const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes('slow-step') && c.includes('timeout'))).toBe(true);
  });
});
