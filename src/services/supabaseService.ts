/**
 * Re-export shim for backward compatibility.
 *
 * The monolith (supabaseService_monolith_DO_NOT_USE.ts) is being progressively
 * split into focused, single-responsibility service modules:
 *
 *   EmployeeService  — employees, leave, timesheets, documents
 *   CompanyService   — company CRUD, config, global config
 *   PayrollService   — pay runs, timesheets
 *   BillingService   — subscriptions, payments
 *   ResellerService  — reseller portfolio, invites, client linking
 *
 * New code should import directly from the specific service, NOT from here.
 * Do NOT add new methods to the monolith.
 */
export { supabaseService } from './supabaseService_monolith_DO_NOT_USE';
export { EmployeeService } from './EmployeeService';
export { CompanyService } from './CompanyService';
export { PayrollService } from './PayrollService';
export { BillingService } from './BillingService';
export { ResellerService } from './ResellerService';
