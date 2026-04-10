import { afterEach, describe, expect, it } from 'vitest';
import { Role, User } from '../core/types';
import { getDefaultRouteForUser, getRouteFromLocation, getRouteFromPathname, isPublicRoute, parseRoute } from './routes';

const originalWindow = globalThis.window;

const setMockWindowSearch = (search: string) => {
  (globalThis as any).window = {
    location: {
      pathname: '/',
      search,
    },
    history: {
      replaceState: () => undefined,
    },
  };
};

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  role: Role.OWNER,
  isOnboarded: true,
  ...overrides,
});

describe('app routes', () => {
  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  it('parses only supported routes', () => {
    expect(parseRoute('dashboard')).toBe('dashboard');
    expect(parseRoute('pricing?plan=starter')).toBe('pricing');
    expect(parseRoute('missing-route')).toBeNull();
    expect(parseRoute(undefined)).toBeNull();
  });

  it('computes the default route for each user type', () => {
    expect(getDefaultRouteForUser(null)).toBe('home');
    expect(getDefaultRouteForUser(makeUser({ isOnboarded: false, role: Role.OWNER }))).toBe('onboarding');
    expect(getDefaultRouteForUser(makeUser({ isOnboarded: false, role: Role.EMPLOYEE }))).toBe('employee-onboarding');
    expect(getDefaultRouteForUser(makeUser({ role: Role.EMPLOYEE }))).toBe('portal-home');
    expect(getDefaultRouteForUser(makeUser({ role: Role.RESELLER }))).toBe('reseller-dashboard');
    expect(getDefaultRouteForUser(makeUser({ role: Role.SUPER_ADMIN }))).toBe('sa-overview');
    expect(getDefaultRouteForUser(makeUser())).toBe('dashboard');
  });

  it('reads the route from the page query parameter and falls back when invalid', () => {
    setMockWindowSearch('?page=reports');
    expect(getRouteFromLocation(makeUser())).toBe('reports');

    setMockWindowSearch('?page=not-real');
    expect(getRouteFromLocation(makeUser({ role: Role.EMPLOYEE }))).toBe('portal-home');
  });

  it('maps canonical pathnames back to app routes', () => {
    expect(getRouteFromPathname('/app/reports')).toBe('reports');
    expect(getRouteFromPathname('/portal')).toBe('portal-home');
    expect(getRouteFromPathname('/admin/users')).toBe('sa-users');
    expect(getRouteFromPathname('/missing')).toBeNull();
  });

  it('identifies public routes correctly', () => {
    expect(isPublicRoute('home')).toBe(true);
    expect(isPublicRoute('reset-password')).toBe(true);
    expect(isPublicRoute('dashboard')).toBe(false);
  });
});
