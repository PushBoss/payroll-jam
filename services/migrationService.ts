/**
 * Data Migration Utility
 * Migrates data from localStorage to Supabase
 */

import { supabase } from '../services/supabaseClient';
import { storage } from '../services/storage';

export const migrationService = {
  /**
   * Check if migration is needed
   */
  needsMigration: (): boolean => {
    const employees = storage.getEmployees();
    const payRuns = storage.getPayRuns();
    const hasLocalData = (employees && employees.length > 0) || (payRuns && payRuns.length > 0);
    return !!hasLocalData;
  },

  /**
   * Migrate all data from localStorage to Supabase
   */
  migrateToSupabase: async (companyId: string): Promise<{
    success: boolean;
    migratedCount: number;
    errors: string[];
  }> => {
    const errors: string[] = [];
    let migratedCount = 0;

    try {
      console.log('🔄 Starting migration from localStorage to Supabase...');

      // 1. Migrate Company Settings
      const companySettings = storage.getCompanyData();
      if (companySettings && supabase) {
        const { error } = await supabase
          .from('companies')
          .upsert({
            id: companyId,
            name: companySettings.name,
            trn: companySettings.trn,
            address: companySettings.address,
            settings: {
              phone: companySettings.phone,
              bankName: companySettings.bankName,
              accountNumber: companySettings.accountNumber,
              branchCode: companySettings.branchCode,
              payFrequency: companySettings.payFrequency,
              defaultPayDate: companySettings.defaultPayDate
            },
            plan: companySettings.plan || 'Free',
            status: companySettings.subscriptionStatus || 'ACTIVE'
          });
        
        if (error) {
          errors.push(`Company settings: ${error.message}`);
        } else {
          migratedCount++;
          console.log('✅ Company settings migrated');
        }
      }

      // 2. Migrate Employees
      const employees = storage.getEmployees();
      if (employees && employees.length > 0) {
      for (const emp of employees) {
        if (!supabase) continue;
        
        const { error } = await supabase
          .from('employees')
          .upsert({
            id: emp.id,
            company_id: companyId,
            first_name: emp.firstName,
            last_name: emp.lastName,
            email: emp.email,
            trn: emp.trn,
            nis: emp.nis,
            status: emp.status,
            role: emp.role,
            hire_date: emp.hireDate,
            job_title: emp.jobTitle,
            department: emp.department,
            phone: emp.phone,
            address: emp.address,
            pay_data: {
              grossSalary: emp.grossSalary,
              hourlyRate: emp.hourlyRate,
              payType: emp.payType,
              payFrequency: emp.payFrequency
            },
            allowances: emp.allowances || [],
            deductions: emp.customDeductions || [],
            leave_balance: emp.leaveBalance || { vacation: 0, sick: 0, personal: 0 },
            bank_details: emp.bankDetails,
            termination_details: emp.terminationDetails,
            onboarding_token: emp.onboardingToken
          });

        if (error) {
          errors.push(`Employee ${emp.firstName} ${emp.lastName}: ${error.message}`);
        } else {
          migratedCount++;
        }
      }
      console.log(`✅ ${employees.length} employees migrated`);
      }

      // 3. Migrate Pay Runs
      const payRuns = storage.getPayRuns();
      if (payRuns && payRuns.length > 0) {
      for (const run of payRuns) {
        if (!supabase) continue;
        
        const { error } = await supabase
          .from('pay_runs')
          .upsert({
            id: run.id,
            company_id: companyId,
            period_start: run.periodStart,
            period_end: run.periodEnd,
            pay_date: run.payDate,
            pay_frequency: 'MONTHLY', // Default
            status: run.status,
            total_gross: run.totalGross,
            total_net: run.totalNet,
            employee_count: run.lineItems?.length || 0,
            line_items: run.lineItems || []
          });

        if (error) {
          errors.push(`Pay run ${run.id}: ${error.message}`);
        } else {
          migratedCount++;
        }
      }
      console.log(`✅ ${payRuns.length} pay runs migrated`);
      }

      // 4. Migrate Leave Requests
      const leaveRequests = storage.getLeaveRequests();
      if (leaveRequests && leaveRequests.length > 0) {
      for (const leave of leaveRequests) {
        if (!supabase) continue;
        
        const { error } = await supabase
          .from('leave_requests')
          .upsert({
            id: leave.id,
            company_id: companyId,
            employee_id: leave.employeeId,
            employee_name: leave.employeeName,
            type: leave.type,
            start_date: leave.startDate,
            end_date: leave.endDate,
            days: leave.days,
            reason: leave.reason,
            status: leave.status,
            requested_dates: leave.requestedDates || [],
            approved_dates: leave.approvedDates || []
          });

        if (error) {
          errors.push(`Leave request ${leave.id}: ${error.message}`);
        } else {
          migratedCount++;
        }
      }
      console.log(`✅ ${leaveRequests.length} leave requests migrated`);
      }

      // 5. Migrate Audit Logs
      const auditLogs = storage.getAuditLogs();
      if (auditLogs && auditLogs.length > 0) {
      for (const log of auditLogs) {
        if (!supabase) continue;
        
        const { error } = await supabase
          .from('audit_logs')
          .insert({
            id: log.id,
            company_id: companyId,
            actor_id: log.actorId,
            actor_name: log.actorName,
            action: log.action,
            entity: log.entity,
            description: log.description,
            timestamp: log.timestamp,
            ip_address: log.ipAddress
          });

        if (error && !error.message.includes('duplicate')) {
          errors.push(`Audit log ${log.id}: ${error.message}`);
        } else {
          migratedCount++;
        }
      }
      console.log(`✅ ${auditLogs.length} audit logs migrated`);
      }

      console.log(`\n✅ Migration complete! ${migratedCount} records migrated`);
      
      if (errors.length > 0) {
        console.warn(`⚠️ ${errors.length} errors occurred during migration`);
      }

      return {
        success: errors.length === 0,
        migratedCount,
        errors
      };

    } catch (error: any) {
      console.error('❌ Migration failed:', error);
      return {
        success: false,
        migratedCount,
        errors: [...errors, error.message]
      };
    }
  },

  /**
   * Backup localStorage data before migration
   */
  backupLocalData: (): string => {
    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      data: {
        companySettings: storage.getCompanyData(),
        employees: storage.getEmployees(),
        payRuns: storage.getPayRuns(),
        leaveRequests: storage.getLeaveRequests(),
        auditLogs: storage.getAuditLogs()
      }
    };

    const backupJson = JSON.stringify(backup, null, 2);
    
    // Create downloadable backup file
    const blob = new Blob([backupJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-jam-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    return backupJson;
  },

  /**
   * Clear localStorage after successful migration
   */
  clearLocalStorage: () => {
    if (confirm('Are you sure you want to clear all local data? Make sure you have a backup!')) {
      storage.clearAll();
      console.log('✅ Local storage cleared');
      return true;
    }
    return false;
  }
};
