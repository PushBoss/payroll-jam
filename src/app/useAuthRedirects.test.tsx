// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { Role, User } from '../core/types';
import { useAuthRedirects } from './useAuthRedirects';
import { EmployeeService } from '../services/EmployeeService';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../services/CompanyService', () => ({
  CompanyService: {
    acceptResellerInvite: vi.fn(),
  },
}));

vi.mock('../services/EmployeeService', () => ({
  EmployeeService: {
    getEmployeeByToken: vi.fn(),
    getUserByEmail: vi.fn(),
  },
}));

type HookRenderResult = {
  rerender: () => void;
  unmount: () => void;
};

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  role: Role.OWNER,
  isOnboarded: true,
  ...overrides,
});

const renderHook = (hook: () => void): HookRenderResult => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function TestComponent() {
    hook();
    return null;
  }

  act(() => {
    root.render(<TestComponent />);
  });

  return {
    rerender: () => {
      act(() => {
        root.render(<TestComponent />);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
};

describe('useAuthRedirects', () => {
  const navigateTo = vi.fn();
  const logout = vi.fn().mockResolvedValue(undefined);
  const setVerifyEmail = vi.fn();
  const setEmployeeAccountSetup = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
    window.location.hash = '';
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('redirects authenticated users away from auth pages', () => {
    renderHook(() =>
      useAuthRedirects({
        user: makeUser(),
        isLoading: false,
        currentPath: 'login',
        navigateTo,
        logout,
        employees: [],
        isSupabaseMode: false,
        companyData: null,
        setVerifyEmail,
        setEmployeeAccountSetup,
      })
    );

    expect(navigateTo).toHaveBeenCalledWith('dashboard', { replace: true });
  });

  it('sends expired verification flows to verify-email with the recovered email', () => {
    window.history.replaceState({}, '', '/?email=recover@example.com');
    window.location.hash = '#error=access_denied&error_code=otp_expired';

    renderHook(() =>
      useAuthRedirects({
        user: null,
        isLoading: false,
        currentPath: 'signup',
        navigateTo,
        logout,
        employees: [],
        isSupabaseMode: false,
        companyData: null,
        setVerifyEmail,
        setEmployeeAccountSetup,
      })
    );

    expect(setVerifyEmail).toHaveBeenCalledWith('recover@example.com');

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(navigateTo).toHaveBeenCalledWith('verify-email', {
      replace: true,
      query: { email: 'recover@example.com' },
    });
  });

  it('redirects anonymous reseller invite flows to signup with preserved query', () => {
    window.history.replaceState({}, '', '/?token=invite-123&email=client@example.com&reseller=true');

    renderHook(() =>
      useAuthRedirects({
        user: null,
        isLoading: false,
        currentPath: 'home',
        navigateTo,
        logout,
        employees: [],
        isSupabaseMode: false,
        companyData: null,
        setVerifyEmail,
        setEmployeeAccountSetup,
      })
    );

    expect(navigateTo).toHaveBeenCalledWith('signup', {
      query: {
        token: 'invite-123',
        email: 'client@example.com',
        reseller: 'true',
      },
    });
  });

  it('loads employee invite details from the backend when needed', async () => {
    vi.mocked(EmployeeService.getEmployeeByToken).mockResolvedValue({
      employee: {
        id: 'emp-1',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        trn: '123',
        nis: '456',
        status: 'ACTIVE',
        role: Role.EMPLOYEE,
        hireDate: '2026-01-01',
        grossSalary: 100000,
        payType: 'SALARIED',
        payFrequency: 'MONTHLY',
      } as any,
      companyName: 'Payroll Jam Ltd',
      companyId: 'company-1',
    });

    window.history.replaceState({}, '', '/?token=emp-token&email=jane@example.com&type=employee');

    renderHook(() =>
      useAuthRedirects({
        user: null,
        isLoading: false,
        currentPath: 'home',
        navigateTo,
        logout,
        employees: [],
        isSupabaseMode: true,
        companyData: null,
        setVerifyEmail,
        setEmployeeAccountSetup,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(EmployeeService.getEmployeeByToken).toHaveBeenCalledWith('emp-token', 'jane@example.com');
    expect(setEmployeeAccountSetup).toHaveBeenCalledWith({
      employee: expect.objectContaining({ email: 'jane@example.com' }),
      companyName: 'Payroll Jam Ltd',
      companyId: 'company-1',
    });
  });
});
