import React, { useState } from 'react';
import { TAX_CONSTANTS } from '../../core/taxUtils';
import { TaxConfig } from '../../core/types';

export const DEFAULT_ORG_TAX_CONFIG: TaxConfig = {
  nisRateEmployee: TAX_CONSTANTS.NIS_RATE_EMPLOYEE,
  nisRateEmployer: TAX_CONSTANTS.NIS_RATE_EMPLOYER,
  nisCap: TAX_CONSTANTS.NIS_CAP_ANNUAL,
  nhtRateEmployee: TAX_CONSTANTS.NHT_RATE_EMPLOYEE,
  nhtRateEmployer: TAX_CONSTANTS.NHT_RATE_EMPLOYER,
  nhtCap: 5000000, 
  edTaxRateEmployee: TAX_CONSTANTS.ED_TAX_RATE,

  edTaxRateEmployer: TAX_CONSTANTS.ED_TAX_RATE_EMPLOYER,
  heartRateEmployer: TAX_CONSTANTS.HEART_RATE_EMPLOYER,
  payeThreshold: TAX_CONSTANTS.PAYE_THRESHOLD,
  payeRateStd: TAX_CONSTANTS.PAYE_RATE_STD,
  payeRateHigh: TAX_CONSTANTS.PAYE_RATE_HIGH,
  payeThresholdHigh: TAX_CONSTANTS.PAYE_THRESHOLD_HIGH,
};


interface TaxConfigCardProps {
  config?: TaxConfig;
  onSave: (config: TaxConfig) => Promise<void>;
  isSaving?: boolean;
}


interface RateFieldProps {
  id: string;
  label: string;
  hint: string;
  value: number;
  isPercent?: boolean;
  onChange: (v: number) => void;
}

const RateField: React.FC<RateFieldProps> = ({ id, label, hint, value, isPercent = true, onChange }) => {
  const display = isPercent ? +(value * 100).toFixed(4) : value;
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-700 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          step={isPercent ? '0.01' : '1'}
          min="0"
          value={display}
          onChange={e => {
            const raw = parseFloat(e.target.value) || 0;
            onChange(isPercent ? raw / 100 : raw);
          }}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 bg-white transition-all"
        />
        {isPercent && <span className="text-gray-500 text-sm">%</span>}
      </div>
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
    </div>
  );
};

export const TaxConfigCard: React.FC<TaxConfigCardProps> = ({ config, onSave, isSaving }) => {
  const mergedConfig: TaxConfig = {
    ...DEFAULT_ORG_TAX_CONFIG,
    ...(config ? Object.fromEntries(
      Object.entries(config).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
    ) : {}),
  };
  const [draft, setDraft] = useState<TaxConfig>(mergedConfig);
  const [saved, setSaved] = useState(false);

  const update = (key: keyof TaxConfig) => (val: number) =>
    setDraft(prev => ({ ...prev, [key]: val }));


  const handleSave = async () => {
    await onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => setDraft(DEFAULT_ORG_TAX_CONFIG);

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <span className="text-lg">⚙️</span> Tax Calculation Configuration
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Organisation-level overrides for Jamaican statutory rates. These replace the national defaults for all pay runs.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-amber-700 hover:text-amber-900 underline transition-colors"
        >
          Reset to 2026 Defaults
        </button>
      </div>

      {/* NIS Section */}
      <div>
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3 border-b border-amber-200 pb-1">
          NIS — National Insurance Scheme
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <RateField id="nisRateEmployee" label="Employee Rate" hint="Standard: 3%" value={draft.nisRateEmployee} onChange={update('nisRateEmployee')} />
          <RateField id="nisRateEmployer" label="Employer Rate" hint="Standard: 2.5%" value={draft.nisRateEmployer} onChange={update('nisRateEmployer')} />
          <RateField id="nisCap" label="Annual Salary Cap (JMD)" hint="Standard: $5,000,000" value={draft.nisCap} isPercent={false} onChange={update('nisCap')} />
        </div>
      </div>

      {/* NHT Section */}
      <div>
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3 border-b border-amber-200 pb-1">
          NHT — National Housing Trust
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <RateField id="nhtRateEmployee" label="Employee Rate" hint="Standard: 2%" value={draft.nhtRateEmployee} onChange={update('nhtRateEmployee')} />
          <RateField id="nhtRateEmployer" label="Employer Rate" hint="Standard: 3%" value={draft.nhtRateEmployer} onChange={update('nhtRateEmployer')} />
          <RateField id="nhtCap" label="Annual Salary Cap (JMD)" hint="Standard: $5,000,000" value={draft.nhtCap} isPercent={false} onChange={update('nhtCap')} />
        </div>

      </div>

      {/* Education Tax Section */}
      <div>
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3 border-b border-amber-200 pb-1">
          Education Tax
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <RateField id="edTaxRateEmployee" label="Employee Rate" hint="Standard: 2.25%" value={draft.edTaxRateEmployee} onChange={update('edTaxRateEmployee')} />
          <RateField id="edTaxRateEmployer" label="Employer Rate" hint="Standard: 2.25%" value={draft.edTaxRateEmployer} onChange={update('edTaxRateEmployer')} />
          <RateField id="heartRateEmployer" label="HEART/NTA Rate (Employer)" hint="Standard: 3%" value={draft.heartRateEmployer} onChange={update('heartRateEmployer')} />
        </div>
      </div>


      {/* PAYE Section */}
      <div>
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3 border-b border-amber-200 pb-1">
          PAYE — Income Tax Thresholds &amp; Rates
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <RateField id="payeThreshold" label="Annual Tax-Free Threshold (JMD)" hint="Standard: $1,700,096 (~$141,674/mo)" value={draft.payeThreshold} isPercent={false} onChange={update('payeThreshold')} />
          <RateField id="payeThresholdHigh" label="Higher Rate Threshold (JMD)" hint="Standard: $6,000,000/yr" value={draft.payeThresholdHigh} isPercent={false} onChange={update('payeThresholdHigh')} />
          <RateField id="payeRateStd" label="Standard Rate" hint="Standard: 25%" value={draft.payeRateStd} onChange={update('payeRateStd')} />
          <RateField id="payeRateHigh" label="Higher Rate" hint="Standard: 30% (income > $6M)" value={draft.payeRateHigh} onChange={update('payeRateHigh')} />
        </div>
      </div>

      {/* Preview strip */}
      <div className="bg-white/70 border border-amber-100 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        {[
          { label: 'NIS Employee', val: `${(draft.nisRateEmployee * 100).toFixed(2)}%` },
          { label: 'NHT Employee', val: `${(draft.nhtRateEmployee * 100).toFixed(2)}%` },
          { label: 'Ed Tax Employee', val: `${(draft.edTaxRateEmployee * 100).toFixed(2)}%` },
          { label: 'PAYE Threshold (mo)', val: `$${Math.round(draft.payeThreshold / 12).toLocaleString()}` },
        ].map(({ label, val }) => (
          <div key={label}>
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-sm font-bold text-gray-800">{val}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-amber-500 hover:bg-amber-600 text-white'
          } disabled:opacity-60`}
        >
          {isSaving ? '⏳ Saving…' : saved ? '✅ Saved!' : '💾 Save Tax Config'}
        </button>
      </div>
    </div>
  );
};
