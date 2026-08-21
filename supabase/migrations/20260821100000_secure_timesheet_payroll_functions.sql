-- The Timesheet Payroll lifecycle RPCs are called only by the service-role
-- Edge Function after it has verified company membership and permissions.
-- Do not leave SECURITY DEFINER functions executable by browser roles.

REVOKE ALL ON FUNCTION public.create_timesheet_pay_run(uuid, jsonb, uuid[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_timesheet_pay_run_draft(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_timesheet_pay_run(uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_timesheet_pay_run(uuid, jsonb, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_timesheet_pay_run_draft(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_timesheet_pay_run(uuid, uuid, uuid) TO service_role;
