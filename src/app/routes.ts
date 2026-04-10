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

export const ROUTE_PATHS: Record<AppRoute, string> = {
  home: '/',
  login: '/login',
  signup: '/signup',
  'verify-email': '/verify-email',
  pricing: '/pricing',
  features: '/features',
  faq: '/faq',
  'contact-us': '/contact-us',
  'privacy-policy': '/privacy-policy',
  'terms-of-service': '/terms-of-service',
  'download-payslip': '/download-payslip',
  'reset-password': '/reset-password',
  dashboard: '/app/dashboard',
  employees: '/app/employees',
  timesheets: '/app/timesheets',
  payrun: '/app/payrun',
  leave: '/app/leave',
  documents: '/app/documents',
  reports: '/app/reports',
  compliance: '/app/compliance',
  'ai-assistant': '/app/ai-assistant',
  settings: '/app/settings',
  profile: '/app/profile',
  onboarding: '/app/onboarding',
  'employee-onboarding': '/portal/onboarding',
  'portal-home': '/portal',
  'portal-timesheets': '/portal/timesheets',
  'portal-leave': '/portal/leave',
  'portal-docs': '/portal/documents',
  'portal-profile': '/portal/profile',
  'sa-overview': '/admin/overview',
  'sa-tenants': '/admin/tenants',
  'sa-pending-payments': '/admin/pending-payments',
  'sa-billing': '/admin/billing',
  'sa-health': '/admin/health',
  'sa-plans': '/admin/plans',
  'sa-users': '/admin/users',
  'sa-logs': '/admin/logs',
  'sa-settings': '/admin/settings',
  'reseller-dashboard': '/partner'
};

const PATH_TO_ROUTE = Object.entries(ROUTE_PATHS).reduce<Record<string, AppRoute>>((acc, [route, path]) => {
  acc[path] = route as AppRoute;
  return acc;
}, {
  '/index.html': 'home'
});

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

export const normalizePathname = (pathname: string | null | undefined): string => {
  if (!pathname || pathname === '/') return '/';

  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/index.html' ? '/' : normalized;
};

export const getPathForRoute = (route: AppRoute): string => ROUTE_PATHS[route];

export const getRouteFromPathname = (pathname: string | null | undefined): AppRoute | null => {
  return PATH_TO_ROUTE[normalizePathname(pathname)] ?? null;
};

export const buildAppUrl = (
  route: AppRoute,
  query?: Record<string, string | undefined>,
  baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://www.payrolljam.com'
): string => {
  const url = new URL(getPathForRoute(route), baseUrl);

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, value);
  });

  return url.toString();
};

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

export const getRouteFromLocation = (
  user: User | null | undefined,
  locationLike?: { pathname?: string; search?: string }
): AppRoute => {
  if (typeof window === 'undefined' && !locationLike) {
    return getDefaultRouteForUser(user);
  }

  const pathname = locationLike?.pathname ?? window.location.pathname;
  const search = locationLike?.search ?? window.location.search;
  const params = new URLSearchParams(search);
  const legacyRoute = parseRoute(params.get('page'));
  const pathnameRoute = getRouteFromPathname(pathname);

  if (normalizePathname(pathname) === '/') {
    return legacyRoute ?? getDefaultRouteForUser(user);
  }

  return pathnameRoute ?? legacyRoute ?? getDefaultRouteForUser(user);
};

export const isPublicRoute = (route: AppRoute) => PUBLIC_ROUTES.includes(route);
