import { describe, expect, it } from 'vitest';
import { CompanySettings, Employee, PayFrequency, PayRunLineItem, PayType, Role } from '../core/types';
import { createPayslipPdfAttachment } from './payslipPdf';

const companyData: CompanySettings = {
  name: 'Payroll Jam Test',
  trn: '123456789',
  address: 'Kingston',
  phone: '876-000-0000',
  bankName: 'NCB',
  accountNumber: '1234567890',
  branchCode: '001',
};

const employee: Employee = {
  id: 'emp-1',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  trn: '123-456-789',
  nis: 'A-123-456',
  grossSalary: 200000,
  payType: PayType.SALARIED,
  payFrequency: PayFrequency.MONTHLY,
  role: Role.EMPLOYEE,
  status: 'ACTIVE',
  hireDate: '2026-01-01',
};

const lineItem: PayRunLineItem = {
  employeeId: 'emp-1',
  employeeName: 'Jane Doe',
  employeeCustomId: 'EMP-001',
  grossPay: 200000,
  additions: 10000,
  deductions: 2500,
  nis: 6000,
  nht: 4000,
  edTax: 4275,
  paye: 13081.33,
  pension: 0,
  totalDeductions: 29856.33,
  netPay: 180143.67,
  trn: '123-456-789',
  nisId: 'A-123-456',
  jobTitle: 'Analyst',
};

describe('createPayslipPdfAttachment', () => {
  it('creates a base64 PDF attachment and strips TRN/NIS hyphens', () => {
    const attachment = createPayslipPdfAttachment({
      lineItem,
      employee,
      companyData,
      payPeriod: '2026-04',
      payDate: '2026-04-30',
    });

    const decoded = Buffer.from(attachment.content, 'base64').toString('utf8');

    expect(attachment.name).toBe('Payslip_Jane_Doe_2026-04.pdf');
    expect(decoded.startsWith('%PDF-1.4')).toBe(true);
    expect(decoded).toContain('TRN: 123456789');
    expect(decoded).toContain('NIS: A123456');
    expect(decoded).not.toContain('123-456-789');
    expect(decoded).not.toContain('A-123-456');
  });
});
