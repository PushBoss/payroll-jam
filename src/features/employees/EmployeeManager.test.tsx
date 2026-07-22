// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeeManager } from './EmployeeManager';
import { Employee, EmployeeType, PayFrequency, PayType, Role } from '../../core/types';

const incompleteEmployee: Employee = {
  id: 'employee-existing',
  firstName: 'Alex',
  lastName: 'Brown',
  email: 'alex@example.com',
  trn: '',
  nis: '',
  employeeId: 'EMP-001',
  grossSalary: 75000,
  payType: PayType.SALARIED,
  payFrequency: PayFrequency.MONTHLY,
  role: Role.EMPLOYEE,
  status: 'ACTIVE',
  hireDate: '2026-01-01',
  joiningDate: '2026-01-01',
  employeeType: EmployeeType.STAFF,
  jobTitle: 'Analyst',
  department: 'Finance',
  phone: '',
  address: '',
  emergencyContact: '',
  pensionContributionRate: 0,
  pensionProvider: '',
  bankDetails: {
    bankName: 'NCB',
    accountName: 'Alex Brown',
    accountNumber: '',
    accountType: 'SAVINGS',
    currency: 'JMD',
  },
  customDeductions: [],
  allowances: [],
  deductions: [],
};

describe('EmployeeManager validation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('blocks edits with missing statutory and banking requirements and marks both tabs', async () => {
    const onSave = vi.fn();

    await act(async () => {
      root.render(
        <EmployeeManager
          employee={incompleteEmployee}
          isOpen
          onClose={vi.fn()}
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      const saveButton = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Save Employee'));
      saveButton?.click();
    });

    expect(onSave).not.toHaveBeenCalled();
    expect([...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Banking'))?.getAttribute('aria-invalid')).toBe('true');
    expect([...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Statutory'))?.getAttribute('aria-invalid')).toBe('true');
    expect(container.textContent).toContain('Account number is required');
  });
});
