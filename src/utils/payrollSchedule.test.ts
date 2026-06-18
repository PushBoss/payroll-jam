import { describe, expect, it } from 'vitest';
import { PayFrequency, PayRun } from '../core/types';
import { getNextPayDateInfo, getS01AlertInfo } from './payrollSchedule';

const baseRun: PayRun = {
  id: 'run-1',
  periodStart: '2026-06',
  periodEnd: '2026-06',
  payDate: '2026-06-15',
  payFrequency: PayFrequency.MONTHLY,
  status: 'FINALIZED',
  totalGross: 100000,
  totalNet: 80000,
  lineItems: [],
};

describe('payrollSchedule', () => {
  it('rolls the next monthly pay date from the latest completed pay run', () => {
    const info = getNextPayDateInfo([baseRun], PayFrequency.MONTHLY, new Date(2026, 5, 18));

    expect(info.display).toBe('Jul 15');
    expect(info.cycleLabel).toBe('Monthly Cycle');
  });

  it('ignores older and draft pay runs when computing the next pay date', () => {
    const info = getNextPayDateInfo([
      { ...baseRun, id: 'old-run', periodStart: '2026-02', periodEnd: '2026-02', payDate: '2026-02-25' },
      { ...baseRun, id: 'draft-run', periodStart: '2026-07', periodEnd: '2026-07', payDate: '2026-07-31', status: 'DRAFT' },
      baseRun,
    ], PayFrequency.MONTHLY, new Date(2026, 5, 18));

    expect(info.display).toBe('Jul 15');
  });

  it('uses the latest payroll period for the S01 compliance alert', () => {
    const alert = getS01AlertInfo([baseRun], new Date(2026, 5, 18));

    expect(alert.title).toBe('S01 Due');
    expect(alert.message).toBe('Monthly statutory remittance (S01) for June is due on Jul 14.');
    expect(alert.isOverdue).toBe(false);
  });

  it('marks S01 as overdue after the due date', () => {
    const alert = getS01AlertInfo([baseRun], new Date(2026, 6, 20));

    expect(alert.title).toBe('S01 Overdue');
    expect(alert.message).toBe('Monthly statutory remittance (S01) for June was due on Jul 14.');
    expect(alert.isOverdue).toBe(true);
  });
});
