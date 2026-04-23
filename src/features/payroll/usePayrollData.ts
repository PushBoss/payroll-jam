import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
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
  const [timesheets, setTimesheetsState] = useState<WeeklyTimesheet[]>(storage.getTimesheets() || []);
  const timesheetsRef = useRef(timesheets);

  useEffect(() => {
    storage.savePayRuns(payRunHistory);
  }, [payRunHistory]);

  useEffect(() => {
    timesheetsRef.current = timesheets;
  }, [timesheets]);

  useEffect(() => {
    storage.saveTimesheets(timesheets);
  }, [timesheets]);

  useEffect(() => {
    let isMounted = true;

    const loadTimesheets = async () => {
      if (!isSupabaseMode || !user?.companyId) return;

      try {
        const dbTimesheets = await PayrollService.getTimesheets(user.companyId);
        if (!isMounted) return;
        timesheetsRef.current = dbTimesheets;
        setTimesheetsState(dbTimesheets);
      } catch (error) {
        console.error('Failed to load timesheets from Supabase:', error);
      }
    };

    void loadTimesheets();

    return () => {
      isMounted = false;
    };
  }, [isSupabaseMode, user?.companyId]);

  const upsertPayRunLocally = (runs: PayRunType[], run: PayRunType) => {
    const existingIndex = runs.findIndex((savedRun) => savedRun.id === run.id);
    if (existingIndex >= 0) {
      const updated = [...runs];
      updated[existingIndex] = run;
      return updated;
    }
    return [run, ...runs];
  };

  const persistTimesheetChanges = async (previous: WeeklyTimesheet[], next: WeeklyTimesheet[]) => {
    if (!isSupabaseMode || !user?.companyId) return;

    const changedTimesheets = next.filter((timesheet) => {
      const previousTimesheet = previous.find((item) => item.id === timesheet.id);
      return !previousTimesheet || JSON.stringify(previousTimesheet) !== JSON.stringify(timesheet);
    });

    if (changedTimesheets.length === 0) return;

    await Promise.all(changedTimesheets.map((timesheet) => PayrollService.saveTimesheet(timesheet, user.companyId!)));
  };

  const setTimesheets: Dispatch<SetStateAction<WeeklyTimesheet[]>> = (update) => {
    const previous = timesheetsRef.current;
    const next = typeof update === 'function'
      ? (update as (prevState: WeeklyTimesheet[]) => WeeklyTimesheet[])(previous)
      : update;

    timesheetsRef.current = next;
    setTimesheetsState(next);

    if (isSupabaseMode && user?.companyId) {
      void persistTimesheetChanges(previous, next).catch((error: any) => {
        console.error('Failed to persist timesheet changes:', error);
        timesheetsRef.current = previous;
        setTimesheetsState(previous);
        toast.error(error?.message || 'Failed to save timesheet changes to the database.');
      });
    }
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
