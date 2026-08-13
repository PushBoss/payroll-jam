import { describe, expect, it } from 'vitest';
import { isResellerEquivalentPlan, normalizePlanToDatabase, normalizePlanToFrontend } from './planNames';

describe('planNames', () => {
  it('normalizes the Reseller subscription role to the Enterprise plan tier', () => {
    expect(normalizePlanToFrontend('Enterprise')).toBe('Enterprise');
    expect(normalizePlanToFrontend('enterprise')).toBe('Enterprise');
    expect(normalizePlanToFrontend('Reseller')).toBe('Reseller');

    expect(normalizePlanToDatabase('Enterprise')).toBe('Enterprise');
    expect(normalizePlanToDatabase('Reseller')).toBe('Enterprise');

    expect(isResellerEquivalentPlan('Enterprise')).toBe(true);
    expect(isResellerEquivalentPlan('Reseller')).toBe(true);
  });

  it('preserves the legacy Professional database label for Pro', () => {
    expect(normalizePlanToFrontend('Professional')).toBe('Pro');
    expect(normalizePlanToDatabase('Pro')).toBe('Professional');
  });
});
