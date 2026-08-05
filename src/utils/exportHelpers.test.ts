import { describe, expect, it } from 'vitest';
import { Employee, PayFrequency, PayRunLineItem, Role } from '../core/types';
import { resolveStatutoryIdentity } from './exportHelpers';

const employee: Employee = {
  id: 'db-employee-id',
  employeeId: 'EMP-100',
  firstName: 'Alicia',
  lastName: 'Brown',
  email: 'alicia@example.com',
  trn: '123456789',
  nis: 'NIS-100',
  grossSalary: 100000,
  payType: 'SALARIED' as any,
  payFrequency: PayFrequency.MONTHLY,
  role: Role.EMPLOYEE,
  status: 'ACTIVE',
  hireDate: '2026-01-01',
};

const line: PayRunLineItem = {
  employeeId: 'legacy-run-employee-id',
  employeeCustomId: 'EMP-100',
  employeeName: 'Alicia Brown',
  grossPay: 100000,
  additions: 0,
  deductions: 0,
  nis: 1000,
  nht: 0,
  edTax: 0,
  paye: 0,
  pension: 0,
  totalDeductions: 1000,
  netPay: 99000,
};

describe('resolveStatutoryIdentity', () => {
  it('uses the payroll snapshot before current employee data', () => {
    expect(resolveStatutoryIdentity({ ...line, trn: '111111111', nisId: 'NIS-SNAPSHOT' }, [employee])).toMatchObject({
      trn: '111111111',
      nisId: 'NIS-SNAPSHOT',
    });
  });

  it('recovers legacy payroll lines through the unique custom employee number', () => {
    expect(resolveStatutoryIdentity(line, [employee])).toMatchObject({
      employee,
      trn: '123456789',
      nisId: 'NIS-100',
    });
  });

  it('does not use an ambiguous custom employee-number match', () => {
    const duplicate = { ...employee, id: 'db-employee-id-2' };
    expect(resolveStatutoryIdentity(line, [employee, duplicate])).toMatchObject({
      employee: undefined,
      trn: '',
      nisId: '',
    });
  });
});
