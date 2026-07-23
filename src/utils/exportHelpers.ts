import { PayRun, CompanySettings, IntegrationConfig, Employee, User } from '../core/types';
import { normalizeBankCode } from '../features/payroll/payrunWorkflow';
import { calculateEmployerContributions } from '../features/payroll/jamaica2026Fiscal';
import { toast } from 'sonner';

export const downloadFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  // Safe removal: Wait for event loop
  setTimeout(() => {
    if (a.parentNode) {
      a.parentNode.removeChild(a);
    }
    window.URL.revokeObjectURL(url);
  }, 100);
};

// --- Validators ---

const cleanAccountNumber = (acc: string): string => {
    return acc.replace(/[^0-9]/g, ''); // Remove dashes/spaces
};

/**
 * Generates a text file compatible with National Commercial Bank (NCB) Bulk Upload (txt/csv)
 * Standard Format: Record Type, Account, Amount, Name, Ref
 */
export const generateNCBFile = (payRun: PayRun, company: CompanySettings, employees: Employee[]) => {
    // 1. Validation
    const companyAcct = cleanAccountNumber(company.accountNumber);
    if (companyAcct.length !== 9) {
        toast.error(`Company NCB Account must be 9 digits. Found: ${companyAcct.length}`);
        return;
    }

    const errors: string[] = [];
    const validLines = payRun.lineItems.filter(line => {
        const emp = employees.find(e => e.id === line.employeeId);
        const accountNumber = emp?.bankDetails?.accountNumber || line.accountNumber;
        if (!accountNumber) {
            errors.push(`${line.employeeName}: Missing Bank Account`);
            return false;
        }
        if (normalizeBankCode(emp?.bankDetails?.bankName || line.bankName) !== 'NCB') {
            return false; // Skip non-NCB accounts
        }
        const acct = cleanAccountNumber(accountNumber);
        if (acct.length !== 9) {
            errors.push(`${line.employeeName}: Invalid NCB Account (Must be 9 digits)`);
            return false;
        }
        return true;
    });

    if (validLines.length === 0) {
        // Collect bank names for diagnostic
        const bankNames = new Set<string>();
        const noBankCount = { count: 0 };
        payRun.lineItems.forEach(line => {
            const emp = employees.find(e => e.id === line.employeeId);
            const bankName = emp?.bankDetails?.bankName || line.bankName;
            if (bankName) {
                bankNames.add(bankName);
            } else {
                noBankCount.count++;
            }
        });
        const bankInfo = bankNames.size > 0
            ? `Banks found: ${[...bankNames].join(', ')}.`
            : '';
        const noBankInfo = noBankCount.count > 0
            ? ` ${noBankCount.count} employee(s) have no bank details configured.`
            : '';
        toast.error(`No NCB accounts found in this pay run. ${bankInfo}${noBankInfo} Set bank details in Employee settings.`);
        return;
    }

    if (errors.length > 0) {
        alert(`Cannot generate Bank File. Errors:\n${errors.join('\n')}`);
        return;
    }

    // 2. Generate Content
    // Header: H,CompanyAcct,PayDate(YYYYMMDD),TotalAmount,TotalRecords
    const dateStr = payRun.payDate.replace(/-/g, ''); // YYYYMMDD
    const totalNCBAmount = validLines.reduce((sum, line) => sum + line.netPay, 0);
    let content = `H,${companyAcct},${dateStr},${totalNCBAmount.toFixed(2)},${validLines.length}\n`;
    
    // Details: D,EmpAcct,Amount,EmpName,Ref
    validLines.forEach(line => {
        const emp = employees.find(e => e.id === line.employeeId);
        const bankAcct = cleanAccountNumber(emp?.bankDetails?.accountNumber || line.accountNumber || '000000000');
        // Ensure name contains no commas
        const safeName = line.employeeName.replace(/,/g, ' ').substring(0, 30).toUpperCase();
        
        content += `D,${bankAcct},${line.netPay.toFixed(2)},${safeName},SALARY\n`;
    });

    downloadFile(`NCB_Payroll_${payRun.periodStart}.txt`, content, 'text/plain');
    toast.success(`NCB File Generated - ${validLines.length} employees`);
};

/**
 * Generates a CSV file compatible with Scotia Connect (BNS)
 */
