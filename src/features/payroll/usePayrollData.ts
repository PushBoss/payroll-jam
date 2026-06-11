import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PayRun as PayRunType, User, WeeklyTimesheet } from '../../core/types';
import { storage } from '../../services/storage';
import { PayrollService } from '../../services/PayrollService';

interface UsePayrollDataArgs {
  user: User | null;
  isSupabaseMode: boolean;
  activeCompanyId?: string;
}

export const usePayrollData = ({ user, isSupabaseMode, activeCompanyId }: UsePayrollDataArgs) => {
  const [payRunHistory, setPayRunHistory] = useState<PayRunType[]>(() => storage.getPayRuns() || []);
  const [timesheets, setTimesheets] = useState<WeeklyTimesheet[]>(() => storage.getTimesheets() || []);
  const [payRunDetailsLoaded, setPayRunDetailsLoaded] = useState(false);
  const [payRunDetailsLoading, setPayRunDetailsLoading] = useState(false);

  const didMountPayRuns = useRef(false);
  const didMountTimesheets = useRef(false);

  useEffect(() => {
    setPayRunDetailsLoaded(false);
  }, [activeCompanyId, user?.companyId]);

  useEffect(() => {
    if (!didMountPayRuns.current) { didMountPayRuns.current = true; return; }
    storage.savePayRuns(payRunHistory);
  }, [payRunHistory]);

  useEffect(() => {
    if (!didMountTimesheets.current) { didMountTimesheets.current = true; return; }
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
    const targetCompanyId = activeCompanyId || user?.companyId;
    if (isSupabaseMode && targetCompanyId) {
      try {
        await PayrollService.savePayRun(run, targetCompanyId);
        setPayRunHistory((prev) => upsertPayRunLocally(prev, run));
        return true;
      } catch (error: any) {
        console.error('Failed to save pay run to Supabase:', error);
        toast.error(error?.message || 'Failed to save payroll to database. Payslip download may not work.');
        return false;
      }
    }

    setPayRunHistory((prev) => upsertPayRunLocally(prev, run));
    if (run.status === 'DRAFT') {
      toast.warning('Database not configured. Draft saved locally only.');
      return true;
    }

    toast.error('Database not configured. Pay run saved locally only.');
    return false;
  };

  const handleDeletePayRun = async (runId: string) => {
    const targetCompanyId = activeCompanyId || user?.companyId;
    if (!isSupabaseMode || !targetCompanyId) return;

    try {
      const deleted = await PayrollService.deletePayRun(runId, targetCompanyId);
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

  const upsertTimesheetLocally = (savedTimesheets: WeeklyTimesheet[], timesheet: WeeklyTimesheet) => {
    const existingIndex = savedTimesheets.findIndex((saved) => saved.id === timesheet.id);
    if (existingIndex >= 0) {
      const updated = [...savedTimesheets];
      updated[existingIndex] = timesheet;
      return updated;
    }
    return [timesheet, ...savedTimesheets];
  };

  const handleSaveTimesheet = async (timesheet: WeeklyTimesheet): Promise<boolean> => {
    const targetCompanyId = activeCompanyId || user?.companyId || timesheet.companyId;

    if (isSupabaseMode && targetCompanyId) {
      try {
        const saved = await PayrollService.saveTimesheet(timesheet, targetCompanyId);
        setTimesheets((prev) => upsertTimesheetLocally(prev, saved));
        return true;
      } catch (error: any) {
        console.error('Failed to save timesheet to Supabase:', error);
        toast.error(error?.message || 'Failed to save timesheet to database. Saved locally only.');
      }
    }

    setTimesheets((prev) => upsertTimesheetLocally(prev, timesheet));
    return false;
  };

  const loadFullPayRunHistory = useCallback(async () => {
    const targetCompanyId = activeCompanyId || user?.companyId;
    if (!isSupabaseMode || !targetCompanyId || payRunDetailsLoaded || payRunDetailsLoading) return;

    setPayRunDetailsLoading(true);
    try {
      const fullHistory = await PayrollService.getPayRuns(targetCompanyId, { includeLineItems: true });
      setPayRunHistory(fullHistory);
      setPayRunDetailsLoaded(true);
    } catch (error) {
      console.error('Failed to load detailed pay run history:', error);
      toast.error('Could not load detailed pay run history. Reports may be incomplete.');
    } finally {
      setPayRunDetailsLoading(false);
    }
  }, [activeCompanyId, isSupabaseMode, payRunDetailsLoaded, payRunDetailsLoading, user?.companyId]);

  return {
    payRunHistory,
    setPayRunHistory,
    payRunDetailsLoaded,
    payRunDetailsLoading,
    timesheets,
    setTimesheets,
    handleSaveTimesheet,
    handleSavePayRun,
    handleDeletePayRun,
    loadFullPayRunHistory,
  };
};
