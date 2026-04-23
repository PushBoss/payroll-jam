# Payroll Calculation & Processing Specification

## 1. Overview
- **Name**: Payroll Calculation Module
- **Purpose**: To process employee timesheets, calculate gross-to-net pay considering Jamaican statutory deductions, manage dynamic tax bands, and generate finalized organizational pay-runs and historical payslips.
- **Owner Role**: Backend / Payroll Systems Architecture

## 2. Technical Scope
- **Directory**: `src/features/payroll/`, `src/core/`
- **Key Files**: 
  - `usePayroll.ts`: Main react hook integrating frontend state with business logic calculation.
  - `payrunCalculator.ts`: Core logic mapping employees to specific payroll line items.
  - `taxUtils.ts`: Centralized utility containing strictly defined math algorithms for Jamaican deductions.
  - `jamaica2026Fiscal.ts`: Modern schema adapter for edge-case future regulations.
- **Dependencies**: None. Math is kept pure and isolated from UI boundaries.

## 3. Data Interface
- **Primary Input(s)**: `Employee[]`, `WeeklyTimesheet[]`, `LeaveRequest[]`, `CompanySettings` (for dynamic thresholds).
- **Primary Output(s)**: `PayRunLineItem[]` representing the exact line-item breakdowns of gross earnings, deductions, and net pay.
- **Data Model**: `PayRun`, `PayRunLineItem`, `PayslipLineItem` from `src/core/types.ts`.

## 4. Business Rules
1. **Dynamic Tax Parameters**: Tax calculation algorithms prioritize parsing dynamic thresholds (PAYE, NIS Ceilings) directly from `CompanySettings`. If a threshold is undefined, the system gracefully falls back to the hardcoded `TAX_CONSTANTS`.
2. **Precision Rounding**: All intermediate and final financial calculations MUST be normalized to 2 decimal places using standardized currency functions to prevent fractional penny discrepancies across thousands of calculations.
3. **Statutory Deductions (Jamaica)**: 
   - **NIS**: 3% employee / 3% employer (Capped).
   - **NHT**: 2% employee / 3% employer.
   - **ED Tax**: 2.25% employee / 3.5% employer (After NIS is mathematically deducted from gross).
   - **PAYE**: 25% (Standard) / 30% (High-earner above tier 2) evaluated after NIS and non-taxable allowances.

## 5. Security & Constraints
- **RLS Policies Involved**: `pay_runs` and `pay_run_line_items` strictly bound to the authenticated `company_id`.
- **Validation Schema**: N/A (Server-side validation handled natively in SQL).
- **Role Permissions**: Read/Write locked to `OWNER`, `RESELLER`, `ADMIN`. `EMPLOYEE` may only read `PayslipLineItem` linked to their explicit UUID.

## 6. Implementation Notes
- Tax algorithms in `taxUtils.ts` heavily utilize functional programming concepts to isolate side effects. They are designed to receive parameters and return pure numeric outputs.

## 7. Risks & Technical Debt
- **Cumulative PAYE**: Implementing cumulative end-of-year tax adjustments remains complex when historical pay runs are retroactively modified.

## 8. Testing Strategy
- **Unit Tests**: Executable suite inside `taxUtils.test.ts` to assert that calculations mathematically map to verified physical payslip examples (e.g., verifying exact JMD output rounding for $416,666.66 inputs).
- **Integration Tests**: N/A currently.
- **Manual Verification**: Run a full dual-employee test (one below PAYE threshold, one above) and visually verify the S01 deductions match expected TAJ output.
