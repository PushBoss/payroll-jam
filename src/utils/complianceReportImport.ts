import Papa from 'papaparse';
import { ComplianceReportType } from '../services/ComplianceReportService';
import { TAX_CONSTANTS } from '../core/taxUtils';
import { roundJMD } from './moneyUtils';
import { EmployerContributions, PayRun, PayRunLineItem } from '../core/types';

export interface ParsedComplianceReport {
  reportType: ComplianceReportType;
  records: Record<string, unknown>[];
}

const cellText = (value: unknown) => String(value ?? '').trim();

export const parseComplianceReport = async (file: File): Promise<ParsedComplianceReport> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  let rows: unknown[][];
  if (extension === 'csv') {
    const parsed = Papa.parse<unknown[]>(await file.text(), { skipEmptyLines: true });
    rows = parsed.data;
  } else if (extension === 'xlsx') {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('The report has no worksheet.');
    rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map((value: unknown) => value ?? ''));
    });
  } else {
    throw new Error('Upload the exported .xlsx S01 Schedule A or the accepted .csv S02 annual return.');
  }
  const headerIndex = rows.findIndex((row) => cellText(row[0]) === 'Surname' || cellText(row[0]) === 'Employee Name');
  if (headerIndex < 0) {
    throw new Error('This is not a recognised TAJ S01 Schedule A or S02 annual return file.');
  }

  const headers = rows[headerIndex].map(cellText);
  const reportType: ComplianceReportType = headers[0] === 'Surname' ? 'S01' : 'S02';
  const requiredHeaders = reportType === 'S01'
    ? ['Surname', 'Firstname', 'Employee TRN', 'Employee NIS']
    : ['Employee Name', 'TRN', 'NIS Number', 'Total Gross'];
  if (!requiredHeaders.every((header) => headers.includes(header))) {
    throw new Error(`The ${reportType} columns do not match the accepted TAJ format.`);
  }

  const records = rows.slice(headerIndex + 1)
    .filter((row) => row.some((value) => cellText(value) !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
  if (records.length === 0) throw new Error('The report does not contain any employee rows.');
  if (records.length > 10000) throw new Error('A report may contain at most 10,000 employee rows.');

  return { reportType, records };
};

// ─── Reconstitution: parsed records → employees + finalized pay run ──────────

// One extracted employee row with the statutory figures split into
// employee-side and employer-side (S02 has them explicitly; S01 combines
// employee+employer in one column, so we split by the known rate weights).
export interface ComplianceImportRow {
  sourceIndex: number;
  firstName: string;
  lastName: string;
  trn: string;
  nis: string;
  gross: number;
  // employee-side (appears on the payslip line item)
  nisEmployee: number;
  nhtEmployee: number;
  edTaxEmployee: number;
  paye: number;
  // employer-side (employerContributions)
  nisEmployer: number;
  nhtEmployer: number;
  edTaxEmployer: number;
  heartEmployer: number;
}

// Collapse all internal whitespace/newlines so the multi-line S01 Schedule A
// headers can be matched by a stable normalized prefix.
const normalizeKey = (key: string) => key.replace(/\s+/g, ' ').trim();

const parseAmount = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '').replace(/[$,\s]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

// Find a record value whose (normalized) header key starts with the given
// prefix. Longer/more specific prefixes should be tried first by the caller.
const pick = (record: Record<string, unknown>, prefix: string): unknown => {
  const target = normalizeKey(prefix).toLowerCase();
  for (const [key, value] of Object.entries(record)) {
    if (normalizeKey(key).toLowerCase().startsWith(target)) return value;
  }
  return undefined;
};

const splitByRate = (combined: number, employeeRate: number, employerRate: number) => {
  const total = employeeRate + employerRate;
  if (total <= 0) return { employee: 0, employer: 0 };
  return {
    employee: roundJMD(combined * (employeeRate / total)),
    employer: roundJMD(combined * (employerRate / total)),
  };
};

const splitFullName = (fullName: string): { firstName: string; lastName: string } => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

export const mapComplianceRecords = (parsed: ParsedComplianceReport): ComplianceImportRow[] => {
  return parsed.records.map((record, sourceIndex) => {
    if (parsed.reportType === 'S02') {
      const { firstName, lastName } = splitFullName(cellText(pick(record, 'Employee Name')));
      const gross = parseAmount(pick(record, 'Total Gross'));
      return {
        sourceIndex,
        firstName,
        lastName,
        trn: cellText(pick(record, 'TRN')),
        nis: cellText(pick(record, 'NIS Number')),
        gross,
        nisEmployee: parseAmount(pick(record, 'Employee NIS')),
        nhtEmployee: parseAmount(pick(record, 'Employee NHT')),
        edTaxEmployee: parseAmount(pick(record, 'Employee EdTax')),
        paye: parseAmount(pick(record, 'PAYE')),
        nisEmployer: parseAmount(pick(record, 'Employer NIS')),
        nhtEmployer: parseAmount(pick(record, 'Employer NHT')),
        edTaxEmployer: parseAmount(pick(record, 'Employer EdTax')),
        heartEmployer: parseAmount(pick(record, 'HEART')),
      };
    }

    // S01: NIS / NHT / Education Tax columns are combined (employee + employer
    // rate) x gross; PAYE is employee-only; HEART is not on the S01 so derive it.
    const grossCash = parseAmount(pick(record, 'Gross Emoluments Received in Cash'));
    const grossInKind = parseAmount(pick(record, 'Gross Emoluments Received in Kind'));
    const gross = grossCash + grossInKind;
    const nisSplit = splitByRate(parseAmount(pick(record, 'NIS')), TAX_CONSTANTS.NIS_RATE_EMPLOYEE, TAX_CONSTANTS.NIS_RATE_EMPLOYER);
    const nhtSplit = splitByRate(parseAmount(pick(record, 'NHT')), TAX_CONSTANTS.NHT_RATE_EMPLOYEE, TAX_CONSTANTS.NHT_RATE_EMPLOYER);
    const edTaxSplit = splitByRate(parseAmount(pick(record, 'Education Tax')), TAX_CONSTANTS.ED_TAX_RATE, TAX_CONSTANTS.ED_TAX_RATE_EMPLOYER);

    return {
      sourceIndex,
      firstName: cellText(pick(record, 'Firstname')),
      lastName: cellText(pick(record, 'Surname')),
      trn: cellText(pick(record, 'Employee TRN')),
      nis: cellText(pick(record, 'Employee NIS')),
      gross,
      nisEmployee: nisSplit.employee,
      nhtEmployee: nhtSplit.employee,
      edTaxEmployee: edTaxSplit.employee,
      paye: parseAmount(pick(record, 'PAYE')),
      nisEmployer: nisSplit.employer,
      nhtEmployer: nhtSplit.employer,
      edTaxEmployer: edTaxSplit.employer,
      heartEmployer: roundJMD(gross * TAX_CONSTANTS.HEART_RATE_EMPLOYER),
    };
  });
};

// Build a finalized pay-run line item from an extracted row once its employee
// has been resolved (matched or newly created).
export const buildImportedLineItem = (
  row: ComplianceImportRow,
  employeeId: string,
  employeeName: string,
): PayRunLineItem => {
  const employerContributions: EmployerContributions = {
    employerNIS: row.nisEmployer,
    employerNHT: row.nhtEmployer,
    employerEdTax: row.edTaxEmployer,
    employerHEART: row.heartEmployer,
    totalEmployerCost: roundJMD(row.nisEmployer + row.nhtEmployer + row.edTaxEmployer + row.heartEmployer),
  };

  const totalDeductions = roundJMD(row.nisEmployee + row.nhtEmployee + row.edTaxEmployee + row.paye);

  return {
    employeeId,
    employeeName,
    grossPay: row.gross,
    additions: 0,
    deductions: 0,
    nis: row.nisEmployee,
    nht: row.nhtEmployee,
    edTax: row.edTaxEmployee,
    paye: row.paye,
    pension: 0,
    totalDeductions,
    netPay: roundJMD(row.gross - totalDeductions),
    employerContributions,
    trn: row.trn,
    nisId: row.nis,
  };
};

// Assemble a single FINALIZED pay run from imported line items. S01 covers one
// month (YYYY-MM); S02 is an annual aggregate spanning Jan–Dec of the year.
export const buildImportedPayRun = (
  reportType: ComplianceReportType,
  period: string,
  lineItems: PayRunLineItem[],
  runId: string,
): PayRun => {
  const periodStart = reportType === 'S02' ? `${period}-01` : period;
  const periodEnd = reportType === 'S02' ? `${period}-12` : period;
  const [yearStr, monthStr] = periodStart.split('-');
  const lastMonth = reportType === 'S02' ? 12 : Number(monthStr);
  const payDate = new Date(Number(yearStr), lastMonth, 0).toISOString().slice(0, 10);

  const totalGross = roundJMD(lineItems.reduce((sum, item) => sum + item.grossPay, 0));
  const totalNet = roundJMD(lineItems.reduce((sum, item) => sum + item.netPay, 0));

  return {
    id: runId,
    periodStart,
    periodEnd,
    payDate,
    status: 'FINALIZED',
    totalGross,
    totalNet,
    lineItems,
    payFrequency: 'MONTHLY',
  };
};
