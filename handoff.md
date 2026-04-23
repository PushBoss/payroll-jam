This **`TASK_HANDOFF.md`** acts as the definitive roadmap for your IDE to execute the **Payroll-Jam** architectural overhaul while integrating the dynamic tax logic requirements.

---

# 📝 TASK_HANDOFF: Payroll-Jam Architectural Overhaul

## **Status**: 🟡 IN PROGRESS
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

## **Phase 2: Security Hardening & Edge Proxying** ✅ COMPLETE
* **Service Role Sanitization**: ✅ All `getServiceRoleClient()` removed from `UserService.ts`, `ResellerService.ts`, and `supabaseService.ts`. Zero references to `SERVICE_ROLE` remain in `/src`.
* **Edge Function Implementation**: ✅ `delete-account` and `save-reseller-client` actions added to `admin-handler` Edge Function. All `auth.admin.*` operations now execute server-side only.
* **Environment Audit**: ✅ `VITE_SUPABASE_SERVICE_ROLE_KEY` is absent from `.env` files and not referenced in any client code.

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

## **Phase 6: Final Handoff & Documentation** 🟡 IN PROGRESS
* **Handoff Completion**: ✅ `/docs` folder contains `PAYROLL_MODULE_SPEC.md` and `EMPLOYEE_MODULE_SPEC.md`.
* **Review**: 🟡 `CODE_REVIEW_CHECKLIST.md` being executed. Security section ✅. Type safety pass completed: `as any` reduced from 223 → 151 instances (32%) via DB row types and coercion helpers.

