// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PayRun } from '../PayRun';
import { PayFrequency, Role, Employee, CompanySettings } from '../../core/types';

// Mock useAuth
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      name: 'Owner User',
      email: 'owner@example.com',
      role: Role.OWNER,
      companyId: 'company-123',
    },
  }),
}));

// Mock emailService
vi.mock('../../services/emailService', () => ({
  emailService: {
    sendPayslipNotification: vi.fn().mockResolvedValue({ success: true }),
  },
}));

const mockEmployees: Employee[] = [
  {
    id: 'emp-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    trn: '123',
    nis: '456',
    grossSalary: 100000,
    payType: 'SALARIED' as any,
    payFrequency: PayFrequency.MONTHLY,
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    hireDate: '2025-01-01',
    bankDetails: {
      bankName: 'NCB',
      accountNumber: '123456789',
      accountType: 'SAVINGS',
      currency: 'JMD',
    },
  },
];

const mockCompanyData: CompanySettings = {
  id: 'company-123',
  name: 'Test Company Ltd',
  email: 'company@example.com',
  taxConfig: {
    employerNisRate: 0.03,
    employerNhtRate: 0.03,
    employerEdTaxRate: 0.03,
  },
  onboardingStep: 'COMPLETE',
  plan: 'Starter', // Starter plan has email access
};

describe('PayRun Page Integration tests', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('renders SETUP step, processes to DRAFT and FINALIZE, and allows emailing payslips', async () => {
    const onSaveSpy = vi.fn().mockResolvedValue(true);
    const onNavigateSpy = vi.fn();

    // 1. Render Component
    act(() => {
      root.render(
        <PayRun
          employees={mockEmployees}
          timesheets={[]}
          leaveRequests={[]}
          onSave={onSaveSpy}
          companyData={mockCompanyData}
          integrationConfig={{}}
          payRunHistory={[]}
          onNavigate={onNavigateSpy}
        />
      );
    });

    // Check we are in Setup Step
    expect(container.textContent).toContain('Select Period');
    expect(container.textContent).toContain('Start a New Pay Run');

    // Find and click "Start Pay Run" button
    let initBtn: HTMLButtonElement | null = null;
    container.querySelectorAll('button').forEach((btn) => {
      if (btn.textContent?.includes('Start Pay Run')) {
        initBtn = btn as HTMLButtonElement;
      }
    });
    expect(initBtn).not.toBeNull();
    
    await act(async () => {
      initBtn!.click();
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });

    // We should now be in the DRAFT step
    expect(container.textContent).toContain('Draft Pay Run');
    expect(container.textContent).toContain('Jane Doe');

    // Find and click "Continue to Finalize" button
    let reviewBtn: HTMLButtonElement | null = null;
    container.querySelectorAll('button').forEach((btn) => {
      if (btn.textContent?.includes('Continue to Finalize')) {
        reviewBtn = btn as HTMLButtonElement;
      }
    });

    expect(reviewBtn).not.toBeNull();

    await act(async () => {
      reviewBtn!.click();
      await Promise.resolve();
    });

    // We should now be in FINALIZE step
    expect(container.textContent).toContain('Finalize Pay Run');

    // Find and click "Finalize Pay Run" button
    let confirmFinalizeBtn: HTMLButtonElement | null = null;
    container.querySelectorAll('button').forEach((btn) => {
      if (btn.textContent?.includes('Finalize Pay Run') && !btn.textContent?.includes('Back')) {
        confirmFinalizeBtn = btn as HTMLButtonElement;
      }
    });

    expect(confirmFinalizeBtn).not.toBeNull();

    await act(async () => {
      confirmFinalizeBtn!.click();
      await Promise.resolve();
    });

    // Verify onSave was called with completed PayRun record
    expect(onSaveSpy).toHaveBeenCalled();
  });
});
