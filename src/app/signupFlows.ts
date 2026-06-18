export const SIGNUP_FLOWS = [
  'company_signup',
  'employee_portal',
  'team_member',
  'reseller_client',
  'legacy_user',
] as const;

export type SignupFlow = typeof SIGNUP_FLOWS[number];

const isSignupFlow = (value: string | null): value is SignupFlow =>
  !!value && (SIGNUP_FLOWS as readonly string[]).includes(value);

export const resolveSignupFlow = (params: URLSearchParams): SignupFlow => {
  const explicitFlow = params.get('flow');
  if (isSignupFlow(explicitFlow)) return explicitFlow;

  if (params.get('type') === 'employee') return 'employee_portal';
  if (params.get('reseller') === 'true') return 'reseller_client';
  if (params.get('invitation') === 'true') return 'team_member';
  if (params.get('companyInvite') === 'true') return 'company_signup';
  if (params.get('type') === 'user') return 'legacy_user';
  if (params.get('token') && params.get('email')) return 'legacy_user';

  return 'company_signup';
};

export const isEmployeePortalFlow = (params: URLSearchParams) =>
  resolveSignupFlow(params) === 'employee_portal';

export const isTeamMemberFlow = (params: URLSearchParams) =>
  resolveSignupFlow(params) === 'team_member' || resolveSignupFlow(params) === 'legacy_user';

export const isResellerClientFlow = (params: URLSearchParams) =>
  resolveSignupFlow(params) === 'reseller_client';