export const generateBNSFile = (payRun: PayRun, company: CompanySettings, employees: Employee[]) => {
    // 1. Validation
    if (!company.accountNumber) {
        toast.error("Company Bank Account is missing in Settings.");
        return;
    }

    const validLines = payRun.lineItems.filter(line => {
        const emp = employees.find(e => e.id === line.employeeId);
        return Boolean(emp?.bankDetails?.accountNumber || line.accountNumber)
            && normalizeBankCode(emp?.bankDetails?.bankName || line.bankName) === 'BNS';
    });

    if (validLines.length === 0) {
        toast.error("No Scotiabank accounts found in this pay run");
        return;
    }

    const totalBNSAmount = validLines.reduce((sum, line) => sum + line.netPay, 0);

    // Header
    let content = `Payment Date,Source Account,Amount,Currency,Reference\n`;
    content += `${payRun.payDate},${cleanAccountNumber(company.accountNumber)},${totalBNSAmount.toFixed(2)},JMD,Payroll ${payRun.periodStart}\n\n`;
    
    // Details
    content += `Beneficiary Name,Bank Code,Transit,Account Number,Amount,Details\n`;
    
    validLines.forEach(line => {
        const emp = employees.find(e => e.id === line.employeeId);
        // Bank Code for BNS
        const bankCode = '020';
        
        const transit = emp?.bankDetails?.branchCode || '00000';
        const acct = cleanAccountNumber(emp?.bankDetails?.accountNumber || line.accountNumber || '');
        const safeName = `"${line.employeeName.replace(/"/g, '')}"`;
        
        content += `${safeName},${bankCode},${transit},${acct},${line.netPay.toFixed(2)},Salary\n`;
    });

    downloadFile(`BNS_Payroll_${payRun.periodStart}.csv`, content, 'text/csv');
    toast.success(`Scotiabank File Generated - ${validLines.length} employees`);
};

/**
 * Generates a Journal Entry CSV based on GL Mappings
 */
export const generateGLCSV = (payRun: PayRun, config: IntegrationConfig) => {
    let content = `JournalDate,Reference,GLCode,AccountName,Debit,Credit,Description,Provider\n`;
    const date = payRun.payDate;
    const ref = `PR-${payRun.periodStart}`;
    const provider = config.provider;

    // Helper to find mapping
    const getGL = (item: string) => config.mappings.find(m => m.payrollItem === item);

    // 1. Gross Salary (Debit Expense)
    const totalGross = payRun.totalGross;
    const grossMap = getGL('Gross Salary');
    if (grossMap && totalGross > 0) {
        content += `${date},${ref},${grossMap.glCode},${grossMap.accountName},${totalGross.toFixed(2)},0,Gross Payroll Expense,${provider}\n`;
    }

    // 2. Employer Taxes (Debit Expense) - Use actual employer contributions from line items
    const employerNIS = payRun.lineItems.reduce((acc, l) => acc + (l.employerContributions?.employerNIS || 0), 0);
    const employerNHT = payRun.lineItems.reduce((acc, l) => acc + (l.employerContributions?.employerNHT || 0), 0);
    const employerEdTax = payRun.lineItems.reduce((acc, l) => acc + (l.employerContributions?.employerEdTax || 0), 0);
    const employerHEART = payRun.lineItems.reduce((acc, l) => acc + (l.employerContributions?.employerHEART || 0), 0);
    
    const nisMap = getGL('Employer NIS');
    if (nisMap && employerNIS > 0) content += `${date},${ref},${nisMap.glCode},${nisMap.accountName},${employerNIS.toFixed(2)},0,Employer NIS Expense,${provider}\n`;
    
    const nhtMap = getGL('Employer NHT');
    if (nhtMap && employerNHT > 0) content += `${date},${ref},${nhtMap.glCode},${nhtMap.accountName},${employerNHT.toFixed(2)},0,Employer NHT Expense,${provider}\n`;

    const edTaxMap = getGL('Employer Ed Tax');
    if (edTaxMap && employerEdTax > 0) content += `${date},${ref},${edTaxMap.glCode},${edTaxMap.accountName},${employerEdTax.toFixed(2)},0,Employer Education Tax,${provider}\n`;

    const heartMap = getGL('Employer HEART');
    if (heartMap && employerHEART > 0) content += `${date},${ref},${heartMap.glCode},${heartMap.accountName},${employerHEART.toFixed(2)},0,Employer HEART/NTF,${provider}\n`;

    // 3. Liabilities (Credits)
    // PAYE
    const totalPAYE = payRun.lineItems.reduce((acc, l) => acc + l.paye, 0);
    const payeMap = getGL('PAYE Payable');
    if (payeMap && totalPAYE > 0) content += `${date},${ref},${payeMap.glCode},${payeMap.accountName},0,${totalPAYE.toFixed(2)},PAYE Liability,${provider}\n`;

    // Net Pay
    const totalNet = payRun.totalNet;
    const netMap = getGL('Net Salary Payable');
    if (netMap && totalNet > 0) content += `${date},${ref},${netMap.glCode},${netMap.accountName},0,${totalNet.toFixed(2)},Net Salary Payable,${provider}\n`;

    downloadFile(`GL_Journal_${payRun.periodStart}.csv`, content, 'text/csv');
};

