import { PayFrequency, PayRun } from '../core/types';

const DAY_MS = 24 * 60 * 60 * 1000;

const isCompletedRun = (run: PayRun) => run.status === 'FINALIZED' || run.status === 'APPROVED';

export const parsePayrollDate = (value?: string | null): Date | null => {
  if (!value) return null;

  const monthOnly = value.match(/^(\d{4})-(\d{2})$/);
  if (monthOnly) {
    return new Date(Number(monthOnly[1]), Number(monthOnly[2]) - 1, 1);
  }

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addMonthsClamped = (date: Date, months: number) => {
  const targetMonth = date.getMonth() + months;
  const target = new Date(date.getFullYear(), targetMonth, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
};

const normalizePayFrequency = (value?: string | null): PayFrequency => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === PayFrequency.WEEKLY) return PayFrequency.WEEKLY;
  if (normalized === PayFrequency.FORTNIGHTLY) return PayFrequency.FORTNIGHTLY;
  return PayFrequency.MONTHLY;
};

export const getLatestCompletedPayRun = (payRuns: PayRun[]) => {
  const withDates = payRuns
    .filter(isCompletedRun)
    .map((run) => ({
      run,
      sortDate: parsePayrollDate(run.payDate) || parsePayrollDate(run.periodEnd) || parsePayrollDate(run.periodStart),
    }))
    .filter((item): item is { run: PayRun; sortDate: Date } => Boolean(item.sortDate));

  return withDates.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime())[0]?.run;
};

export const getNextPayDateInfo = (
  payRuns: PayRun[],
  companyPayFrequency?: string | null,
  now = new Date(),
) => {
  const latestRun = getLatestCompletedPayRun(payRuns);
  const latestPayDate = parsePayrollDate(latestRun?.payDate);
  const frequency = normalizePayFrequency(latestRun?.payFrequency || companyPayFrequency);

  if (!latestRun || !latestPayDate) {
    return {
      display: 'Not set',
      cycleLabel: `${frequency.charAt(0)}${frequency.slice(1).toLowerCase()} Cycle`,
      date: null,
    };
  }

  const today = startOfLocalDay(now);
  let nextDate = new Date(latestPayDate);

  do {
    if (frequency === PayFrequency.WEEKLY) {
      nextDate = new Date(nextDate.getTime() + 7 * DAY_MS);
    } else if (frequency === PayFrequency.FORTNIGHTLY) {
      nextDate = new Date(nextDate.getTime() + 14 * DAY_MS);
    } else {
      nextDate = addMonthsClamped(nextDate, 1);
    }
  } while (nextDate < today);

  return {
    display: nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    cycleLabel: `${frequency.charAt(0)}${frequency.slice(1).toLowerCase()} Cycle`,
    date: nextDate,
  };
};

export const getS01AlertInfo = (payRuns: PayRun[], now = new Date()) => {
  const latestRun = getLatestCompletedPayRun(payRuns);
  const payrollDate = parsePayrollDate(latestRun?.periodEnd)
    || parsePayrollDate(latestRun?.periodStart)
    || parsePayrollDate(latestRun?.payDate);

  if (!latestRun || !payrollDate) {
    return {
      title: 'S01 Pending',
      message: 'Finalize a pay run to calculate the next statutory remittance deadline.',
      isOverdue: false,
    };
  }

  const dueDate = new Date(payrollDate.getFullYear(), payrollDate.getMonth() + 1, 14);
  const dueDay = startOfLocalDay(dueDate);
  const today = startOfLocalDay(now);
  const daysUntilDue = Math.ceil((dueDay.getTime() - today.getTime()) / DAY_MS);
  const periodLabel = payrollDate.toLocaleDateString('en-US', { month: 'long' });
  const dueLabel = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return {
    title: daysUntilDue < 0 ? 'S01 Overdue' : 'S01 Due',
    message: daysUntilDue < 0
      ? `Monthly statutory remittance (S01) for ${periodLabel} was due on ${dueLabel}.`
      : `Monthly statutory remittance (S01) for ${periodLabel} is due on ${dueLabel}.`,
    isOverdue: daysUntilDue < 0,
  };
};
