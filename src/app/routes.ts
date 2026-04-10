import { Role, User } from '../core/types';

export const APP_ROUTES = [
  'home',
  'login',
  'signup',
  'verify-email',
  'pricing',
  'features',
  'faq',
  'contact-us',
  'privacy-policy',
  'terms-of-service',
  'download-payslip',
  'reset-password',
  'dashboard',
  'employees',
  'timesheets',
  'payrun',
  'leave',
  'documents',
  'reports',
  'compliance',
  'ai-assistant',
  'settings',
  'profile',
  'onboarding',
  'employee-onboarding',
  'portal-home',
  'portal-timesheets',
  'portal-leave',
  'portal-docs',
  'portal-profile',
  'sa-overview',
  'sa-tenants',
  'sa-pending-payments',
  'sa-billing',
  'sa-health',
  'sa-plans',
  'sa-users',
  'sa-logs',
  'sa-settings',
  'reseller-dashboard'
] as const;

export type AppRoute = typeof APP_ROUTES[number];

export const PUBLIC_ROUTES: AppRoute[] = [
  'home',
  'login',
  'signup',
  'verify-email',
  'pricing',
  'features',
  'faq',
  'contact-us',
  'privacy-policy',
  'terms-of-service',
  'download-payslip',
  'reset-password'
];

export const AUTH_ENTRY_ROUTES: AppRoute[] = ['login', 'signup', 'verify-email'];
export const SUPER_ADMIN_ROUTES: AppRoute[] = [
  'sa-overview',
  'sa-tenants',
  'sa-pending-payments',
  'sa-billing',
  'sa-health',
  'sa-plans',
  'sa-users',
  'sa-logs',
  'sa-settings'
];

export const PORTAL_ROUTES: AppRoute[] = [
  'portal-home',
  'portal-timesheets',
  'portal-leave',
  'portal-docs',
  'portal-profile'
];

export const TRANSIENT_QUERY_KEYS = ['token', 'email', 'type', 'invitation', 'reseller'];

export const isAppRoute = (value: string | null | undefined): value is AppRoute => {
  return !!value && (APP_ROUTES as readonly string[]).includes(value);
};

export const parseRoute = (value: string | null | undefined): AppRoute | null => {
  if (!value) return null;
  const [route] = value.split('?');
  return isAppRoute(route) ? route : null;
};

export const getDefaultRouteForUser = (user: User | null | undefined): AppRoute => {
  if (!user) return 'home';
  if (!user.isOnboarded && user.role === Role.OWNER) return 'onboarding';
  if (!user.isOnboarded && user.role === Role.EMPLOYEE) return 'employee-onboarding';
  if (user.role === Role.EMPLOYEE) return 'portal-home';
  if (user.role === Role.RESELLER) return 'reseller-dashboard';
  if (user.role === Role.SUPER_ADMIN) return 'sa-overview';
  return 'dashboard';
};

export const getRouteFromLocation = (user: User | null | undefined): AppRoute => {
  if (typeof window === 'undefined') {
    return getDefaultRouteForUser(user);
  }

  const params = new URLSearchParams(window.location.search);
  return parseRoute(params.get('page')) ?? getDefaultRouteForUser(user);
};

export const isPublicRoute = (route: AppRoute) => PUBLIC_ROUTES.includes(route);
