import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PayRun as PayRunType, User, WeeklyTimesheet } from '../../core/types';
import { storage } from '../../services/storage';
import { PayrollService } from '../../services/PayrollService';

interface UsePayrollDataArgs {
  user: User | null;
  isSupabaseMode: boolean;
}

export const usePayrollData = ({ user, isSupabaseMode }: UsePayrollDataArgs) => {
  const [payRunHistory, setPayRunHistory] = useState<PayRunType[]>(storage.getPayRuns() || []);
  const [timesheets, setTimesheets] = useState<WeeklyTimesheet[]>(storage.getTimesheets() || []);

  useEffect(() => {
    storage.savePayRuns(payRunHistory);
  }, [payRunHistory]);

  useEffect(() => {
    storage.saveTimesheets(timesheets);
  }, [timesheets]);

  const upsertPayRunLocally = (runs: PayRunType[], run: PayRunType) => {
    const existingIndex = runs.findIndex((savedRun) => savedRun.id === run.id);
    if (existingIndex >= 0) {
      const updated = [...runs];
      updated[existingIndex] = run;
      return updated;
    }
    return [run, ...runs];
  };

  const handleSavePayRun = async (run: PayRunType): Promise<boolean> => {
    if (isSupabaseMode && user?.companyId) {
      try {
        await PayrollService.savePayRun(run, user.companyId);
        setPayRunHistory((prev) => upsertPayRunLocally(prev, run));
        return true;
      } catch (error: any) {
        console.error('Failed to save pay run to Supabase:', error);
        toast.error(error?.message || 'Failed to save payroll to database. Payslip download may not work.');
        return false;
      }
    }

    setPayRunHistory((prev) => upsertPayRunLocally(prev, run));
    toast.error('Database not configured. Pay run saved locally only.');
    return false;
  };

  const handleDeletePayRun = async (runId: string) => {
    if (!isSupabaseMode || !user?.companyId) return;

    try {
      const deleted = await PayrollService.deletePayRun(runId, user.companyId);
      if (deleted) {
        setPayRunHistory((prev) => prev.filter((run) => run.id !== runId));
        toast.success('Pay run deleted');
      } else {
        toast.error('Failed to delete pay run from database.');
      }
    } catch (error) {
      console.error('Error deleting pay run:', error);
      toast.error('Failed to delete pay run.');
    }
  };

  return {
    payRunHistory,
    setPayRunHistory,
    timesheets,
    setTimesheets,
    handleSavePayRun,
    handleDeletePayRun,
  };
};
