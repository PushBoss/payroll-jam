import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanySettings, Employee, Role, User } from '../core/types';
import { createAppFlowHandlers } from './appFlowHandlers';

vi.mock('../services/storage', () => ({
  storage: {
    saveCompanyData: vi.fn(),
  },
}));

vi.mock('../services/CompanyService', () => ({
  CompanyService: {
    saveCompany: vi.fn(),
  },
}));

vi.mock('../services/EmployeeService', () => ({
  EmployeeService: {
    saveEmployee: vi.fn(),
  },
}));

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  role: Role.OWNER,
  isOnboarded: true,
  companyId: '550e8400-e29b-41d4-a716-446655440000',
  ...overrides,
});

const makeCompany = (overrides: Partial<CompanySettings> = {}): CompanySettings => ({
  name: 'Payroll Jam',
  trn: '123',
  address: 'Kingston',
  phone: '876-000-0000',
  bankName: 'NCB',
  accountNumber: '12345',
  branchCode: '001',
  plan: 'Starter' as any,
  subscriptionStatus: 'ACTIVE' as any,
  ...overrides,
});

const makeEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  id: 'emp-1',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  trn: '123',
  nis: '456',
  status: 'ACTIVE' as any,
  role: Role.EMPLOYEE,
  hireDate: '2026-01-01',
  grossSalary: 100000,
  payType: 'SALARIED' as any,
  payFrequency: 'MONTHLY' as any,
  ...overrides,
});

describe('appFlowHandlers', () => {
  const navigateTo = vi.fn();
  const updateUser = vi.fn();
  const impersonate = vi.fn();
  const setCompanyData = vi.fn();
  const setEmployees = vi.fn();
  const setSelectedPlan = vi.fn();
  const setSelectedCycle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes users after login based on role and onboarding state', () => {
    const handlers = createAppFlowHandlers({
      user: makeUser(),
      companyData: makeCompany(),
      isSupabaseMode: true,
      navigateTo,
      updateUser,
      impersonate,
      setCompanyData,
      setEmployees,
      setSelectedPlan,
      setSelectedCycle,
    });

    handlers.onLoginSuccess(makeUser({ role: Role.EMPLOYEE }));
    handlers.onLoginSuccess(makeUser({ role: Role.RESELLER }));
    handlers.onLoginSuccess(makeUser({ role: Role.OWNER, isOnboarded: false }));

    expect(navigateTo).toHaveBeenNthCalledWith(1, 'portal-home');
    expect(navigateTo).toHaveBeenNthCalledWith(2, 'reseller-dashboard');
    expect(navigateTo).toHaveBeenNthCalledWith(3, 'onboarding');
  });

  it('opens signup with selected plan and cycle', () => {
    const handlers = createAppFlowHandlers({
      user: makeUser(),
      companyData: makeCompany(),
      isSupabaseMode: false,
      navigateTo,
      updateUser,
      impersonate,
      setCompanyData,
      setEmployees,
      setSelectedPlan,
      setSelectedCycle,
    });

    handlers.openSignup('Professional', 'annual');

    expect(setSelectedPlan).toHaveBeenCalledWith('Professional');
    expect(setSelectedCycle).toHaveBeenCalledWith('annual');
    expect(navigateTo).toHaveBeenCalledWith('signup');
  });

  it('updates local company name during impersonation in offline mode', () => {
    const handlers = createAppFlowHandlers({
      user: makeUser(),
      companyData: makeCompany({ name: 'Original Co' }),
      isSupabaseMode: false,
      navigateTo,
      updateUser,
      impersonate,
      setCompanyData,
      setEmployees,
      setSelectedPlan,
      setSelectedCycle,
    });

    handlers.handleImpersonation({
      id: 'client-1',
      companyName: 'Client Co',
      contactName: 'Owner',
      email: 'client@example.com',
      plan: 'Starter' as any,
      employeeCount: 10,
      status: 'ACTIVE' as any,
      mrr: 0,
    });

    expect(impersonate).toHaveBeenCalled();
    expect(setCompanyData).toHaveBeenCalledWith(expect.objectContaining({ name: 'Client Co' }));
    expect(navigateTo).toHaveBeenCalledWith('dashboard');
  });

  it('preserves the signup plan when company onboarding completes', async () => {
    const handlers = createAppFlowHandlers({
      user: makeUser(),
      companyData: makeCompany({ plan: 'Pro' as any }),
      isSupabaseMode: false,
      navigateTo,
      updateUser,
      impersonate,
      setCompanyData,
      setEmployees,
      setSelectedPlan,
      setSelectedCycle,
    });

    await handlers.handleCompanyOnboardComplete(makeCompany({ plan: 'Free' as any }), [makeEmployee()]);

    expect(setCompanyData).toHaveBeenCalledWith(expect.objectContaining({ plan: 'Pro' }));
    expect(setEmployees).toHaveBeenCalled();
    expect(updateUser).toHaveBeenCalledWith({ isOnboarded: true });
    expect(navigateTo).toHaveBeenCalledWith('dashboard');
  });
});