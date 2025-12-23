// CommonJS variant to run under older Node without ESM warning
const crypto = require('crypto');

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function buildSnapshot(run, companyId) {
  let periodStart = run.periodStart;
  if (/^\d{4}-\d{2}$/.test(periodStart)) periodStart = `${periodStart}-01`;
  let periodEnd = run.periodEnd;
  if (/^\d{4}-\d{2}$/.test(periodEnd)) {
    const [y, m] = periodEnd.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    periodEnd = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  }

  let finalizedToken = null;
  if (run.status === 'FINALIZED') finalizedToken = generateUUID();

  const payRunData = {
    company_id: companyId,
    period_start: periodStart,
    period_end: periodEnd,
    pay_date: run.payDate,
    pay_frequency: run.payFrequency || 'MONTHLY',
    status: run.status,
    total_gross: run.totalGross,
    total_net: run.totalNet,
    employee_count: run.lineItems ? run.lineItems.length : 0,
    line_items: run.lineItems || []
  };

  const snapshot = {
    pay_run_id: run.id,
    company_id: companyId,
    finalized_token: finalizedToken,
    snapshot_at: new Date().toISOString(),
    snapshot_data: payRunData,
    notes: finalizedToken ? `finalized_token:${finalizedToken}` : null
  };

  return snapshot;
}

const exampleRun = {
  id: generateUUID(),
  periodStart: '2025-12',
  periodEnd: '2025-12',
  payDate: '2025-12-20',
  status: 'FINALIZED',
  totalGross: 100000,
  totalNet: 82000,
  lineItems: [
    { employeeId: generateUUID(), netPay: 41000 },
    { employeeId: generateUUID(), netPay: 41000 }
  ]
};

const snapshot = buildSnapshot(exampleRun, generateUUID());
console.log('Generated snapshot preview:');
console.log(JSON.stringify(snapshot, null, 2));
