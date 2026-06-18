import { describe, expect, it } from 'vitest';
import { resolveSignupFlow } from './signupFlows';

const params = (query: string) => new URLSearchParams(query);

describe('resolveSignupFlow', () => {
  it('prefers explicit flow values', () => {
    expect(resolveSignupFlow(params('flow=employee_portal&type=user'))).toBe('employee_portal');
    expect(resolveSignupFlow(params('flow=team_member&reseller=true'))).toBe('team_member');
    expect(resolveSignupFlow(params('flow=reseller_client&type=employee'))).toBe('reseller_client');
  });

  it('keeps legacy employee and reseller invite links working', () => {
    expect(resolveSignupFlow(params('type=employee&token=t&email=e@example.com'))).toBe('employee_portal');
    expect(resolveSignupFlow(params('reseller=true&token=t&email=e@example.com'))).toBe('reseller_client');
  });

  it('treats old token/email signup links as legacy user invites', () => {
    expect(resolveSignupFlow(params('token=t&email=e@example.com'))).toBe('legacy_user');
    expect(resolveSignupFlow(params('type=user&token=t&email=e@example.com'))).toBe('legacy_user');
  });

  it('defaults ordinary signups to company signup', () => {
    expect(resolveSignupFlow(params(''))).toBe('company_signup');
    expect(resolveSignupFlow(params('plan=Starter'))).toBe('company_signup');
  });
});