export const generateFullRegisterCSV = (payRuns: PayRun[]) => {
    let content = `RunID,PeriodStart,PeriodEnd,PayDate,EmployeeID,EmployeeName,GrossPay,Additions,Deductions,NIS,NHT,EdTax,PAYE,TotalDeductions,NetPay,Status,BreakdownDetails\n`;
    
    payRuns.forEach(run => {
        run.lineItems.forEach(line => {
            const additionsStr = line.additionsBreakdown?.map(i => `${i.name}:$${i.amount}`).join('; ') || '';
            const deductionsStr = line.deductionsBreakdown?.map(i => `${i.name}:$${i.amount}`).join('; ') || '';
            const detailStr = `Inc[${additionsStr}] Ded[${deductionsStr}]`.replace(/,/g, ' '); 

            content += `${run.id},${run.periodStart},${run.periodEnd},${run.payDate},${line.employeeId},"${line.employeeName}",${line.grossPay.toFixed(2)},${line.additions.toFixed(2)},${line.deductions.toFixed(2)},${line.nis.toFixed(2)},${line.nht.toFixed(2)},${line.edTax.toFixed(2)},${line.paye.toFixed(2)},${line.totalDeductions.toFixed(2)},${line.netPay.toFixed(2)},${run.status},"${detailStr}"\n`;
        });
    });

    downloadFile(`Payroll_Register_Full.csv`, content, 'text/csv');
};

