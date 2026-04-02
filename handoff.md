This **`TASK_HANDOFF.md`** acts as the definitive roadmap for your IDE to execute the **Payroll-Jam** architectural overhaul while integrating the dynamic tax logic requirements.

---

# 📝 TASK_HANDOFF: Payroll-Jam Architectural Overhaul

## **Status**: 🔴 NOT STARTED
**Objective**: Transform **Payroll-Jam** into a modular "Delivery OS" by refactoring the codebase into a `/src` root, de-monolithing core services, and implementing a user-configurable **Dynamic Tax Logic** card within the Statutory Tab.

---

## **Phase 1: Structural Reorganization**
* **Move to `/src` Root**: Relocate all project source code (pages, components, services, utils, hooks, and `types.ts`) into a new `/src` directory to clear root-level clutter.
* **Feature-Sliced Architecture**: Create a `/src/features` directory and group logic by domain:
    * `features/payroll/`: Core calculation engine and PayRun state management.
    * `features/compliance/`: S01/S02 generation and statutory filing status.
    * `features/employees/`: Onboarding workflows, profile management, and document storage.
* **Core Logic Centralization**: Move `taxUtils.ts` and `types.ts` into `/src/core/` to serve as the application's global "Source of Truth".

---

## **Phase 2: Security Hardening & Edge Proxying**
* **Service Role Sanitization**: Identify and remove every instance of `getAdminClient()` or `supabaseServiceRole` from the frontend client code.
* **Edge Function Implementation**: Rewrite sensitive "Admin-only" actions, such as modifying organizational tax constants, to live exclusively in **Supabase Edge Functions**.
* **Environment Audit**: Ensure `VITE_SUPABASE_SERVICE_ROLE_KEY` is completely removed from all `.env` files and client-facing Vercel environment variables.

---

## **Phase 3: Breaking the Monoliths**
* **`App.tsx` (Routing & State)**: 
    * Move route components to `/src/pages/`.
    * Implement a standard routing library (e.g., `react-router-dom`).
    * Extract heavy state management into `PayrollProvider` and `UserProvider` contexts.
* **`supabaseService.ts` (Service Splitting)**:
    * Divide the 104KB monolithic service into `PayrollService.ts`, `EmployeeService.ts`, and `ComplianceService.ts` within `/src/services/`.
* **Hook Extraction**: Move business logic out of large components like `PayRun.tsx` and into testable hooks such as `useStatutoryTracking`.

---

## **Phase 4: Dynamic Tax Logic & Statutory Tab Refactor**
* **Statutory Card (Tab 5)**: Add a **"Tax Calculation Configuration"** card to the `EmployeeManager` component.
* [cite_start]**User-Configurable Parameters**: Enable business owners to modify the following values (reference: `Jamaica Payroll Template Calculations.csv` [cite: 1]):
    * [cite_start]**PAYE Threshold**: Monthly threshold (current: **$158,333.33**)[cite: 1].
    * [cite_start]**NIS Ceiling**: Monthly income cap for NIS (current: **$416,666.66**)[cite: 1].
    * [cite_start]**Tax Rates**: Percentage fields for NIS (3%), NHT (Employee 2% / Employer 3%), and Education Tax (Employee 2.25% / Employer 3.5%)[cite: 1].
* **Strategy Pattern Calculation**: Update `calculatePayrunLineItems()` in `payrunCalculator.ts` to ingest these dynamic organization-level parameters from the database instead of using hardcoded constants.

---

## **Phase 5: Precision & Database Stability**
* [cite_start]**"Money Math" Validation**: Create a `taxUtils.test.ts` suite to verify Jamaican tax brackets (NIS, NHT, PAYE) against known manual calculation results[cite: 1].
* **Standardized Rounding**: Implement a shared utility to ensure all **JMD** currency is handled with consistent 2-decimal-place rounding throughout the app.
* **Database Golden State**: Merge all disparate `fix_*.sql` files into a single `schema.sql` and transition to the **Supabase CLI** for versioned migrations.

---

## **Phase 6: Final Handoff & Documentation**
* **Handoff Completion**: Ensure the `/docs` folder contains the completed `MODULE_SPEC.md` for Payroll and Employee APIs.
* **Review**: Execute the `CODE_REVIEW_CHECKLIST.md` for all refactored code, focusing on security boundaries and architectural integrity.

