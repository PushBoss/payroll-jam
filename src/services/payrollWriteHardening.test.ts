import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayFrequency, PayType, Role, type AuditLogEntry, type Employee, type PayRun } from '../core/types';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('./supabaseClient', () => ({
  supabase: {
    functions: {
      invoke,
    },
  },
}));

import { AuditService } from './AuditService';
import { EmployeeService } from './EmployeeService';
import { PayrollService } from './PayrollService';

const companyId = '550e8400-e29b-41d4-a716-446655440000';

const makePayRun = (overrides: Partial<PayRun> = {}): PayRun => ({
  id: 'run-1',
  periodStart: '2026-04',
  periodEnd: '2026-04',
  payDate: '2026-04-30',
  payFrequency: PayFrequency.MONTHLY,
  status: 'DRAFT',
  totalGross: 100000,
  totalNet: 80000,
  lineItems: [],
  ...overrides,
});

const makeEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  id: 'emp-1',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  trn: '123',
  nis: '456',
  grossSalary: 100000,
  payType: PayType.SALARIED,
  payFrequency: PayFrequency.MONTHLY,
  role: Role.EMPLOYEE,
  status: 'ACTIVE',
  hireDate: '2026-01-01',
  ...overrides,
});

const makeAuditLog = (overrides: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: '2f8563d6-5b49-4874-9ced-a8691c10a87f',
  timestamp: '2026-04-24T12:00:00.000Z',
  actorId: '30d6dcf9-a58d-40ab-afef-d0f2b9305a94',
  actorName: 'Owner User',
  action: 'CREATE',
  entity: 'PayRun',
  description: 'Created pay run',
  ipAddress: '127.0.0.1',
  ...overrides,
});

describe('payroll write hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoke.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('saves pay runs through admin-handler with normalized dates', async () => {
    await PayrollService.savePayRun(makePayRun(), companyId);

    expect(invoke).toHaveBeenCalledWith('admin-handler', {
      body: {
        action: 'save-pay-run',
        payload: {
          companyId,
          payRun: expect.objectContaining({
            id: 'run-1',
            period_start: '2026-04-01',
            period_end: '2026-04-30',
            pay_date: '2026-04-30',
            pay_frequency: PayFrequency.MONTHLY,
            status: 'DRAFT',
            total_gross: 100000,
            total_net: 80000,
            employee_count: 0,
            line_items: [],
          }),
        },
      },
    });
  });

  it('deletes pay runs through admin-handler', async () => {
    const deleted = await PayrollService.deletePayRun('run-1', companyId);

    expect(deleted).toBe(true);
    expect(invoke).toHaveBeenCalledWith('admin-handler', {
      body: {
        action: 'delete-pay-run',
        payload: {
          companyId,
          runId: 'run-1',
        },
      },
    });
  });

  it('saves audit logs through admin-handler', async () => {
    await AuditService.saveAuditLog(makeAuditLog(), companyId);

    expect(invoke).toHaveBeenCalledWith('admin-handler', {
      body: {
        action: 'save-audit-log',
        payload: {
          companyId,
          log: {
            id: '2f8563d6-5b49-4874-9ced-a8691c10a87f',
            actor_name: 'Owner User',
            action: 'CREATE',
            entity: 'PayRun',
            description: 'Created pay run',
            timestamp: '2026-04-24T12:00:00.000Z',
            ip_address: '127.0.0.1',
            company_id: companyId,
            actor_id: '30d6dcf9-a58d-40ab-afef-d0f2b9305a94',
          },
        },
      },
    });
  });

  it('uses admin-handler for payrun-scoped employee updates when requested', async () => {
    const employee = makeEmployee({
      customDeductions: [
        { id: 'ded-1', name: 'Loan', amount: 1000, periodType: 'FIXED_TERM', remainingTerm: 2 },
      ],
    });

    await EmployeeService.saveEmployee(employee, companyId, 'update', { useAdminHandler: true });

    expect(invoke).toHaveBeenCalledWith('admin-handler', {
      body: {
        action: 'save-employee-for-company',
        payload: {
          companyId,
          employee,
          mode: 'update',
        },
      },
    });
  });
});
