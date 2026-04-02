/**
 * Re-export shim for backward compatibility.
 *
 * All new code should import directly from the specific service
 * (EmployeeService, CompanyService, etc.) or invoke the Edge Function.
 *
 * The monolith is in the process of being decommissioned.
 * Do NOT add new methods here — add them to the Edge Function instead.
 */
export { supabaseService } from './supabaseService_monolith_DO_NOT_USE';
