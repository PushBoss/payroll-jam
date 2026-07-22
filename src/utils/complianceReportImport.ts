import Papa from 'papaparse';
import { ComplianceReportType } from '../services/ComplianceReportService';

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
