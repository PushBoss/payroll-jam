-- The client (PayrollService.saveTimesheet) and admin-handler
-- (upsertAttendanceTimesheet) both read/write timesheets.employee_name,
-- but the column was never added to the live table, causing every
-- timesheet upsert (manual entry and QR attendance clock-in) to fail
-- with PGRST204 "Could not find the 'employee_name' column".
ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS employee_name TEXT;
