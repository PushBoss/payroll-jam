/**
 * Recompute PAYE (and the deductions/net pay that flow from it) for a
 * company's finalized pay runs, using the exact live payroll engine
 * (calculateComputedAmounts / getEmployeeYTD / calculatePayrollTotals from
 * src/features/payroll/payrollEngine.ts) — not a re-implementation.
 *
 * Why this is needed: calculatePeriodNumber previously used the calendar
 * month as the cumulative-PAYE period number instead of the count of periods
 * actually run. That silently zeroed PAYE whenever prior periods were
 * missing from the system (fixed in payrollEngine.ts). This script re-derives
 * PAYE for already-finalized runs so historical data reflects the fix,
 * without asking the client to re-run anything.
 *
 * Only grossPay, additions, and deductionsBreakdown are read from each
 * existing line item — they are never modified. Only the statutory fields
 * (nis, nht, edTax, paye, pension, totalDeductions, netPay,
 * employerContributions) are recomputed.
 *
 * Runs are processed in chronological order per company, and each
 * (recomputed) run is fed into the next run's YTD context — exactly mirroring
 * how the live app naturally builds YTD as periods are run in sequence.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/recompute-paye.ts --company=<companyId>
 *
 *   Add --apply to write the changes. Without it, this is a dry run that
 *   only prints a before/after report — nothing is written.
 */

import { createClient } from '@supabase/supabase-js';
import {
  calculateComputedAmounts,
  calculatePayrollTotals,
} from '../src/features/payroll/payrollEngine';
import type { Employee, PayRun, PayRunLineItem, CompanySettings } from '../src/core/types';
import { EmployeeType, PayFrequency } from '../src/core/types';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars before running this script.');
  process.exit(1);
}

const args = process.argv.slice(2);
const companyId = args.find((a) => a.startsWith('--company='))?.split('=')[1];
const apply = args.includes('--apply');

if (!companyId) {
  console.error('Usage: npx tsx scripts/recompute-paye.ts --company=<companyId> [--apply]');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

async function main() {
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name, settings')
    .eq('id', companyId)
    .single();
  if (companyError || !company) throw companyError || new Error('Company not found');

  const companyData = {
    id: company.id,
    name: company.name,
    taxConfig: company.settings?.taxConfig,
    policies: company.settings?.policies,
  } as unknown as CompanySettings;

  const { data: employeeRows, error: empError } = await supabase
    .from('employees')
    .select('id, employee_type, pay_data, pension_contribution_rate')
    .eq('company_id', companyId);
  if (empError) throw empError;

  const employeeById = new Map<string, Employee>();
  for (const row of employeeRows || []) {
    const payData = row.pay_data && typeof row.pay_data === 'object' ? row.pay_data : {};
    employeeById.set(row.id, {
      id: row.id,
      employeeType: (row.employee_type || undefined) as EmployeeType | undefined,
      payFrequency: (payData.payFrequency || 'MONTHLY') as PayFrequency,
      pensionContributionRate: row.pension_contribution_rate || 0,
    } as Employee);
  }

  const { data: runs, error: runsError } = await supabase
    .from('pay_runs')
    .select('id, period_start, period_end, status, line_items')
    .eq('company_id', companyId)
    .eq('status', 'FINALIZED')
    .order('period_start', { ascending: true });
  if (runsError) throw runsError;

  const recomputedHistory: PayRun[] = [];
  const writes: { id: string; line_items: PayRunLineItem[]; total_gross: number; total_net: number }[] = [];
  const report: Record<string, unknown>[] = [];

  for (const run of runs || []) {
    const periodStart = String(run.period_start);
    const year = parseInt(periodStart.slice(0, 4), 10);
    const month = parseInt(periodStart.slice(5, 7), 10);
    const period = { year, month, periodStart, periodEnd: String(run.period_end) };

    const newLineItems: PayRunLineItem[] = (run.line_items || []).map((line: any) => {
      const employee =
        employeeById.get(line.employeeId) ||
        ({ id: line.employeeId, payFrequency: 'MONTHLY', pensionContributionRate: 0 } as Employee);

      const additionsBreakdown =
        line.additionsBreakdown ||
        (line.additions ? [{ id: 'legacy', name: 'Additions', amount: line.additions, isTaxable: true }] : []);

      const computed = calculateComputedAmounts({
        employee,
        grossPay: line.grossPay,
        additionsBreakdown,
        deductionsBreakdown: line.deductionsBreakdown || [],
        period,
        context: {
          timesheets: [],
          leaveRequests: [],
          payRunHistory: recomputedHistory,
          companyData,
        },
      });

      const oldPaye = round2(line.paye);
      const newPaye = round2(computed.paye);
      if (oldPaye !== newPaye) {
        report.push({
          period: periodStart,
          employee: line.employeeName,
          gross: line.grossPay,
          oldPaye,
          newPaye,
          delta: round2(newPaye - oldPaye),
          oldNetPay: round2(line.netPay),
          newNetPay: round2(computed.netPay),
        });
      }

      return {
        ...line,
        nis: computed.nis,
        nht: computed.nht,
        edTax: computed.edTax,
        paye: computed.paye,
        pension: computed.pension,
        totalDeductions: computed.totalDeductions,
        netPay: computed.netPay,
        employerContributions: computed.employerContributions,
      };
    });

    const totals = calculatePayrollTotals(newLineItems);
    writes.push({ id: run.id, line_items: newLineItems, total_gross: totals.gross, total_net: totals.net });

    // Feed the recomputed run into history so the NEXT run's YTD builds on
    // corrected values, exactly like the live app does period-by-period.
    recomputedHistory.push({
      id: run.id,
      periodStart,
      periodEnd: String(run.period_end),
      payDate: '',
      status: 'FINALIZED',
      totalGross: totals.gross,
      totalNet: totals.net,
      lineItems: newLineItems,
    });
  }

  console.log(`\nCompany: ${company.name} (${companyId})`);
  console.log(`Finalized runs scanned: ${runs?.length || 0}`);

  if (report.length === 0) {
    console.log('No PAYE differences found. Nothing to change.');
    return;
  }

  console.table(report);
  console.log(`\n${report.length} line item(s) would change.`);

  if (!apply) {
    console.log('\nDry run only — no changes written. Re-run with --apply to write these changes.');
    return;
  }

  for (const write of writes) {
    const { error } = await supabase
      .from('pay_runs')
      .update({ line_items: write.line_items, total_gross: write.total_gross, total_net: write.total_net })
      .eq('id', write.id);
    if (error) {
      console.error(`Failed to update run ${write.id}:`, error);
    } else {
      console.log(`Updated run ${write.id}`);
    }
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