export const generateS01CSV = async (_company: CompanySettings, payRuns: PayRun[], employees: Employee[] = []) => {
    if (!payRuns || payRuns.length === 0) {
        toast.error("No finalized payroll data found.");
        return;
    }

    // TAJ accepts the employee-level Schedule A layout, not the legacy
    // summary report that Payroll Jam previously generated. Keep the header
    // order identical to the supplied S01 Schedule A workbook.
    const headers = [
        'Surname',
        'Firstname',
        'Middle Initials',
        'Employee TRN ',
        'Employee NIS',
        'Gross Emoluments Received in Cash\n\nSalaries, Wages, Fees,\nBonuses, Overtime pay,\nCommissions, etc...',
        'Gross Emoluments Received in Kind\n\n',
        'Superannuation / Pension, Agreed Expenses, Employees Share Ownership Plan',
        'Number of weekly NIS\nand NHT Contributions\nfor the month',
        "NIS\n\n(Employee's Rate + Employer's Rate) x (Total Gross Emoluments)",
        "NHT\n\n(Employee's Rate + Employer's Rate) x (Total Gross Emoluments)",
        "Education Tax\n\n(Employee's Rate + Employer's Rate) x (Total Gross Emoluments after Deductions and NIS)",
        'PAYE Income Tax / (Refunds)\n\n(Rate) x (Total Gross\nEmoluments after\nDeductions, NIS and\nNil-Rate (NR)).',
    ];

    type ScheduleRow = {
        surname: string;
        firstName: string;
        middleInitials: string;
        trn: string;
        nisId: string;
        cash: number;
        inKind: number;
        qualifyingDeductions: number;
        contributionCount: number;
        nis: number;
        nht: number;
        edTax: number;
        paye: number;
    };
    const rows = new Map<string, ScheduleRow>();

    payRuns.forEach((run) => {
        run.lineItems.forEach((line) => {
            const employee = employees.find((candidate) => candidate.id === line.employeeId);
            const nameParts = (line.employeeName || '').trim().split(/\s+/).filter(Boolean);
            const firstName = employee?.firstName || nameParts[0] || '';
            const surname = employee?.lastName || nameParts.slice(1).join(' ') || '';
            const key = line.employeeId || `${surname}|${firstName}|${line.trn || ''}`;
            const current = rows.get(key) || {
                surname,
                firstName,
                middleInitials: '',
                trn: employee?.trn || line.trn || '',
                nisId: employee?.nis || line.nisId || '',
                cash: 0,
                inKind: 0,
                qualifyingDeductions: 0,
                contributionCount: 0,
                nis: 0,
                nht: 0,
                edTax: 0,
                paye: 0,
            };
            const employer = line.employerContributions || calculateEmployerContributions(line.grossPay, employee?.employeeType);
            const qualifyingDeductions = (line.deductionsBreakdown || [])
                .filter((deduction) => /pension|superannuation|agreed expense|share ownership/i.test(deduction.name || ''))
                .reduce((sum, deduction) => sum + Number(deduction.amount || 0), 0);

            current.cash += Number(line.grossPay || 0) + Number(line.additions || 0);
            current.qualifyingDeductions += qualifyingDeductions;
            current.contributionCount += 1;
            current.nis += Number(line.nis || 0) + Number(employer.employerNIS || 0);
            current.nht += Number(line.nht || 0) + Number(employer.employerNHT || 0);
            current.edTax += Number(line.edTax || 0) + Number(employer.employerEdTax || 0);
            current.paye += Number(line.paye || 0);
            rows.set(key, current);
        });
    });

    const values = [...rows.values()].map((row) => [
            row.surname,
            row.firstName,
            row.middleInitials,
            row.trn,
            row.nisId,
            row.cash,
            row.inKind,
            row.qualifyingDeductions,
            row.contributionCount,
            row.nis,
            row.nht,
            row.edTax,
            row.paye,
        ]);
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('S01ScheduleA', { views: [{ state: 'frozen', ySplit: 1 }] });
    worksheet.columns = [12, 12, 12, 14, 14, 28, 28, 28, 22, 22, 22, 28, 28].map((width) => ({ width }));
    const headerRow = worksheet.addRow(headers);
    headerRow.height = 108;
    headerRow.eachCell((cell) => {
        cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
        cell.font = { bold: true };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    values.forEach((value) => worksheet.addRow(value));
    for (let row = 2; row <= worksheet.rowCount; row += 1) {
        for (const column of [6, 7, 8, 10, 11, 12, 13]) {
            worksheet.getCell(row, column).numFmt = '#,##0.00';
        }
    }
    worksheet.autoFilter = `A1:M${Math.max(worksheet.rowCount, 2)}`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `S01_Schedule_A_${payRuns[0].periodStart}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
};

export const generateS02CSV = (company: CompanySettings, payRuns: PayRun[], employees: Employee[] = [], year?: string) => {
    const effectiveYear = year || new Date().getFullYear().toString();
    const relevantRuns = payRuns.filter(run => run.periodStart.startsWith(effectiveYear));
    
    if (relevantRuns.length === 0) {
        toast.error(`No payroll data found for year ${effectiveYear}.`);
        return;
    }

    const empMap = new Map<string, {
        id: string;
        name: string;
        gross: number;
        nis: number;
        nht: number;
        edTax: number;
        paye: number;
        employerNIS: number;
        employerNHT: number;
        employerEdTax: number;
        employerHEART: number;
    }>();

    relevantRuns.forEach(run => {
        run.lineItems.forEach(line => {
            const existing = empMap.get(line.employeeId) || {
                id: line.employeeId,
                name: line.employeeName,
                gross: 0,
                nis: 0,
                nht: 0,
                edTax: 0,
                paye: 0,
                employerNIS: 0,
                employerNHT: 0,
                employerEdTax: 0,
                employerHEART: 0
            };

            existing.gross += line.grossPay + line.additions;
            existing.nis += line.nis;
            existing.nht += line.nht;
            existing.edTax += line.edTax;
            existing.paye += line.paye;

            // Use actual employer contributions; fall back to calculation
            if (line.employerContributions) {
                existing.employerNIS += line.employerContributions.employerNIS;
                existing.employerNHT += line.employerContributions.employerNHT;
                existing.employerEdTax += line.employerContributions.employerEdTax;
                existing.employerHEART += line.employerContributions.employerHEART;
            } else {
                const emp = employees.find(e => e.id === line.employeeId);
                const fallback = calculateEmployerContributions(line.grossPay, emp?.employeeType);
                existing.employerNIS += fallback.employerNIS;
                existing.employerNHT += fallback.employerNHT;
                existing.employerEdTax += fallback.employerEdTax;
                existing.employerHEART += fallback.employerHEART;
            }
            
            empMap.set(line.employeeId, existing);
        });
    });

    let content = `S02 EMPLOYER'S ANNUAL RETURN - ${effectiveYear}\n`;
    content += `Company: ${company.name},TRN: ${company.trn}\n`;
    content += `Address,"${company.address.replace(/\n/g, ' ')}"\n\n`;
    content += `Employee Name,TRN,NIS Number,Total Gross,Employee NIS,Employer NIS,Employee NHT,Employer NHT,Employee EdTax,Employer EdTax,PAYE,HEART\n`;

    empMap.forEach(stats => {
        // Look up real TRN and NIS from the employees array
        const emp = employees.find(e => e.id === stats.id);
        const trn = emp?.trn || 'N/A';
        const nisNumber = emp?.nis || 'N/A';

        content += `"${stats.name}",${trn},${nisNumber},$${stats.gross.toFixed(2)},$${stats.nis.toFixed(2)},$${stats.employerNIS.toFixed(2)},$${stats.nht.toFixed(2)},$${stats.employerNHT.toFixed(2)},$${stats.edTax.toFixed(2)},$${stats.employerEdTax.toFixed(2)},$${stats.paye.toFixed(2)},$${stats.employerHEART.toFixed(2)}\n`;
    });

    downloadFile(`S02_Annual_Return_${effectiveYear}.csv`, content, 'text/csv');
};

// HEART Trust/NSTA is administered separately from Tax Administration Jamaica,
// so unlike NIS/NHT/Ed Tax/PAYE it isn't part of the S01 monthly filing — it
// needs its own remittance summary for the period.
export const generateHeartRemittanceCSV = (company: CompanySettings, payRuns: PayRun[], employees: Employee[] = [], period: string) => {
    const relevantRuns = payRuns.filter(run => run.periodStart === period);

    if (relevantRuns.length === 0) {
        toast.error(`No payroll data found for period ${period}.`);
        return;
    }

    const empMap = new Map<string, {
        id: string;
        name: string;
        gross: number;
        employerHEART: number;
    }>();

    relevantRuns.forEach(run => {
        run.lineItems.forEach(line => {
            const existing = empMap.get(line.employeeId) || {
                id: line.employeeId,
                name: line.employeeName,
                gross: 0,
                employerHEART: 0
            };

            existing.gross += line.grossPay + line.additions;

            // Use actual employer contributions; fall back to calculation
            if (line.employerContributions) {
                existing.employerHEART += line.employerContributions.employerHEART;
            } else {
                const emp = employees.find(e => e.id === line.employeeId);
                const fallback = calculateEmployerContributions(line.grossPay, emp?.employeeType);
                existing.employerHEART += fallback.employerHEART;
            }

            empMap.set(line.employeeId, existing);
        });
    });

    const rows = [...empMap.values()];
    const totalGross = rows.reduce((sum, row) => sum + row.gross, 0);
    const totalHeart = rows.reduce((sum, row) => sum + row.employerHEART, 0);

    let content = `HEART TRUST/NSTA MONTHLY REMITTANCE - ${period}\n`;
    content += `Company: ${company.name},TRN: ${company.trn}\n`;
    content += `Address,"${company.address.replace(/\n/g, ' ')}"\n`;
    content += `HEART Rate,3%\n`;
    content += `Total Employees,${rows.length}\n\n`;
    content += `Employee Name,TRN,NIS Number,Gross Emoluments,HEART Contribution\n`;

    rows.forEach(row => {
        const emp = employees.find(e => e.id === row.id);
        const trn = emp?.trn || 'N/A';
        const nisNumber = emp?.nis || 'N/A';

        content += `"${row.name}",${trn},${nisNumber},$${row.gross.toFixed(2)},$${row.employerHEART.toFixed(2)}\n`;
    });

    content += `\nTOTAL,,,$${totalGross.toFixed(2)},$${totalHeart.toFixed(2)}\n`;

    downloadFile(`HEART_Remittance_${period}.csv`, content, 'text/csv');
};

export const generateP24CSV = (company: CompanySettings, payRuns: PayRun[], employee: Employee | undefined, user: User, year: string = '2025') => {
    const name = employee ? `${employee.firstName} ${employee.lastName}` : user.name;
    const empId = employee ? employee.id : user.id; 

    const relevantRuns = payRuns.filter(run => run.periodStart.startsWith(year));
    
    const stats = {
        gross: 0,
        nis: 0,
        nht: 0,
        edTax: 0,
        paye: 0
    };

    relevantRuns.forEach(run => {
        const line = run.lineItems.find(li => li.employeeId === empId || li.employeeName === name);
        if (line) {
            stats.gross += line.grossPay + line.additions;
            stats.nis += line.nis;
            stats.nht += line.nht;
            stats.edTax += line.edTax;
            stats.paye += line.paye;
        }
    });

    if (stats.gross === 0) {
        toast.error("No earnings found for this tax year.");
        return;
    }

    let content = `P24 CERTIFICATE OF PAY AND TAX DEDUCTED - ${year}\n`;
    content += `Employer: ${company.name}\n`;
    content += `Address: ${company.address.replace(/\n/g, ' ')}\n\n`;
    content += `Employee: ${name}\n`;
    content += `TRN: ${employee?.trn || '000-000-000'}\n`;
    content += `NIS: ${employee?.nis || 'A000000'}\n\n`;
    
    content += `ITEM,AMOUNT\n`;
    content += `Total Gross Emoluments,$${stats.gross.toFixed(2)}\n`;
    content += `National Insurance (NIS),$${stats.nis.toFixed(2)}\n`;
    content += `National Housing Trust (NHT),$${stats.nht.toFixed(2)}\n`;
    content += `Education Tax,$${stats.edTax.toFixed(2)}\n`;
    content += `Income Tax (PAYE),$${stats.paye.toFixed(2)}\n`;
    content += `Net Pay,$${(stats.gross - (stats.nis + stats.nht + stats.edTax + stats.paye)).toFixed(2)}\n`;

    downloadFile(`P24_${name.replace(/ /g, '_')}_${year}.csv`, content, 'text/csv');
};

export const generateP45CSV = (company: CompanySettings, payRuns: PayRun[], employee: Employee, year: string = '2025') => {
    const terminationDate = employee.terminationDetails?.date || new Date().toISOString().split('T')[0];
    
    const relevantRuns = payRuns.filter(run => 
        run.periodStart.startsWith(year) && run.payDate <= terminationDate
    );
    
    const stats = {
        gross: 0,
        nis: 0,
        nht: 0,
        edTax: 0,
        paye: 0
    };

    relevantRuns.forEach(run => {
        const line = run.lineItems.find(li => li.employeeId === employee.id);
        if (line) {
            stats.gross += line.grossPay + line.additions;
            stats.nis += line.nis;
            stats.nht += line.nht;
            stats.edTax += line.edTax;
            stats.paye += line.paye;
        }
    });

    let content = `P45 TERMINATION CERTIFICATE\n`;
    content += `Employer: ${company.name}\n`;
    content += `Address: ${company.address.replace(/\n/g, ' ')}\n\n`;
    content += `Employee: ${employee.firstName} ${employee.lastName}\n`;
    content += `TRN: ${employee.trn}\n`;
    content += `Leaving Date: ${terminationDate}\n`;
    content += `Reason: ${employee.terminationDetails?.reason || 'Resignation'}\n\n`;
    
    content += `PAY & TAX DETAILS TO LEAVING DATE (${year})\n`;
    content += `Total Gross Pay,$${stats.gross.toFixed(2)}\n`;
    content += `Total Tax Deducted (PAYE),$${stats.paye.toFixed(2)}\n`;
    content += `Total NIS,$${stats.nis.toFixed(2)}\n`;
    content += `Total NHT,$${stats.nht.toFixed(2)}\n`;
    content += `Total Ed Tax,$${stats.edTax.toFixed(2)}\n`;

    downloadFile(`P45_${employee.lastName}_${terminationDate}.csv`, content, 'text/csv');
};
