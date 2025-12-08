import { PayRun, CompanySettings, IntegrationConfig, Employee, User } from '../types';
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
        if (!emp?.bankDetails?.accountNumber) {
            errors.push(`${line.employeeName}: Missing Bank Account`);
            return false;
        }
        // Only include employees with NCB accounts
        if (emp.bankDetails.bankName !== 'NCB') {
            return false; // Skip non-NCB accounts
        }
        const acct = cleanAccountNumber(emp.bankDetails.accountNumber);
        if (acct.length !== 9) {
            errors.push(`${line.employeeName}: Invalid NCB Account (Must be 9 digits)`);
            return false;
        }
        return true;
    });

    if (validLines.length === 0) {
        toast.error("No NCB accounts found in this pay run");
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
        const bankAcct = cleanAccountNumber(emp?.bankDetails?.accountNumber || '000000000');
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
        return emp?.bankDetails?.accountNumber && emp?.bankDetails?.bankName === 'BNS';
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
        const acct = cleanAccountNumber(emp?.bankDetails?.accountNumber || '');
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

export const generateS01CSV = (company: CompanySettings, payRuns: PayRun[]) => {
    if (!payRuns || payRuns.length === 0) {
        toast.error("No finalized payroll data found.");
        return;
    }
    
    const run = payRuns[0]; 
    const totalGross = run.totalGross;
    
    // Estimates
    const empNIS = run.lineItems.reduce((acc, item) => acc + item.nis, 0);
    const empNHT = run.lineItems.reduce((acc, item) => acc + item.nht, 0);
    const empEdTax = run.lineItems.reduce((acc, item) => acc + item.edTax, 0);
    const empPAYE = run.lineItems.reduce((acc, item) => acc + item.paye, 0);

    const employerNIS = totalGross * 0.03; 
    const employerNHT = totalGross * 0.03;
    const employerEdTax = totalGross * 0.035;
    const employerHEART = totalGross * 0.03;

    const totalNIS = empNIS + employerNIS;
    const totalNHT = empNHT + employerNHT;
    const totalEdTax = empEdTax + employerEdTax;
    
    const grandTotal = totalNIS + totalNHT + totalEdTax + empPAYE + employerHEART;

    let content = `S01 MONTHLY REMITTANCE FORM\n`;
    content += `Company Name,${company.name}\n`;
    content += `TRN,${company.trn}\n`;
    content += `Address,"${company.address.replace(/\n/g, ' ')}"\n`;
    content += `Period,${run.periodStart}\n\n`;
    
    content += `SECTION A: SUMMARY OF EMOLUMENTS\n`;
    content += `Total Gross Emoluments,,$${totalGross.toFixed(2)}\n\n`;

    content += `SECTION B: DEDUCTIONS AND CONTRIBUTIONS\n`;
    content += `Category,Employee Portion,Employer Portion,Total Remittance\n`;
    content += `National Insurance (NIS),$${empNIS.toFixed(2)},$${employerNIS.toFixed(2)},$${totalNIS.toFixed(2)}\n`;
    content += `National Housing Trust (NHT),$${empNHT.toFixed(2)},$${employerNHT.toFixed(2)},$${totalNHT.toFixed(2)}\n`;
    content += `Education Tax,$${empEdTax.toFixed(2)},$${employerEdTax.toFixed(2)},$${totalEdTax.toFixed(2)}\n`;
    content += `HEART Contribution,-,$${employerHEART.toFixed(2)},$${employerHEART.toFixed(2)}\n`;
    content += `Income Tax (PAYE),$${empPAYE.toFixed(2)},-,$${empPAYE.toFixed(2)}\n\n`;

    content += `TOTAL PAYABLE,,,$${grandTotal.toFixed(2)}\n`;

    downloadFile(`S01_Remittance_${run.periodStart}.csv`, content, 'text/csv');
};

export const generateS02CSV = (company: CompanySettings, payRuns: PayRun[], year: string = '2025') => {
    const relevantRuns = payRuns.filter(run => run.periodStart.startsWith(year));
    
    if (relevantRuns.length === 0) {
        toast.error(`No payroll data found for year ${year}.`);
        return;
    }

    const empMap = new Map<string, any>();

    relevantRuns.forEach(run => {
        run.lineItems.forEach(line => {
            const existing = empMap.get(line.employeeId) || {
                id: line.employeeId,
                name: line.employeeName,
                gross: 0,
                nis: 0,
                nht: 0,
                edTax: 0,
                paye: 0
            };

            existing.gross += line.grossPay + line.additions;
            existing.nis += line.nis;
            existing.nht += line.nht;
            existing.edTax += line.edTax;
            existing.paye += line.paye;
            
            empMap.set(line.employeeId, existing);
        });
    });

    let content = `S02 EMPLOYER'S ANNUAL RETURN - ${year}\n`;
    content += `Company: ${company.name},TRN: ${company.trn}\n`;
    content += `Address,"${company.address.replace(/\n/g, ' ')}"\n\n`;
    content += `Employee Name,TRN,NIS Number,Total Gross,Employee NIS,Employer NIS,Employee NHT,Employer NHT,Employee EdTax,Employer EdTax,PAYE,HEART (3%)\n`;

    empMap.forEach(stats => {
        const emplrNIS = stats.gross * 0.03; 
        const emplrNHT = stats.gross * 0.03; 
        const emplrEd = stats.gross * 0.035;
        const heart = stats.gross * 0.03;

        content += `"${stats.name}",000-000-000,A000000,$${stats.gross.toFixed(2)},$${stats.nis.toFixed(2)},$${emplrNIS.toFixed(2)},$${stats.nht.toFixed(2)},$${emplrNHT.toFixed(2)},$${stats.edTax.toFixed(2)},$${emplrEd.toFixed(2)},$${stats.paye.toFixed(2)},$${heart.toFixed(2)}\n`;
    });

    downloadFile(`S02_Annual_Return_${year}.csv`, content, 'text/csv');
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