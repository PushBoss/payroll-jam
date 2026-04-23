# System Architecture: Payroll-Jam

## 1. High-Level Diagram (Conceptual)
```mermaid
graph TD
    Client[Web Browser - React/Vite]
    Auth[Supabase Auth]
    # System Architecture: Payroll-Jam

    ## 1. High-Level Diagram (Conceptual)
    ```mermaid
    graph TD
            Client[Web Browser - React/Vite]
            Auth[Supabase Auth]
            DB[(Supabase PostgreSQL)]
            Edge[Supabase Edge Functions]
            Vercel[Vercel Serverless Functions]
            DimePay[DimePay API]
            Gemini[Google Gemini AI]
            Email[Brevo/EmailJS]

            Client -- Auth Requests --> Auth
            Client -- Data/RLS Queries --> DB
            Client -- Internal Logic --> Edge
            Client -- AI Context --> Gemini
            Client -- Webhooks/Billing --> Vercel
            Vercel -- Verify Payment --> DimePay
            Edge -- Send Email --> Email
            Edge -- RAG/Chat --> Gemini
    ```

    ## 2. Major Layers

    ### 2.1 Frontend (SPA)
    - **State Management**: App-shell state is now split across focused app and feature modules rather than a monolithic `App.tsx`.
        - `src/app/useAppNavigation.ts`
        - `src/app/useAuthRedirects.ts`
        - `src/app/useAppBootstrap.ts`
        - `src/app/useAppData.ts`
        - `src/features/company/useCompanyConfigData.ts`
        - `src/features/employees/useWorkforceData.ts`
        - `src/features/payroll/usePayrollData.ts`
    - **Navigation**: Typed route parsing and mutation live in `src/app/routes.ts` and `src/app/useAppNavigation.ts`.
    - **Shell Composition**: `src/App.tsx` selects between `src/app/PublicApp.tsx` and `src/app/AuthenticatedApp.tsx`.
    - **Styling**: Tailwind CSS with a consistent theme defined in `tailwind.config.js`.

    ### 2.2 Data Access Layer
    - The original service monolith has been retired as the primary integration point.
    - Focused services now own the main persistence boundaries:
        - `src/services/CompanyService.ts`
        - `src/services/EmployeeService.ts`
        - `src/services/PayrollService.ts`
        - `src/services/BillingService.ts`
        - `src/services/ResellerService.ts`
        - `src/services/UserService.ts`
        - `src/services/AuditService.ts`
    - `src/services/supabaseService.ts` is now a compatibility façade, not the intended entry point for new code.
    - **Security Boundary** ✅: All `getServiceRoleClient()` calls have been removed from frontend code. Operations requiring `SUPABASE_SERVICE_ROLE_KEY` (e.g., `auth.admin.deleteUser`, RLS-bypassing upserts) are now exclusively handled by the `admin-handler` Edge Function. Zero references to `SERVICE_ROLE` remain in `/src`.

    ### 2.3 Business Logic (The "Payroll Engine")
    - **`utils/taxUtils.ts`**: The source of truth for all math related to NIS, NHT, ED TAX, and PAYE.
    - **`hooks/usePayroll.ts`**: Manages the state and lifecycle of a specific Pay Run period.
    - **Feature Hooks**: Workforce, payroll, and company configuration persistence now live closer to their domains.

    ### 2.4 Serverless Logic
    - **Supabase Edge Functions**: Process payslip generation, AI chat grounding, and email dispatch.
    - **Vercel Functions**: Handle webhooks from DimePay and sensitive billing operations.

    ## 3. Data Flow

    ### 3.0 App Shell Boot Flow
    1. `src/App.tsx` reads auth state and route state.
    2. `src/app/useAppNavigation.ts` resolves the active app route from the URL.
    3. `src/app/useAuthRedirects.ts` handles invite tokens, expired verification links, and auth-page redirects.
    4. `src/app/useAppBootstrap.ts` hydrates company, workforce, payroll, and account data.
    5. `src/app/AuthenticatedApp.tsx` or `src/app/PublicApp.tsx` renders the correct shell.

    ### 3.1 Payroll Processing Flow
    1. **Input**: User selects a pay cycle (Weekly/Monthly) and period.
    2. **Expansion**: Payroll and app bootstrap hooks fetch active employees and applicable leave/timesheets.
    3. **Calculation**: `taxUtils` applies Jamaican 2026 tax rules to each line item.
    4. **Validation**: User reviews calculations in the UI, potentially applying manual overrides.
    5. **Persistence**: Pay runs are saved through focused payroll services and feature state hooks.

    ### 3.2 AI Assistant Flow
    1. **Request**: User asks a question to JamBot.
    2. **Grounding**: Client calls `payroll-chat` Edge Function.
    3. **Processing**: Edge Function retrieves relevant context from the DB and pipes it to Gemini 1.5 Flash with a system prompt.
    4. **Response**: Formatted markdown response returned to the UI.

    ## 4. Key Dependencies
    - `@supabase/supabase-js`: Database and Auth.
    - `@google/generative-ai`: Client-side AI interactions.
    - `recharts`: Financial and compliance visualization.
    - `sonner`: User feedback and notifications.
    - `papaparse`: Bulk employee imports via CSV.
    - `vitest` + `jsdom`: App-layer route and hook validation.

    ## 5. Current Quality Snapshot
    - `App.tsx` is now a small composition root instead of a 1000+ line coordinator.
    - Public and authenticated shells are separated.
    - Company, workforce, and payroll state are owned closer to their domains.
    - Route parsing, app navigation, auth redirects, and app-flow handlers have direct automated coverage.
    - **Security**: All service-role operations migrated to Edge Functions (completed 2026-04-22).
    - **Type Safety**: Reduced from 223 → 151 `any` usages (32% reduction, 2026-04-22). DB row types (`DbAppUserRow`, `DbEmployeeRow`, etc.) and coercion helpers (`toRole`, `toPayType`, `toPlanLabel`) added to `core/types.ts`. Services layer at 28 remaining (70% reduction). Residual instances are external SDKs, catch blocks, and test fixtures.
    - Remaining architectural debt is primarily the custom `?page=` router, which is functional and typed but still not a framework router.
