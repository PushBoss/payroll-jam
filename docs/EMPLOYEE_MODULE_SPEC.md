# Employee Management Specification

## 1. Overview
- **Name**: Employee Management Module
- **Purpose**: To handle the complete lifecycle of employees and system users, including onboarding, profile updates, status tracking (Active, Pending, Terminated), and secure access invitation generation.
- **Owner Role**: Full-stack / HR Operations

## 2. Technical Scope
- **Directory**: `src/features/employees/`, `src/pages/Employees.tsx`, `src/services/EmployeeService.ts`
- **Key Files**: 
  - `EmployeeManager.tsx`: Core UI modal for creating, updating, and terminating employees.
  - `inviteService.ts`: Secure token generation for magic-link onboarding logic.
  - `EmployeeService.ts`: Supabase database interactions handling CRUD for `app_users` and `employees` tables.
- **Dependencies**: React Hook Form, Supabase SDK, EmailJS/SMTP Service.

## 3. Data Interface
- **Primary Input(s)**: `Employee` profile data (Name, NIS, TRN, Department, Role, Base Salary).
- **Primary Output(s)**: Rehydrated `Employee[]` and `User[]` arrays for application state.
- **Data Model**: `Employee`, `User` interfaces located in `src/core/types.ts`.

## 4. Business Rules
1. **Status Segregation**: Employees are strictly bucketed into `ACTIVE`, `PENDING` (awaiting email verification/onboarding), and `TERMINATED` (archived). Terminated employees cannot receive new payslips or log in.
2. **Invitation Tokens**: Employees invited to the platform receive securely hashed tokens that map their email directly to a pending profile. The token is invalidated upon successful registration completion.
3. **Cross-Referencing**: Every `Employee` entity is linked to a Supabase auth `User` via the `auth_user_id` constraint to enable RBAC (Role-Based Access Control) login.

## 5. Security & Constraints
- **RLS Policies Involved**: `app_users_insert`, `app_users_select` (Constrained to `auth.uid() = id`), and `employees` (Constrained to `company_id`).
- **Validation Schema**: Strict regex matching on Jamaican Statutory IDs (TRN: `/^\d{3}-\d{3}-\d{3}$/`, NIS: `/^[A-Z]\d{6}$/`) inside `EmployeeManager`. "PENDING" is optionally allowed for new hires.
- **Role Permissions**: `EMPLOYEE` role can only READ their own profile; `OWNER`, `RESELLER`, and `ADMIN` can CREATE/UPDATE company employees.

## 6. Implementation Notes
- The "Tax Calculation Configuration" card has been decoupled from the individual `EmployeeManager` modal and moved to `Platform Settings` to ensure global continuity. 

## 7. Risks & Technical Debt
- **Token Expiry**: Relying on URL magic-links implies a need for robust token expiry mechanics. Currently, token leakage could allow unintended account binding if the target email is compromised.

## 8. Testing Strategy
- **Unit Tests**: Test logic rendering tab changes based on missing `TRN`/`NIS` constraints.
- **Integration Tests**: Verify successful Employee insertion triggering a valid `app_users` table sync.
- **Manual Verification**: Test terminating an active employee and ensuring they are instantly isolated to the "Archived" tab.
