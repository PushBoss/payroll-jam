// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Reports } from '../Reports';
import { PayRun, CompanySettings, Employee, Role, PayFrequency } from '../../core/types';
import { emailService } from '../../services/emailService';

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

// Mock export helpers so we don't trigger downloads/file generation
vi.mock('../../utils/exportHelpers', () => ({
  generateFullRegisterCSV: vi.fn(),
  generateS01CSV: vi.fn(),
  generateS02CSV: vi.fn(),
  generateNCBFile: vi.fn(),
  generateBNSFile: vi.fn(),
  generateGLCSV: vi.fn(),
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
  {
    id: 'emp-2',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@example.com',
    trn: '789',
    nis: '101112',
    grossSalary: 120000,
    payType: 'SALARIED' as any,
    payFrequency: PayFrequency.MONTHLY,
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    hireDate: '2025-01-01',
    bankDetails: {
      bankName: 'BNS',
      accountNumber: '987654321',
      accountType: 'SAVINGS',
      currency: 'JMD',
    },
  },
];

const mockHistory: PayRun[] = [
  {
    id: 'run-1',
    periodStart: '2026-04',
    periodEnd: '2026-04',
    payDate: '2026-04-30',
    status: 'FINALIZED',
    totalGross: 220000,
    totalNet: 170000,
    lineItems: [
      {
        employeeId: 'emp-1',
        employeeName: 'Jane Doe',
        grossPay: 100000,
        nis: 5000,
        nht: 3000,
        paye: 12000,
        edTax: 0,
        pension: 0,
        additions: 0,
        deductions: 0,
        totalDeductions: 20000,
        netPay: 80000,
      },
      {
        employeeId: 'emp-2',
        employeeName: 'John Smith',
        grossPay: 120000,
        nis: 6000,
        nht: 4000,
        paye: 20000,
        edTax: 0,
        pension: 0,
        additions: 0,
        deductions: 0,
        totalDeductions: 30000,
        netPay: 90000,
      },
    ],
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
  plan: 'Starter', // Starter plan now has email portal access!
};

describe('Reports page E2E Integration tests', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(window, 'print', { value: vi.fn(), writable: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders reports list, opens register detail, and allows individual emailing of payslips', async () => {
    // 1. Render Reports Component
    act(() => {
      root.render(
        <Reports
          history={mockHistory}
          companyData={mockCompanyData}
          employees={mockEmployees}
          integrationConfig={{}}
        />
      );
    });

    // Verify history page title / table is rendered
    const viewButtons = container.querySelectorAll('button');
    let viewDetailBtn: HTMLButtonElement | null = null;
    viewButtons.forEach((btn) => {
      if (btn.textContent === 'View Details') {
        viewDetailBtn = btn as HTMLButtonElement;
      }
    });

    expect(viewDetailBtn).not.toBeNull();

    // 2. Click "View Details" to open the detail modal
    await act(async () => {
      viewDetailBtn!.click();
      await Promise.resolve();
    });

    // Verify modal is open and shows "Email All" button
    const modalButtons = container.querySelectorAll('button');
    let emailAllBtn: HTMLButtonElement | null = null;
    modalButtons.forEach((btn) => {
      if (btn.textContent?.includes('Email All')) {
        emailAllBtn = btn as HTMLButtonElement;
      }
    });

    expect(emailAllBtn).not.toBeNull();

    // Verify "Email Slip" buttons are present in the table
    const emailSlipBtns: HTMLButtonElement[] = [];
    container.querySelectorAll('button').forEach((btn) => {
      if (btn.textContent === 'Email Slip') {
        emailSlipBtns.push(btn as HTMLButtonElement);
      }
    });

    expect(emailSlipBtns.length).toBe(2);

    // 3. Click the first individual "Email Slip" button
    await act(async () => {
      emailSlipBtns[0].click();
      await Promise.resolve();
    });

    // Assert that emailService.sendPayslipNotification was called with first employee data
    expect(emailService.sendPayslipNotification).toHaveBeenCalledWith(
      'jane@example.com',
      'Jane',
      '2026-04',
      '$80,000',
      true,
      ''
    );
  });

  it('allows bulk emailing of payslips via "Email All" button', async () => {
    // Mock confirmation dialog window.confirm to return true
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    act(() => {
      root.render(
        <Reports
          history={mockHistory}
          companyData={mockCompanyData}
          employees={mockEmployees}
          integrationConfig={{}}
        />
      );
    });

    // Click "View Details" to open the modal
    const viewButtons = container.querySelectorAll('button');
    let viewDetailBtn: HTMLButtonElement | null = null;
    viewButtons.forEach((btn) => {
      if (btn.textContent === 'View Details') {
        viewDetailBtn = btn as HTMLButtonElement;
      }
    });
    await act(async () => {
      viewDetailBtn!.click();
      await Promise.resolve();
    });

    // Find "Email All" button
    let emailAllBtn: HTMLButtonElement | null = null;
    container.querySelectorAll('button').forEach((btn) => {
      if (btn.textContent?.includes('Email All')) {
        emailAllBtn = btn as HTMLButtonElement;
      }
    });

    // Click "Email All" button
    await act(async () => {
      emailAllBtn!.click();
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalled();
    // Verify it called email notification for both employees
    expect(emailService.sendPayslipNotification).toHaveBeenCalledTimes(2);
    expect(emailService.sendPayslipNotification).toHaveBeenNthCalledWith(
      1,
      'jane@example.com',
      'Jane',
      '2026-04',
      '$80,000',
      true,
      ''
    );
    expect(emailService.sendPayslipNotification).toHaveBeenNthCalledWith(
      2,
      'john@example.com',
      'John',
      '2026-04',
      '$90,000',
      true,
      ''
    );
  });

  it('renders every register payslip in one bulk print view with page-separated payslips', async () => {
    const summaryHistory: PayRun[] = mockHistory.map((run) => ({
      ...run,
      lineItems: [],
    }));
    const loadFullPayRunHistory = vi.fn().mockResolvedValue(mockHistory);

    act(() => {
      root.render(
        <Reports
          history={summaryHistory}
          companyData={mockCompanyData}
          employees={mockEmployees}
          integrationConfig={{}}
          onLoadFullPayRunHistory={loadFullPayRunHistory}
        />
      );
    });

    let viewDetailBtn: HTMLButtonElement | null = null;
    container.querySelectorAll('button').forEach((btn) => {
      if (btn.textContent === 'View Details') {
        viewDetailBtn = btn as HTMLButtonElement;
      }
    });

    await act(async () => {
      viewDetailBtn!.click();
      await Promise.resolve();
    });

    let printRegisterBtn: HTMLButtonElement | null = null;
    container.querySelectorAll('button').forEach((btn) => {
      if (btn.textContent?.includes('Print Register')) {
        printRegisterBtn = btn as HTMLButtonElement;
      }
    });

    expect(printRegisterBtn).not.toBeNull();

    await act(async () => {
      printRegisterBtn!.click();
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    });

    expect(loadFullPayRunHistory).toHaveBeenCalled();
    expect(container.textContent).toContain('Bulk Payslip Print');
    const printPages = container.querySelectorAll('.payslip-print-page');
    expect(printPages).toHaveLength(2);
    expect(printPages[0].classList.contains('payslip-print-page-last')).toBe(false);
    expect(printPages[1].classList.contains('payslip-print-page-last')).toBe(true);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('keeps view details available while payslip details are loading', async () => {
    act(() => {
      root.render(
        <Reports
          history={mockHistory}
          companyData={mockCompanyData}
          employees={mockEmployees}
          integrationConfig={{}}
          payRunDetailsLoading={true}
        />
      );
    });

    let viewDetailBtn: HTMLButtonElement | null = null;
    container.querySelectorAll('button').forEach((btn) => {
      if (btn.textContent === 'View Details') {
        viewDetailBtn = btn as HTMLButtonElement;
      }
    });

    expect(viewDetailBtn).not.toBeNull();
    expect(viewDetailBtn!.disabled).toBe(false);
  });

  it('keeps loaded register payslips visible when refreshed history only has summary data', async () => {
    act(() => {
      root.render(
        <Reports
          history={mockHistory}
          companyData={mockCompanyData}
          employees={mockEmployees}
          integrationConfig={{}}
        />
      );
    });

    let viewDetailBtn: HTMLButtonElement | null = null;
    container.querySelectorAll('button').forEach((btn) => {
      if (btn.textContent === 'View Details') {
        viewDetailBtn = btn as HTMLButtonElement;
      }
    });

    await act(async () => {
      viewDetailBtn!.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Jane Doe');
    expect(container.textContent).toContain('John Smith');

    const summaryHistory: PayRun[] = mockHistory.map((run) => ({
      ...run,
      lineItems: [],
    }));

    act(() => {
      root.render(
        <Reports
          history={summaryHistory}
          companyData={mockCompanyData}
          employees={mockEmployees}
          integrationConfig={{}}
        />
      );
    });

    expect(container.textContent).toContain('Jane Doe');
    expect(container.textContent).toContain('John Smith');
    expect(container.textContent).not.toContain('No line item details available');
  });
});
