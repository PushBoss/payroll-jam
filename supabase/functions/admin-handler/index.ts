// @ts-ignore: Deno remote import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore: Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// @ts-ignore: Deno global
declare const Deno: any;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id',
}

const normalizePlanToFrontend = (plan?: string | null): string => {
    if (!plan) return 'Free';

    const normalized = plan.trim().toLowerCase();
    const planMap: Record<string, string> = {
        free: 'Free',
        starter: 'Starter',
        professional: 'Pro',
        pro: 'Pro',
        enterprise: 'Reseller',
        reseller: 'Reseller'
    };

    return planMap[normalized] || plan;
};

const isResellerEquivalentPlan = (plan?: string | null): boolean =>
    normalizePlanToFrontend(plan) === 'Reseller';

const getPlanMonthlyPricing = (plan?: string | null) => {
    switch (normalizePlanToFrontend(plan)) {
        case 'Starter':
            return { baseFee: 5000, perEmployeeFee: 0 };
        case 'Pro':
            return { baseFee: 10000, perEmployeeFee: 500 };
        case 'Reseller':
            return { baseFee: 3000, perEmployeeFee: 500 };
        default:
            return { baseFee: 0, perEmployeeFee: 0 };
    }
};

const calculatePlanMRR = (plan: string | null | undefined, activeEmployeeCount: number) => {
    const { baseFee, perEmployeeFee } = getPlanMonthlyPricing(plan);
    return baseFee + (Math.max(0, activeEmployeeCount || 0) * perEmployeeFee);
};

const normalizeMemberRole = (role?: string | null): string => {
    if (!role) return 'EMPLOYEE';
    const upper = role.trim().toUpperCase();
    const allowed = new Set(['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'RESELLER', 'SUPER_ADMIN']);
    if (allowed.has(upper)) return upper;
    return 'EMPLOYEE';
};

const isYearMonth = (value?: string | null): value is string =>
    typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);

const toDbPeriodStart = (value?: string | null): string | null => {
    if (!value) return null;
    return isYearMonth(value) ? `${value}-01` : value;
};

const toDbPeriodEnd = (value?: string | null): string | null => {
    if (!value) return null;
    if (!isYearMonth(value)) return value;

    const [yearStr, monthStr] = value.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const lastDay = new Date(year, month, 0).getDate();
    return `${value}-${String(lastDay).padStart(2, '0')}`;
};

const normalizeRole = (role?: string | null): string => (role || '').trim().toUpperCase();
const allowedAppRoles = new Set(['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'RESELLER', 'SUPER_ADMIN']);

const normalizeEmployeeStatus = (status?: string | null): string => {
    const normalized = (status || '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');

    const statusMap: Record<string, string> = {
        ACTIVE: 'ACTIVE',
        ACT: 'ACTIVE',
        CURRENT: 'ACTIVE',
        YES: 'ACTIVE',
        TRUE: 'ACTIVE',
        EMPLOYED: 'ACTIVE',
        ARCHIVED: 'ARCHIVED',
        ARCHIVE: 'ARCHIVED',
        INACTIVE: 'ARCHIVED',
        PENDING: 'PENDING_ONBOARDING',
        PENDING_ONBOARDING: 'PENDING_ONBOARDING',
        ONBOARDING: 'PENDING_ONBOARDING',
        PENDING_VERIFICATION: 'PENDING_VERIFICATION',
        VERIFICATION: 'PENDING_VERIFICATION',
        TERMINATED: 'TERMINATED',
        TERMINATE: 'TERMINATED',
        SEPARATED: 'TERMINATED',
        FORMER: 'TERMINATED',
        NO: 'TERMINATED',
        FALSE: 'TERMINATED'
    };

    return statusMap[normalized] || 'ACTIVE';
};

const assertSuperAdminCaller = async (adminClient: any, authUser: any) => {
    const callerProfile = await getCallerProfile(adminClient, authUser);
    if (normalizeRole(callerProfile.role) !== 'SUPER_ADMIN') {
        throw new Error('Unauthorized: Super Admin required');
    }
    return callerProfile;
};

const getCallerProfile = async (adminClient: any, authUser: any) => {
    if (!authUser?.id) throw new Error('Unauthorized');

    const { data: callerProfileById, error } = await adminClient
        .from('app_users')
        .select('id, name, email, role, company_id')
        .eq('id', authUser.id)
        .maybeSingle();

    if (error) throw error;
    if (callerProfileById) return callerProfileById;

    const email = (authUser.email || '').toString().trim().toLowerCase();
    if (!email) throw new Error('Unauthorized');

    const { data: profilesByEmail, error: emailLookupError } = await adminClient
        .from('app_users')
        .select('id, name, email, role, company_id')
        .ilike('email', email)
        .limit(2);

    if (emailLookupError) throw emailLookupError;
    if (!profilesByEmail || profilesByEmail.length === 0) throw new Error('Unauthorized');
    if (profilesByEmail.length > 1) throw new Error('Multiple app profiles found for authenticated email');

    return profilesByEmail[0];
};

const assertCompanyAccess = async (
    adminClient: any,
    authUser: any,
    companyId: string,
    allowedRoles: string[]
) => {
    const callerProfile = await getCallerProfile(adminClient, authUser);
    const callerRole = normalizeRole(callerProfile.role);

    if (!allowedRoles.includes(callerRole)) {
        throw new Error('Unauthorized');
    }

    if (callerRole === 'SUPER_ADMIN') {
        return callerProfile;
    }

    if ((callerRole === 'OWNER' || callerRole === 'ADMIN' || callerRole === 'MANAGER' || callerRole === 'RESELLER') && callerProfile.company_id === companyId) {
        return callerProfile;
    }

    if (callerRole === 'OWNER' || callerRole === 'ADMIN' || callerRole === 'MANAGER' || callerRole === 'RESELLER') {
        const [{ data: membership, error: membershipError }, { data: company, error: companyError }] = await Promise.all([
            adminClient
                .from('account_members')
                .select('account_id')
                .eq('account_id', companyId)
                .eq('user_id', authUser.id)
                .eq('status', 'accepted')
                .maybeSingle(),
            adminClient
                .from('companies')
                .select('id, owner_id')
                .eq('id', companyId)
                .maybeSingle(),
        ]);

        if (membershipError) throw membershipError;
        if (companyError) throw companyError;
        if (membership || company?.owner_id === authUser.id) {
            return callerProfile;
        }
    }

    if (callerRole === 'RESELLER') {
        const { data: relationship, error: relationshipError } = await adminClient
            .from('reseller_clients')
            .select('client_company_id')
            .eq('reseller_id', callerProfile.company_id)
            .eq('client_company_id', companyId)
            .eq('status', 'ACTIVE')
            .maybeSingle();

        if (relationshipError) throw relationshipError;
        if (relationship) {
            return callerProfile;
        }

        const { data: membership, error: membershipError } = await adminClient
            .from('account_members')
            .select('account_id')
            .eq('account_id', companyId)
            .eq('user_id', authUser.id)
            .eq('status', 'accepted')
            .maybeSingle();

        if (membershipError) throw membershipError;
        if (membership) {
            return callerProfile;
        }
    }

    throw new Error('Unauthorized: No relationship with this company');
};

const ATTENDANCE_SIGNING_CONTEXT = 'payroll-jam-qr-attendance';
const ATTENDANCE_CODE_CONTEXT = 'payroll-jam-attendance-code';
const ATTENDANCE_BADGE_TTL_HOURS = 24 * 7;
const ATTENDANCE_FAILED_ATTEMPT_LIMIT = 5;
const ATTENDANCE_FAILED_ATTEMPT_WINDOW_MINUTES = 10;

const encodeBase64 = (value: string) => btoa(value);
const decodeBase64 = (value: string) => atob(value);

const sha256Hex = async (value: string) => {
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const generateAttendancePassCode = () => {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return String(bytes[0] % 1000000).padStart(6, '0');
};

const hashAttendancePassCode = (companyId: string, locationId: string, passCode: string, codeVersion: number) =>
    sha256Hex(`${companyId}:${locationId}:${passCode}:${codeVersion}:${ATTENDANCE_CODE_CONTEXT}`);

const createClockInSignature = (companyId: string, locationId: string, issuedAt: string, expiresAt: string) =>
    encodeBase64(`${companyId}:${locationId}:${issuedAt}:${expiresAt}:${ATTENDANCE_SIGNING_CONTEXT}`);

const decodeClockInPayload = (encodedPayload?: string | null) => {
    if (!encodedPayload || typeof encodedPayload !== 'string') return null;

    try {
        const payload = JSON.parse(decodeBase64(encodedPayload));
        const companyId = String(payload.company_id || '');
        const locationId = String(payload.location_id || '');
        const issuedAt = String(payload.issued_at || '');
        const expiresAt = String(payload.expires_at || '');
        const expectedSignature = createClockInSignature(companyId, locationId, issuedAt, expiresAt);
        const expiresTime = new Date(expiresAt).getTime();

        if (!companyId || !locationId || payload.signature !== expectedSignature) return null;
        if (!Number.isFinite(expiresTime) || expiresTime < Date.now()) return null;

        return { companyId, locationId, issuedAt, expiresAt };
    } catch {
        return null;
    }
};

const getWeekBounds = (date: Date) => {
    const monday = new Date(date);
    const dayOfWeek = monday.getUTCDay();
    monday.setUTCDate(monday.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    return {
        weekStartDate: monday.toISOString().slice(0, 10),
        weekEndDate: sunday.toISOString().slice(0, 10),
    };
};

const toTimeValue = (date: Date) => date.toISOString().slice(11, 16);

const calculateHaversineDistanceMeters = (
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number }
) => {
    const earthRadiusMeters = 6371000;
    const toRadians = (value: number) => value * Math.PI / 180;
    const dLat = toRadians(to.latitude - from.latitude);
    const dLon = toRadians(to.longitude - from.longitude);
    const lat1 = toRadians(from.latitude);
    const lat2 = toRadians(to.latitude);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusMeters * c;
};

const summarizeTimeEntries = (entries: any[]) => entries.reduce(
    (summary, entry) => {
        const totalHours = coerceFiniteNumber(entry?.totalHours, 0);
        const regular = Math.min(totalHours, 8);
        const overtime = Math.max(0, totalHours - regular);
        return {
            regular: Number((summary.regular + regular).toFixed(2)),
            overtime: Number((summary.overtime + overtime).toFixed(2)),
        };
    },
    { regular: 0, overtime: 0 }
);

const mapTimesheetRowToApp = (row: Record<string, any>) => ({
    id: String(row.id || ''),
    employeeId: String(row.employee_id || row.employeeId || ''),
    employeeName: String(row.employee_name || row.employeeName || ''),
    weekStartDate: String(row.week_start_date || row.weekStartDate || ''),
    weekEndDate: String(row.week_end_date || row.weekEndDate || ''),
    status: row.status || 'DRAFT',
    totalRegularHours: Number(row.total_regular_hours ?? row.totalRegularHours ?? 0),
    totalOvertimeHours: Number(row.total_overtime_hours ?? row.totalOvertimeHours ?? 0),
    entries: Array.isArray(row.entries) ? row.entries : [],
    source: row.source || 'MANUAL',
    companyId: row.company_id || row.companyId || undefined,
    locationId: row.location_id || row.locationId || undefined,
    locationName: row.location_name || row.locationName || undefined,
    clockInAt: row.clock_in_at || row.clockInAt || undefined,
});

const getActiveLocation = async (adminClient: any, companyId: string, locationId: string) => {
    const { data: location, error } = await adminClient
        .from('company_locations')
        .select('id, company_id, name, latitude, longitude, geofence_radius_meters, is_active')
        .eq('id', locationId)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle();

    if (error) throw error;
    if (!location) throw new Error('Active branch location not found');
    return location;
};

const logAttendanceAttempt = async (
    adminClient: any,
    attempt: {
        companyId: string;
        locationId?: string | null;
        employeeId?: string | null;
        userId?: string | null;
        method: 'QR' | 'PASS_CODE';
        status: 'SUCCESS' | 'FAILED';
        reason?: string | null;
        ipAddress?: string | null;
    }
) => {
    const { error } = await adminClient.from('attendance_attempts').insert({
        company_id: attempt.companyId,
        location_id: attempt.locationId || null,
        employee_id: attempt.employeeId || null,
        user_id: attempt.userId || null,
        method: attempt.method,
        status: attempt.status,
        reason: attempt.reason || null,
        ip_address: attempt.ipAddress || null,
    });
    if (error) console.error('Failed to log attendance attempt:', error);
};

const assertAttendanceThrottle = async (adminClient: any, companyId: string, userId: string) => {
    const since = new Date(Date.now() - (ATTENDANCE_FAILED_ATTEMPT_WINDOW_MINUTES * 60 * 1000)).toISOString();
    const { count, error } = await adminClient
        .from('attendance_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('user_id', userId)
        .eq('status', 'FAILED')
        .gte('created_at', since);

    if (error) throw error;
    if ((count || 0) >= ATTENDANCE_FAILED_ATTEMPT_LIMIT) {
        throw new Error('Too many failed attendance attempts. Try again in a few minutes.');
    }
};

const resolveAttendanceLocation = async (
    adminClient: any,
    companyId: string,
    method: 'QR' | 'PASS_CODE',
    payload: Record<string, any>
) => {
    if (method === 'QR') {
        const decodedPayload = decodeClockInPayload(payload.qrPayload);
        if (!decodedPayload || decodedPayload.companyId !== companyId) {
            throw new Error('Invalid or expired QR code');
        }
        return getActiveLocation(adminClient, companyId, decodedPayload.locationId);
    }

    const locationId = String(payload.locationId || '');
    const passCode = String(payload.passCode || '').replace(/\D/g, '');
    if (!locationId || passCode.length !== 6) throw new Error('A valid branch and 6-digit pass code are required');

    const location = await getActiveLocation(adminClient, companyId, locationId);
    const { data: badge, error } = await adminClient
        .from('attendance_badges')
        .select('id, pass_code_hash, code_version, expires_at')
        .eq('company_id', companyId)
        .eq('location_id', locationId)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

    if (error) throw error;
    if (!badge) throw new Error('Pass code expired. Ask your manager for a new badge.');

    const candidateHash = await hashAttendancePassCode(companyId, locationId, passCode, Number(badge.code_version || 1));
    if (candidateHash !== badge.pass_code_hash) throw new Error('Invalid pass code');

    return location;
};

const assertAttendanceCaller = async (
    adminClient: any,
    authUser: any,
    companyId: string,
    employeeId: string
) => {
    const callerProfile = await getCallerProfile(adminClient, authUser);
    const callerRole = normalizeRole(callerProfile.role);

    const { data: employee, error } = await adminClient
        .from('employees')
        .select('id, first_name, last_name, email, status, company_id')
        .eq('id', employeeId)
        .eq('company_id', companyId)
        .maybeSingle();

    if (error) throw error;
    if (!employee) throw new Error('Employee not found for this company');
    if (['ARCHIVED', 'TERMINATED'].includes(normalizeEmployeeStatus(employee.status))) {
        throw new Error('Attendance is unavailable for archived or terminated employees.');
    }

    if (callerRole === 'EMPLOYEE') {
        const employeeEmail = String(employee.email || '').trim().toLowerCase();
        const authEmail = String(authUser?.email || callerProfile.email || '').trim().toLowerCase();
        if (callerProfile.company_id !== companyId || !employeeEmail || employeeEmail !== authEmail) {
            throw new Error('Unauthorized');
        }
        return { callerProfile, employee };
    }

    await assertCompanyAccess(adminClient, authUser, companyId, ['OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN']);
    return { callerProfile, employee };
};

const upsertAttendanceTimesheet = async (
    adminClient: any,
    args: {
        companyId: string;
        employeeId: string;
        employeeName: string;
        locationId: string;
        locationName: string;
        shiftId: string;
        clockInAt: string;
        clockOutAt?: string | null;
        method: 'QR' | 'PASS_CODE';
    }
) => {
    const clockInDate = new Date(args.clockInAt);
    const { weekStartDate, weekEndDate } = getWeekBounds(clockInDate);
    const timesheetId = `TS-ATT-${args.employeeId}-${weekStartDate}`;
    const entryId = `ENTRY-SHIFT-${args.shiftId}`;

    const { data: existing, error: existingError } = await adminClient
        .from('timesheets')
        .select('*')
        .eq('id', timesheetId)
        .eq('company_id', args.companyId)
        .maybeSingle();

    if (existingError) throw existingError;

    const clockOutDate = args.clockOutAt ? new Date(args.clockOutAt) : null;
    const totalHours = clockOutDate
        ? Number(Math.max(0, (clockOutDate.getTime() - clockInDate.getTime()) / 36e5).toFixed(2))
        : 0;
    const nextEntry = {
        id: entryId,
        date: clockInDate.toISOString().slice(0, 10),
        startTime: toTimeValue(clockInDate),
        endTime: clockOutDate ? toTimeValue(clockOutDate) : '',
        breakDuration: 0,
        totalHours,
        isOvertime: totalHours > 8,
        source: args.method,
        shiftId: args.shiftId,
    };
    const existingEntries = Array.isArray(existing?.entries) ? existing.entries : [];
    const entryIndex = existingEntries.findIndex((entry: any) => entry?.id === entryId);
    const entries = entryIndex >= 0
        ? existingEntries.map((entry: any, index: number) => index === entryIndex ? nextEntry : entry)
        : [...existingEntries, nextEntry];
    const totals = summarizeTimeEntries(entries);

    const payload = {
        id: timesheetId,
        company_id: args.companyId,
        employee_id: args.employeeId,
        employee_name: args.employeeName,
        week_start_date: weekStartDate,
        week_end_date: weekEndDate,
        status: 'SUBMITTED',
        total_regular_hours: totals.regular,
        total_overtime_hours: totals.overtime,
        entries,
        source: 'AUTO_QR',
        location_id: args.locationId,
        location_name: args.locationName,
        clock_in_at: existing?.clock_in_at || args.clockInAt,
        submitted_at: new Date().toISOString(),
    };

    const { data: saved, error: saveError } = await adminClient
        .from('timesheets')
        .upsert(payload)
        .select('*')
        .maybeSingle();

    if (saveError) throw saveError;
    return mapTimesheetRowToApp(saved || payload);
};

const coerceFiniteNumber = (value: unknown, fallback = 0) => {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : fallback;
};

const parseJsonArrayIfNeeded = (value: unknown): unknown[] | null => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return null;

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const normalizeCustomDeductions = (value: unknown) => {
    const arr = parseJsonArrayIfNeeded(value) ?? (Array.isArray(value) ? value : []);
    return arr
        .filter(Boolean)
        .map((raw: Record<string, unknown>) => {
            const periodType = raw?.periodType === 'TARGET_BALANCE' ? 'TARGET_BALANCE' : 'FIXED_TERM';
            return {
                id: String(raw?.id ?? `deduction_${Date.now()}`),
                name: String(raw?.name ?? ''),
                amount: coerceFiniteNumber(raw?.amount, 0),
                periodType,
                remainingTerm: raw?.remainingTerm === undefined ? undefined : coerceFiniteNumber(raw?.remainingTerm, 0),
                periodFrequency: raw?.periodFrequency,
                currentBalance: raw?.currentBalance === undefined ? undefined : coerceFiniteNumber(raw?.currentBalance, 0),
                targetBalance: raw?.targetBalance === undefined ? undefined : coerceFiniteNumber(raw?.targetBalance, 0)
            };
        })
        .filter((deduction) => deduction.name && coerceFiniteNumber(deduction.amount, 0) > 0);
};

const isMissingRpcError = (error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined) => {
    const code = String(error?.code || '').toUpperCase();
    const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return code === 'PGRST202'
        || code === '42883'
        || message.includes('could not find the function')
        || message.includes('function') && message.includes('does not exist');
};

const normalizeSimpleDeductions = (value: unknown) => {
    const arr = parseJsonArrayIfNeeded(value) ?? (Array.isArray(value) ? value : []);
    return arr
        .filter(Boolean)
        .map((raw: Record<string, unknown>) => ({
            id: String(raw?.id ?? `other_${Date.now()}`),
            name: String(raw?.name ?? ''),
            amount: coerceFiniteNumber(raw?.amount, 0)
        }))
        .filter((deduction) => deduction.name && coerceFiniteNumber(deduction.amount, 0) > 0);
};

const buildEmployeePayload = (employee: Record<string, any>, companyId: string, mode: 'insert' | 'update' | 'upsert') => {
    const payData = {
        grossSalary: employee.grossSalary,
        hourlyRate: employee.hourlyRate,
        pieceRateAmount: employee.payType === 'PIECE_RATE' ? employee.pieceRateAmount : undefined,
        payType: employee.payType,
        payFrequency: employee.payFrequency
    };

    const normalizedCustomDeductions = normalizeCustomDeductions(employee.customDeductions);
    const normalizedSimpleDeductions = normalizeSimpleDeductions(employee.deductions);
    const persistedDeductions = normalizedCustomDeductions.length > 0
        ? normalizedCustomDeductions
        : normalizedSimpleDeductions;

    const basePayload: Record<string, unknown> = {
        ...(mode === 'update' ? {} : { id: employee.id, company_id: companyId }),
        first_name: employee.firstName,
        last_name: employee.lastName,
        email: employee.email,
        trn: employee.trn,
        nis: employee.nis,
        phone: employee.phone || null,
        address: employee.address || null,
        role: employee.role,
        status: normalizeEmployeeStatus(employee.status),
        hire_date: employee.hireDate,
        joining_date: employee.joiningDate || employee.hireDate,
        job_title: employee.jobTitle || null,
        department: employee.department || null,
        employee_type: employee.employeeType || 'STAFF',
        emergency_contact: employee.emergencyContact || null,
        bank_details: employee.bankDetails || null,
        leave_balance: employee.leaveBalance || null,
        allowances: employee.allowances || [],
        termination_details: employee.terminationDetails || null,
        onboarding_token: employee.onboardingToken || null
    };

    return {
        ...basePayload,
        gross_salary: employee.grossSalary,
        hourly_rate: employee.hourlyRate ?? null,
        pay_type: employee.payType,
        pay_frequency: employee.payFrequency,
        pay_data: payData,
        custom_deductions: persistedDeductions,
        deductions: persistedDeductions,
        employee_id: employee.employeeId || null,
        employee_number: employee.employeeId || null
    };
};

const toBillingGift = (value: unknown) => {
    if (!value || typeof value !== 'object') return null;

    const raw = value as Record<string, unknown>;
    const giftedUntil = typeof raw.giftedUntil === 'string' ? raw.giftedUntil : '';
    const grantedAt = typeof raw.grantedAt === 'string' ? raw.grantedAt : '';
    const grantedBy = typeof raw.grantedBy === 'string' ? raw.grantedBy : '';
    const monthsGranted = typeof raw.monthsGranted === 'number'
        ? raw.monthsGranted
        : Number(raw.monthsGranted);

    if (!giftedUntil || !grantedAt || !grantedBy || !Number.isFinite(monthsGranted)) {
        return null;
    }

    return {
        giftedUntil,
        grantedAt,
        grantedBy,
        grantedByName: typeof raw.grantedByName === 'string' ? raw.grantedByName : undefined,
        monthsGranted,
        note: typeof raw.note === 'string' ? raw.note : undefined,
        employeeLimitOverride: typeof raw.employeeLimitOverride === 'string'
            ? raw.employeeLimitOverride
            : undefined,
    };
};

const isBillingGiftActive = (billingGift: ReturnType<typeof toBillingGift>, now = new Date()) => {
    if (!billingGift?.giftedUntil) return false;

    const giftedUntil = new Date(billingGift.giftedUntil);
    return Number.isFinite(giftedUntil.getTime()) && giftedUntil.getTime() >= now.getTime();
};

const addMonths = (date: Date, months: number) => {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
};

const toTimestamp = (value?: string | null) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
};

const getAuthActivityForUser = async (adminClient: any, userId?: string | null) => {
    if (!userId) {
        return { accountCreatedAt: null, lastLoginAt: null };
    }

    const { data, error } = await adminClient.auth.admin.getUserById(userId);
    if (error || !data?.user) {
        console.warn('Unable to load auth activity for user', userId, error?.message || error);
        return { accountCreatedAt: null, lastLoginAt: null };
    }

    return {
        accountCreatedAt: data.user.created_at || null,
        lastLoginAt: data.user.last_sign_in_at || null
    };
};

const sortByClientActivity = <T extends { createdAt?: string | null; accountCreatedAt?: string | null; lastLoginAt?: string | null }>(
    records: T[],
    sort?: string
) => {
    const selectedSort = sort || 'created_desc';

    return [...records].sort((a, b) => {
        const createdA = toTimestamp(a.accountCreatedAt || a.createdAt);
        const createdB = toTimestamp(b.accountCreatedAt || b.createdAt);
        const loginA = toTimestamp(a.lastLoginAt);
        const loginB = toTimestamp(b.lastLoginAt);

        switch (selectedSort) {
            case 'created_asc':
                return createdA - createdB;
            case 'last_login_desc':
                return loginB - loginA;
            case 'last_login_asc':
                return loginA - loginB;
            case 'created_desc':
            default:
                return createdB - createdA;
        }
    });
};

const normalizeSignupEmail = (email?: string | null) => String(email || '').trim().toLowerCase();

const assertSignupAuthUser = async (
    adminClient: any,
    userId: string,
    email: string,
    signupFinalizeToken?: string | null,
    callerAuthUser?: any
) => {
    const normalizedEmail = normalizeSignupEmail(email);
    if (!userId) throw new Error('userId is required');
    if (!normalizedEmail) throw new Error('email is required');

    const { data: authUserResult, error: authUserError } = await adminClient.auth.admin.getUserById(userId);
    if (authUserError || !authUserResult?.user) {
        throw new Error('Signup user not found in auth.users');
    }

    if (normalizeSignupEmail(authUserResult.user.email) !== normalizedEmail) {
        throw new Error('Signup profile email mismatch');
    }

    const isAuthenticatedSelfRecovery = callerAuthUser?.id === userId
        && normalizeSignupEmail(callerAuthUser?.email) === normalizedEmail;
    const expectedToken = authUserResult.user.user_metadata?.signup_finalize_token;
    const hasValidFinalizeToken = Boolean(signupFinalizeToken && expectedToken === signupFinalizeToken);

    if (!hasValidFinalizeToken && !isAuthenticatedSelfRecovery) {
        throw new Error('Invalid signup finalization token');
    }

    return { authUser: authUserResult.user, normalizedEmail };
};

const deriveCompanySignupRole = (plan?: string | null) =>
    isResellerEquivalentPlan(plan) ? 'RESELLER' : 'OWNER';

const toAppUserResponse = (row: any) => row ? {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    companyId: row.company_id,
    isOnboarded: row.is_onboarded,
    avatarUrl: row.avatar_url,
    phone: row.phone,
} : null;

const assertSuperAdmin = async (adminClient: any, authUser: any) => {
    if (!authUser) throw new Error('Unauthorized');

    const callerProfile = await getCallerProfile(adminClient, authUser);
    if (normalizeRole(callerProfile.role) !== 'SUPER_ADMIN') {
        throw new Error('Unauthorized');
    }

    return callerProfile;
};

serve(async (req: Request) => {
    // 1. CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const rawBody = await req.text();
        if (!rawBody) throw new Error("Request body is empty");
        const { action, payload } = JSON.parse(rawBody);

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        if (!supabaseUrl) {
            throw new Error('Missing SUPABASE_URL in function environment');
        }

        if (!supabaseServiceKey) {
            throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY secret for admin operations');
        }

        // Create the admin client to bypass RLS
        const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            }
        });

        // Optional: Check caller authorization
        // We require the client to send a valid auth token
        const authHeader = req.headers.get('Authorization');
        let authUser: any = null;
        if (authHeader) {
            const token = authHeader.replace('Bearer ', '');
            // We use the regular getUser using the token to identify the caller
            const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
            if (!authError && user) {
                authUser = user;
            }
        }
        const requestIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || req.headers.get('cf-connecting-ip')
            || null;

        // --- Handle Actions ---
        
        switch (action) {
            case 'onboard-confirmed-user': {
                const { email, password, name, role, signupFinalizeToken } = payload || {};
                const normalizedEmail = normalizeSignupEmail(email);
                const normalizedName = String(name || '').trim();
                const normalizedRole = normalizeMemberRole(role || 'MANAGER');

                if (!normalizedEmail.includes('@')) throw new Error('Invalid email address');
                if (!password || typeof password !== 'string') throw new Error('Password is required');
                if (!allowedAppRoles.has(normalizedRole)) throw new Error('Invalid role for signup user');
                if (!signupFinalizeToken || typeof signupFinalizeToken !== 'string') throw new Error('signupFinalizeToken is required');

                const { data, error } = await adminClient.auth.admin.createUser({
                    email: normalizedEmail,
                    password,
                    email_confirm: true,
                    user_metadata: {
                        full_name: normalizedName,
                        name: normalizedName,
                        role: normalizedRole,
                        signup_flow: 'invitation_signup',
                        signup_finalize_token: signupFinalizeToken,
                    },
                });

                if (error) throw error;

                return new Response(JSON.stringify({ user: data.user }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'finalize-signup': {
                const {
                    userId,
                    email,
                    name,
                    phone,
                    signupFinalizeToken,
                    intent,
                    company,
                    verifyEmail = false,
                    acceptPendingInvitations = false,
                    resellerInviteToken,
                } = payload || {};

                const { normalizedEmail } = await assertSignupAuthUser(adminClient, userId, email, signupFinalizeToken, authUser);
                const normalizedName = String(name || '').trim() || normalizedEmail.split('@')[0];
                const normalizedPhone = phone ? String(phone).trim() : null;
                const signupIntent = intent === 'company_signup' || company?.companyId ? 'company_signup' : 'invitation_signup';
                const ownerContextRoles = new Set(['OWNER', 'RESELLER', 'SUPER_ADMIN']);

                const getExistingProfile = async () => {
                    const { data: byId, error: byIdError } = await adminClient
                        .from('app_users')
                        .select('id, email, role, company_id')
                        .eq('id', userId)
                        .maybeSingle();
                    if (byIdError) throw byIdError;
                    if (byId) return byId;

                    const { data: byEmail, error: byEmailError } = await adminClient
                        .from('app_users')
                        .select('id, email, role, company_id')
                        .eq('email', normalizedEmail)
                        .maybeSingle();
                    if (byEmailError) throw byEmailError;
                    return byEmail;
                };

                if (signupIntent === 'company_signup') {
                    const {
                        companyId,
                        name: companyName,
                        trn,
                        address,
                        plan,
                        billingCycle,
                        employeeLimit,
                        status,
                        settings,
                    } = company || {};

                    if (!companyId || !companyName) {
                        throw new Error('companyId and company name are required for company signup');
                    }

                    const derivedRole = deriveCompanySignupRole(plan);
                    const existingProfile = await getExistingProfile();

                    if (
                        existingProfile?.company_id &&
                        existingProfile.company_id !== companyId
                    ) {
                        throw new Error('This email is already connected to another Payroll-Jam account. Use a different email for company signup until account switching is available.');
                    }

                    if (
                        existingProfile?.company_id === companyId &&
                        !ownerContextRoles.has(normalizeMemberRole(existingProfile.role))
                    ) {
                        throw new Error('This email is already connected to an employee account. Use a different email for company signup until account switching is available.');
                    }

                    const { data: employeeEmailMatches, error: employeeEmailError } = await adminClient
                        .from('employees')
                        .select('id, company_id')
                        .ilike('email', normalizedEmail);

                    if (employeeEmailError) throw employeeEmailError;
                    if ((employeeEmailMatches || []).some((employee: any) => employee.company_id !== companyId)) {
                        throw new Error('This email is already listed as an employee in another company. Use a different email for company signup until account switching is available.');
                    }

                    const { error: profileError } = await adminClient
                        .from('app_users')
                        .upsert({
                            id: userId,
                            auth_user_id: userId,
                            email: normalizedEmail,
                            name: normalizedName,
                            role: derivedRole,
                            company_id: null,
                            is_onboarded: false,
                            phone: normalizedPhone,
                        }, { onConflict: 'id' });

                    if (profileError) throw profileError;

                    const { data: savedCompany, error: companyError } = await adminClient
                        .from('companies')
                        .upsert({
                            id: companyId,
                            owner_id: userId,
                            name: String(companyName || '').trim(),
                            email: normalizedEmail,
                            trn: trn || '',
                            address: address || '',
                            plan: plan || 'FREE',
                            billing_cycle: billingCycle || 'MONTHLY',
                            employee_limit: employeeLimit ?? 999999,
                            status: status || 'ACTIVE',
                            settings: settings || {},
                        })
                        .select('*')
                        .single();

                    if (companyError) throw companyError;

                    const { data: linkedUser, error: linkError } = await adminClient
                        .from('app_users')
                        .update({
                            role: derivedRole,
                            company_id: companyId,
                            phone: normalizedPhone,
                        })
                        .eq('id', userId)
                        .select('*')
                        .maybeSingle();

                    if (linkError) throw linkError;

                    await adminClient.from('account_members').upsert({
                        account_id: companyId,
                        user_id: userId,
                        email: normalizedEmail,
                        role: 'OWNER',
                        status: 'accepted',
                        accepted_at: new Date().toISOString(),
                        invited_at: new Date().toISOString(),
                    }, { onConflict: 'account_id,email' });

                    let resellerInviteAccepted = false;
                    if (resellerInviteToken) {
                        const { data: accepted, error: inviteError } = await adminClient.rpc('accept_reseller_invite', {
                            p_invite_token: resellerInviteToken,
                            p_company_id: companyId,
                        });
                        if (inviteError) {
                            console.error('Failed to accept reseller invite during signup finalization:', inviteError);
                        }
                        resellerInviteAccepted = accepted === true;
                    }

                    return new Response(JSON.stringify({
                        success: true,
                        user: toAppUserResponse(linkedUser),
                        company: savedCompany,
                        acceptedInvitations: [],
                        acceptedCount: 0,
                        resellerInviteAccepted,
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                const { data: pendingInvitations, error: invitationError } = await adminClient
                    .from('account_members')
                    .select(`id, account_id, role, email, status, invited_at,
                        companies:account_id (name, plan)
                    `)
                    .eq('email', normalizedEmail)
                    .eq('status', 'pending')
                    .order('invited_at', { ascending: false });

                if (invitationError) throw invitationError;
                if (!pendingInvitations || pendingInvitations.length === 0) {
                    throw new Error('No pending invitation found for this signup email');
                }

                const primaryInvitation = pendingInvitations[0];
                let derivedRole = normalizeMemberRole(primaryInvitation.role);
                const primaryCompany = Array.isArray(primaryInvitation.companies)
                    ? primaryInvitation.companies[0]
                    : primaryInvitation.companies;
                if (derivedRole === 'OWNER' && primaryCompany && isResellerEquivalentPlan(primaryCompany.plan)) {
                    derivedRole = 'RESELLER';
                }

                const existingProfile = await getExistingProfile();
                const existingRole = normalizeMemberRole(existingProfile?.role);
                if (
                    existingProfile?.company_id &&
                    (
                        existingProfile.company_id !== primaryInvitation.account_id ||
                        ownerContextRoles.has(existingRole)
                    )
                ) {
                    throw new Error('This email is already connected to another Payroll-Jam account. Account switching is planned for version 2.0; use a different email for this invitation for now.');
                }

                const { data: savedProfile, error: inviteProfileError } = await adminClient
                    .from('app_users')
                    .upsert({
                        id: userId,
                        auth_user_id: userId,
                        email: normalizedEmail,
                        name: normalizedName,
                        role: derivedRole,
                        company_id: primaryInvitation.account_id,
                        is_onboarded: true,
                        phone: normalizedPhone,
                    }, { onConflict: 'id' })
                    .select('*')
                    .maybeSingle();

                if (inviteProfileError) throw inviteProfileError;

                let acceptedCount = 0;
                if (acceptPendingInvitations) {
                    const invitationIds = pendingInvitations.map((inv: any) => inv.id);
                    const { data: acceptedRows, error: acceptError } = await adminClient
                        .from('account_members')
                        .update({
                            status: 'accepted',
                            user_id: userId,
                            accepted_at: new Date().toISOString(),
                        })
                        .in('id', invitationIds)
                        .eq('email', normalizedEmail)
                        .select('id');

                    if (acceptError) throw acceptError;
                    acceptedCount = acceptedRows?.length || 0;
                }

                if (verifyEmail) {
                    await adminClient.auth.admin.updateUserById(userId, { email_confirm: true });
                }

                return new Response(JSON.stringify({
                    success: true,
                    user: toAppUserResponse(savedProfile),
                    acceptedInvitations: pendingInvitations,
                    acceptedCount,
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'ensure-self-profile': {
                if (!authUser) throw new Error('Unauthorized');

                const email = (authUser.email || '').toString().trim().toLowerCase();
                if (!email) throw new Error('Authenticated user missing email');

                // If profile already exists by id, return it
                const { data: existingById } = await adminClient
                    .from('app_users')
                    .select('*')
                    .eq('id', authUser.id)
                    .maybeSingle();

                if (existingById) {
                    return new Response(JSON.stringify({ user: existingById, created: false }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                // Infer company + role from accepted memberships
                let companyId: string | null = null;
                const metadataRole = normalizeRole(
                    authUser?.app_metadata?.role || authUser?.user_metadata?.role || null
                );
                let role: string = normalizeMemberRole(
                    metadataRole || 'OWNER'
                );

                const { data: membership } = await adminClient
                    .from('account_members')
                    .select('account_id, role, status, accepted_at')
                    .eq('email', email)
                    .eq('status', 'accepted')
                    .order('accepted_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (membership?.account_id) {
                    companyId = membership.account_id;
                    const baseRole = normalizeMemberRole(membership.role);
                    if (baseRole === 'OWNER') {
                        const { data: company } = await adminClient
                            .from('companies')
                            .select('plan')
                            .eq('id', companyId)
                            .maybeSingle();
                        if (company && isResellerEquivalentPlan(company.plan)) {
                            role = 'RESELLER';
                        } else {
                            role = 'OWNER';
                        }
                    } else {
                        role = baseRole;
                    }
                } else {
                    // Fallback: if they own a company, treat as OWNER or RESELLER
                    const { data: ownedCompany } = await adminClient
                        .from('companies')
                        .select('id, plan')
                        .eq('owner_id', authUser.id)
                        .maybeSingle();
                    if (ownedCompany?.id) {
                        companyId = ownedCompany.id;
                        role = isResellerEquivalentPlan(ownedCompany.plan) ? 'RESELLER' : 'OWNER';
                    }
                }

                // If we still cannot infer company context and role resolved to EMPLOYEE,
                // default to OWNER for self-signup recovery flows to avoid detached
                // employee-style profiles being created accidentally.
                if (!companyId && role === 'EMPLOYEE') role = 'OWNER';

                const name =
                    (authUser.user_metadata?.full_name || authUser.user_metadata?.name || '').toString().trim() ||
                    email.split('@')[0];

                const record = {
                    id: authUser.id,
                    auth_user_id: authUser.id,
                    email,
                    name,
                    role,
                    company_id: companyId,
                    is_onboarded: false,
                };

                const { data: upserted, error: upsertError } = await adminClient
                    .from('app_users')
                    .upsert(record)
                    .select('*')
                    .maybeSingle();

                if (upsertError) throw upsertError;

                return new Response(JSON.stringify({ user: upserted, created: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'search-user': {
                const { email } = payload;
                if (!email) throw new Error("Email required for search");
                
                // Get user ID using RPC (safe against RLS)
                const { data: userId, error: rpcError } = await adminClient.rpc('get_user_id_by_email', {
                    email_input: email.toLowerCase()
                });
                
                if (rpcError || !userId) {
                    return new Response(JSON.stringify({ exists: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
                
                const { data: userProfile } = await adminClient
                    .from('app_users')
                    .select('role, company_id')
                    .eq('id', userId)
                    .maybeSingle();

                return new Response(JSON.stringify({
                    exists: true,
                    userId,
                    role: userProfile?.role,
                    companyId: userProfile?.company_id
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            
            case 'create-super-admin': {
                if (!payload || typeof payload !== 'object') {
                    throw new Error('Missing payload for create-super-admin');
                }

                const { email, password, name } = payload;
                if (!email || typeof email !== 'string') throw new Error('Email is required');
                if (!password || typeof password !== 'string') throw new Error('Password is required');

                const normalizedEmail = email.trim().toLowerCase();
                const normalizedName = typeof name === 'string' ? name.trim() : '';
                const normalizedRole = 'SUPER_ADMIN';

                if (!normalizedEmail.includes('@')) {
                    throw new Error('Invalid email address');
                }

                if (password.length < 6) {
                    throw new Error('Password must be at least 6 characters');
                }

                // Only allow this if perhaps we don't have strict authUser constraints, or specifically reseller/owner
                const { data, error } = await adminClient.auth.admin.createUser({
                    email: normalizedEmail,
                    password,
                    email_confirm: true,
                    user_metadata: {
                        full_name: normalizedName
                    }
                });
                
                if (error) throw error;

                if (!allowedAppRoles.has(normalizedRole)) {
                    throw new Error('Invalid role for app_users profile');
                }

                const userId = data.user?.id;
                if (!userId) throw new Error('No user id returned from auth create');

                const { error: profileError } = await adminClient
                    .from('app_users')
                    .insert({
                        id: userId,
                        auth_user_id: userId,
                        email: normalizedEmail,
                        name: normalizedName,
                        role: normalizedRole,
                        is_onboarded: true,
                    });

                if (profileError) {
                    await adminClient.auth.admin.deleteUser(userId);
                    throw profileError;
                }

                return new Response(JSON.stringify({ user: data.user }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            case 'create-company': {
                // Creates a company record during signup when the caller has no active session yet.
                // Uses service_role (adminClient) to bypass RLS.
                const {
                    companyId, ownerId, name, email, trn, address, plan,
                    billingCycle, employeeLimit, status, settings
                } = payload;

                if (!companyId || !ownerId || !name) {
                    throw new Error('companyId, ownerId, and name are required');
                }

                // Verify the owner exists in auth.users to prevent abuse
                const { data: authOwner, error: ownerCheckError } = await adminClient.auth.admin.getUserById(ownerId);
                if (ownerCheckError || !authOwner?.user) {
                    throw new Error('Owner user not found in auth.users');
                }

                const { data: company, error: companyError } = await adminClient
                    .from('companies')
                    .upsert({
                        id: companyId,
                        owner_id: ownerId,
                        name: (name || '').trim(),
                        email: email ? String(email).trim().toLowerCase() : null,
                        trn: trn || '',
                        address: address || '',
                        plan: plan || 'FREE',
                        billing_cycle: billingCycle || 'MONTHLY',
                        employee_limit: employeeLimit ?? 999999,
                        status: status || 'ACTIVE',
                        settings: settings || {},
                    })
                    .select('*')
                    .single();

                if (companyError) throw companyError;

                // Link the app_users row to this company
                const { error: linkError } = await adminClient
                    .from('app_users')
                    .update({
                        company_id: companyId,
                        phone: settings?.phone ? String(settings.phone).trim() : null,
                    })
                    .eq('id', ownerId);

                if (linkError) {
                    console.error('Warning: company created but failed to link user:', linkError);
                }

                return new Response(
                    JSON.stringify({ company }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            case 'update-signup-profile': {
                // Persists profile fields captured during signup when the user may
                // not have an active session yet because email verification is pending.
                const { userId, email, phone } = payload || {};
                if (!userId || !email) throw new Error('userId and email are required');

                const normalizedEmail = String(email).trim().toLowerCase();
                const { data: authUserResult, error: authUserError } = await adminClient.auth.admin.getUserById(userId);
                if (authUserError || !authUserResult?.user) {
                    throw new Error('Signup user not found in auth.users');
                }

                if ((authUserResult.user.email || '').toLowerCase() !== normalizedEmail) {
                    throw new Error('Signup profile email mismatch');
                }

                const { data: updatedProfile, error: profileUpdateError } = await adminClient
                    .from('app_users')
                    .update({ phone: phone ? String(phone).trim() : null })
                    .eq('id', userId)
                    .eq('email', normalizedEmail)
                    .select('*')
                    .maybeSingle();

                if (profileUpdateError) throw profileUpdateError;

                return new Response(
                    JSON.stringify({ user: updatedProfile }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            case 'update-company': {
                // Updates a company record bypassing strict client-side RLS.
                // Verifies that the currently logged in user belongs to the company.
                const {
                    companyId, name, trn, address, plan,
                    billingCycle, employeeLimit, status, settings
                } = payload;

                if (!companyId) {
                    throw new Error('companyId is required');
                }

                if (!authUser) throw new Error('Unauthorized');
                const callerProfile = await getCallerProfile(adminClient, authUser);
                const callerRole = normalizeRole(callerProfile.role);

                // Security check: callerProfile.company_id must match companyId OR they must be a Super Admin
                // Resellers can edit their client's companies via the SA interface if needed, or if properly linked.
                const isSuperAdmin = callerProfile?.role === 'SUPER_ADMIN';
                const isResellerClient = callerRole === 'RESELLER' && payload.isClientUpdate;

                if (!isSuperAdmin && !isResellerClient && callerProfile?.company_id !== companyId) {
                    // Try checking membership table if standard check fails
                    const { data: mem } = await adminClient
                        .from('account_members')
                        .select('account_id')
                        .eq('account_id', companyId)
                        .eq('user_id', authUser.id)
                        .maybeSingle();
                        
                    if (!mem) {
                        throw new Error('Unauthorized to update this company');
                    }
                }

                const updateData: any = {};
                if (name !== undefined) updateData.name = name.trim();
                if (trn !== undefined) updateData.trn = trn;
                if (address !== undefined) updateData.address = address;
                if (plan !== undefined) updateData.plan = plan;
                if (billingCycle !== undefined) updateData.billing_cycle = billingCycle;
                if (employeeLimit !== undefined) updateData.employee_limit = employeeLimit;
                if (status !== undefined) updateData.status = status;
                if (settings !== undefined) updateData.settings = settings;

                if (Object.keys(updateData).length === 0) {
                    return new Response(
                        JSON.stringify({ message: 'No data to update' }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const { data: company, error: companyError } = await adminClient
                    .from('companies')
                    .update(updateData)
                    .eq('id', companyId)
                    .select('*')
                    .single();

                if (companyError) throw companyError;

                return new Response(
                    JSON.stringify({ company }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            case 'decline-invitation': {
                if (!authUser) throw new Error('Unauthorized');
                const { accountId, userId } = payload || {};
                if (!accountId || !userId) throw new Error('accountId and userId are required');

                // Verify the caller is the user being declined (or a super admin)
                const callerProfile = await adminClient.from('app_users').select('role').eq('id', authUser.id).maybeSingle();
                if (authUser.id !== userId && callerProfile?.data?.role !== 'SUPER_ADMIN') {
                    throw new Error('You can only decline your own invitations');
                }

                const { error } = await adminClient
                    .from('account_members')
                    .update({ status: 'declined' })
                    .eq('account_id', accountId)
                    .eq('user_id', userId);

                if (error) throw error;

                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'accept-invitation': {
                const { accountId, userId, userEmail, verifyEmail, invitationIds } = payload;
                if (!userId) throw new Error("userId is required to accept invitations");

                let success = false;
                let acceptedCount = 0;

                // Case: Single invitation (might be handled by ID or just accepting by user/email)
                if (invitationIds && Array.isArray(invitationIds) && invitationIds.length > 0) {
                     let query = adminClient
                      .from('account_members')
                      .update({
                        status: 'accepted',
                        user_id: userId,
                        accepted_at: new Date().toISOString()
                      })
                      .in('id', invitationIds);

                    if (userEmail) {
                      query = query.eq('email', userEmail.toLowerCase());
                    }

                    const { error, data } = await query.select();
                    if (!error && data && data.length > 0) {
                        success = true;
                        acceptedCount = data.length;
                    }
                } else if (accountId) {
                    // Single account mode
                    const { error: updateError, data: updatedRows } = await adminClient
                      .from('account_members')
                      .update({
                        status: 'accepted',
                        user_id: userId,
                        accepted_at: new Date().toISOString()
                      })
                      .eq('account_id', accountId)
                      .eq('user_id', userId)
                      .select();
                      
                    success = !updateError && updatedRows && updatedRows.length > 0;
                    
                    if (!success && userEmail) {
                        const { error: emailUpdateError, data: emailUpdatedRows } = await adminClient
                          .from('account_members')
                          .update({
                            status: 'accepted',
                            user_id: userId,
                            accepted_at: new Date().toISOString()
                          })
                          .eq('account_id', accountId)
                          .eq('email', userEmail.toLowerCase())
                          .is('user_id', null)
                          .select();
                        success = !emailUpdateError && emailUpdatedRows && emailUpdatedRows.length > 0;
                    }
                    if (success) acceptedCount = 1;
                }

                if (success) {
                    // We only mark email as confirmed if asked, and only via admin function
                    if (verifyEmail) {
                        await adminClient.auth.admin.updateUserById(userId, { email_confirm: true });
                    }

                    // Reseller linking logic
                    const { data: userData } = await adminClient.from('app_users').select('role, company_id').eq('id', userId).maybeSingle();
                    let targetCompanyId = userData?.company_id;
                    const isReseller = userData?.role === 'RESELLER' || userData?.role === 'Reseller';

                    if (!targetCompanyId || targetCompanyId === '') {
                         await adminClient.from('app_users').update({ company_id: accountId }).eq('id', userId);
                         targetCompanyId = accountId;
                    }

                    if (isReseller && targetCompanyId && accountId) {
                        await adminClient.from('reseller_clients').upsert({
                            reseller_id: targetCompanyId,
                            client_company_id: accountId,
                            status: 'ACTIVE',
                            access_level: 'FULL'
                        }, { onConflict: 'reseller_id,client_company_id' });
                        await adminClient.from('companies').update({ reseller_id: targetCompanyId }).eq('id', accountId);
                    }
                }

                return new Response(JSON.stringify({ success, acceptedCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            case 'get-pending-invitations': {
                const { email } = payload;
                
                const { data, error } = await adminClient
                  .from('account_members')
                  .select(`id, account_id, user_id, email, role, status, invited_at, accepted_at,
                    companies:account_id (name, plan),
                    inviter:companies!account_id (owner_id)
                  `)
                  .eq('email', email.toLowerCase())
                  .eq('status', 'pending')
                  .order('invited_at', { ascending: false });
                  
                if (error) throw error;
                return new Response(JSON.stringify({ data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            
            case 'get-user-admin': {
                const { email } = payload;
                const { data, error } = await adminClient
                  .from('app_users')
                  .select('*')
                  .eq('email', email.toLowerCase())
                  .maybeSingle();
                
                if (error) throw error;
                return new Response(JSON.stringify({ user: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            case 'check-reseller-management': {
                const { accountId } = payload;
                const { data: members } = await adminClient
                  .from('account_members')
                  .select('user_id')
                  .eq('account_id', accountId)
                  .not('user_id', 'is', null);

                let hasExistingReseller = false;
                if (members && members.length > 0) {
                    const memberUserIds = members.map((m: any) => m.user_id);
                    const { data: memberProfiles } = await adminClient
                      .from('app_users')
                      .select('id, role')
                      .in('id', memberUserIds);
                    hasExistingReseller = memberProfiles?.some((p: any) => p.role === 'RESELLER' || p.role === 'SUPER_ADMIN') || false;
                }
                return new Response(JSON.stringify({ hasExistingReseller }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            case 'check-upgrade-requirement': {
                const { userId } = payload;
                let requiresUpgrade = false;
                const { data: userProfile } = await adminClient
                  .from('app_users')
                  .select('role, company_id')
                  .eq('id', userId)
                  .maybeSingle();

                const role = userProfile?.role?.toUpperCase();
                const isReseller = role === 'RESELLER' || role === 'SUPER_ADMIN';

                if (!isReseller) {
                    const { data: ownedCompanies } = await adminClient
                      .from('companies')
                      .select('id, plan, name')
                      .eq('owner_id', userId);

                    const { data: memberships } = await adminClient
                      .from('account_members')
                      .select('account_id')
                      .eq('user_id', userId)
                      .eq('status', 'accepted');

                    const memberCompanyIds = memberships?.map((m: any) => m.account_id) || [];
                    let memberCompanies: any[] = [];
                    if (memberCompanyIds.length > 0) {
                        const { data: mComp } = await adminClient
                          .from('companies')
                          .select('id, plan, name')
                          .in('id', memberCompanyIds);
                        memberCompanies = mComp || [];
                    }

                    const allCompanies = [...(ownedCompanies || []), ...memberCompanies];

                    if (allCompanies.length > 0) {
                        const hasResellerPlan = allCompanies.some((c: any) => isResellerEquivalentPlan(c.plan));
                        if (!hasResellerPlan) requiresUpgrade = true;
                    } else if (userProfile?.company_id) {
                        const { data: primaryComp } = await adminClient
                          .from('companies')
                          .select('id, plan, name')
                          .eq('id', userProfile.company_id)
                          .maybeSingle();

                        if (primaryComp && !isResellerEquivalentPlan(primaryComp.plan)) requiresUpgrade = true;
                    }
                }
                return new Response(JSON.stringify({ requiresUpgrade }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            case 'get-all-companies': {
                const page = payload?.page ?? 0;
                const pageSize = payload?.pageSize ?? 20;
                const sort = payload?.sort || 'created_desc';
                const from = page * pageSize;
                const to = from + pageSize - 1;

                const { data: companies, error: compError, count } = await adminClient
                    .from('companies')
                    .select('id, name, email, plan, status, settings, created_at', { count: 'exact' })
                    .order('created_at', { ascending: false });

                if (compError) throw compError;

                // Enrich with owner name from app_users
                const enriched = await Promise.all((companies || []).map(async (c: any) => {
                    const billingGift = toBillingGift(c.settings?.billingGift);
                    const { data: ownerData } = await adminClient
                        .from('app_users')
                        .select('id, name, email, phone')
                        .eq('company_id', c.id)
                        .in('role', ['OWNER', 'ADMIN'])
                        .order('role', { ascending: true }) // ADMIN < OWNER alphabetically, but OWNER preferred
                        .limit(1)
                        .maybeSingle();
                    const authActivity = await getAuthActivityForUser(adminClient, ownerData?.id);

                    // Accurate employee count instead of settings cache
                    const { count: empCount } = await adminClient
                        .from('employees')
                        .select('*', { count: 'exact', head: true })
                        .eq('company_id', c.id)
                        .eq('status', 'ACTIVE');

                    const activeEmployeeCount = empCount || 0;
                    const mrr = calculatePlanMRR(c.plan, activeEmployeeCount);

                    return {
                        id: c.id,
                        companyName: c.name,
                        email: c.email || ownerData?.email || '',
                        phone: c.settings?.phone || ownerData?.phone || '',
                        contactName: ownerData?.name || c.settings?.contactName || 'N/A',
                        plan: normalizePlanToFrontend(c.plan),
                        status: c.status || 'ACTIVE',
                        billingGift,
                        hasActiveBillingGift: isBillingGiftActive(billingGift),
                        employeeCount: activeEmployeeCount,
                        mrr,
                        createdAt: c.created_at,
                        accountCreatedAt: authActivity.accountCreatedAt || c.created_at,
                        lastLoginAt: authActivity.lastLoginAt
                    };
                }));

                const sorted = sortByClientActivity(enriched, sort);
                const paged = sorted.slice(from, to + 1);

                return new Response(JSON.stringify({ companies: paged, total: count }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'gift-company-months': {
                const callerProfile = await assertSuperAdmin(adminClient, authUser);
                const companyId = payload?.companyId;
                const requestedMonths = Number(payload?.months);
                const note = typeof payload?.note === 'string' ? payload.note.trim() : '';

                if (!companyId) throw new Error('companyId is required');
                if (!Number.isInteger(requestedMonths) || requestedMonths < 1 || requestedMonths > 12) {
                    throw new Error('months must be an integer between 1 and 12');
                }

                const { data: company, error: companyError } = await adminClient
                    .from('companies')
                    .select('id, name, settings')
                    .eq('id', companyId)
                    .maybeSingle();

                if (companyError) throw companyError;
                if (!company) throw new Error('Company not found');

                const existingSettings = company.settings || {};
                const existingGift = toBillingGift(existingSettings.billingGift);
                const now = new Date();
                const extensionBase = existingGift && isBillingGiftActive(existingGift, now)
                    ? new Date(existingGift.giftedUntil)
                    : now;
                const giftedUntil = addMonths(extensionBase, requestedMonths).toISOString();

                const billingGift = {
                    giftedUntil,
                    grantedAt: now.toISOString(),
                    grantedBy: callerProfile.id,
                    grantedByName: callerProfile.name || authUser.email || 'Super Admin',
                    monthsGranted: requestedMonths,
                    note: note || existingGift?.note,
                    employeeLimitOverride: 'Unlimited',
                };

                const { error: updateError } = await adminClient
                    .from('companies')
                    .update({
                        settings: {
                            ...existingSettings,
                            billingGift,
                        },
                    })
                    .eq('id', companyId);

                if (updateError) throw updateError;

                return new Response(JSON.stringify({
                    success: true,
                    company: {
                        id: company.id,
                        companyName: company.name,
                        billingGift,
                        hasActiveBillingGift: true,
                    },
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'delete-super-admin': {
                const { userId } = payload;
                const { error } = await adminClient.auth.admin.deleteUser(userId);
                if (error) throw error;
                return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            // Legacy action - see get-pending-approvals instead
            case 'get-pending-companies': {
                throw new Error('Action get-pending-companies is deprecated. Use get-pending-approvals.');
            }

            case 'approve-company': {
                const { companyId } = payload;
                if (!companyId) throw new Error('companyId required');

                const { error } = await adminClient
                    .from('companies')
                    .update({ status: 'ACTIVE' })
                    .eq('id', companyId);

                if (error) throw error;
                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'sync-reseller-portfolio': {
                const { resellerUserId } = payload;
                if (!resellerUserId) throw new Error('resellerUserId required');

                const { data: userData } = await adminClient
                    .from('app_users')
                    .select('role, company_id')
                    .eq('id', resellerUserId)
                    .maybeSingle();

                if (!userData || (userData.role !== 'RESELLER' && userData.role !== 'Reseller')) {
                    return new Response(JSON.stringify({ success: false, syncedCount: 0, error: 'User is not a Reseller' }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                const resellerCompanyId = userData.company_id;
                if (!resellerCompanyId) {
                    return new Response(JSON.stringify({ success: false, syncedCount: 0, error: 'User has no Reseller Company ID' }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                const { data: memberships } = await adminClient
                    .from('account_members')
                    .select('account_id')
                    .eq('user_id', resellerUserId)
                    .eq('status', 'accepted');

                let syncedCount = 0;
                for (const mem of (memberships || [])) {
                    if (mem.account_id === resellerCompanyId) continue;
                    const { error: linkError } = await adminClient.from('reseller_clients').upsert({
                        reseller_id: resellerCompanyId,
                        client_company_id: mem.account_id,
                        status: 'ACTIVE',
                        access_level: 'FULL'
                    }, { onConflict: 'reseller_id,client_company_id' });

                    if (!linkError) {
                        await adminClient.from('companies').update({ reseller_id: resellerCompanyId }).eq('id', mem.account_id);
                        syncedCount++;
                    }
                }

                return new Response(JSON.stringify({ success: true, syncedCount }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'save-company': {
                const { companyId, settings, userId } = payload;
                if (!companyId || !settings) throw new Error('companyId and settings are required');

                // 1. Authorization check: Either Super Admin or the User is the Owner
                const isSuperAdmin = authUser?.app_metadata?.role === 'SUPER_ADMIN' || 
                                     authUser?.user_metadata?.role === 'SUPER_ADMIN';
                
                if (!isSuperAdmin && userId) {
                    // Check if the user has OWNER role for this company
                    const { data: membership } = await adminClient
                        .from('account_members')
                        .select('role')
                        .eq('account_id', companyId)
                        .eq('user_id', userId)
                        .maybeSingle();
                    
                    if (membership?.role !== 'OWNER') {
                        throw new Error('Unauthorized: Only Owners or Super Admins can save company settings via this secure channel.');
                    }
                }

                // 2. Prepare the update data (mimicking the monolith mapping)
                const {
                    name, email, phone, trn, address, status, plan, 
                    billing_cycle, employee_limit, settings: settingsJson
                } = settings;

                const { data: updated, error: updateError } = await adminClient
                    .from('companies')
                    .upsert({
                        id: companyId,
                        name: name,
                        email: email,
                        phone: phone,
                        trn: trn,
                        address: address,
                        settings: settingsJson,
                        status: status || 'ACTIVE',
                        plan: plan,
                        billing_cycle: billing_cycle || 'MONTHLY',
                        employee_limit: employee_limit
                    }, { onConflict: 'id' })
                    .select()
                    .single();

                if (updateError) throw updateError;

                // 3. Ensure owner is in account_members (critical for sync)
                if (userId) {
                     await adminClient.from('account_members').upsert({
                        account_id: companyId,
                        user_id: userId,
                        email: email || '',
                        role: 'OWNER',
                        status: 'accepted',
                        accepted_at: new Date().toISOString(),
                        invited_at: new Date().toISOString()
                    }, { onConflict: 'account_id,email' });
                }

                return new Response(JSON.stringify({ success: true, company: updated }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'join-client-team': {
                const { clientCompanyId, resellerUserId, resellerEmail } = payload;
                if (!clientCompanyId || !resellerUserId) throw new Error('clientCompanyId and resellerUserId required');

                const { error: memberError } = await adminClient.from('account_members').upsert({
                    account_id: clientCompanyId,
                    user_id: resellerUserId,
                    email: resellerEmail?.toLowerCase() || '',
                    role: 'MANAGER',
                    status: 'accepted',
                    accepted_at: new Date().toISOString(),
                    invited_at: new Date().toISOString(),
                }, { onConflict: 'account_id,email', ignoreDuplicates: false });

                if (memberError) {
                    // Fallback to user_id constraint
                    await adminClient.from('account_members').upsert({
                        account_id: clientCompanyId,
                        user_id: resellerUserId,
                        role: 'MANAGER',
                        status: 'accepted',
                        accepted_at: new Date().toISOString(),
                        invited_at: new Date().toISOString(),
                    }, { onConflict: 'account_id,user_id', ignoreDuplicates: false });
                }

                const { data: userData } = await adminClient.from('app_users').select('company_id').eq('id', resellerUserId).maybeSingle();
                if (userData?.company_id) {
                    await adminClient.from('companies').update({ reseller_id: userData.company_id }).eq('id', clientCompanyId);
                    await adminClient.from('reseller_clients').upsert({
                        reseller_id: userData.company_id,
                        client_company_id: clientCompanyId,
                        status: 'ACTIVE',
                        access_level: 'FULL'
                    }, { onConflict: 'reseller_id,client_company_id' });
                }

                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'get-user-by-email-admin': {
                const { email } = payload;
                if (!email) throw new Error('email required');

                const { data: user, error: userError } = await adminClient
                    .from('app_users')
                    .select('id, name, email, role, company_id, is_onboarded')
                    .eq('email', email.toLowerCase())
                    .maybeSingle();

                if (userError) throw userError;
                return new Response(JSON.stringify({ user: user || null }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'get-audit-logs': {
                const { companyId: filterCompanyId, limit: logLimit = 500 } = payload || {};

                let query = adminClient
                    .from('audit_logs')
                    .select('*')
                    .order('timestamp', { ascending: false })
                    .limit(logLimit);

                if (filterCompanyId) {
                    query = query.eq('company_id', filterCompanyId);
                }

                const { data: logs, error: logsError } = await query;
                if (logsError) throw logsError;

                const mapped = (logs || []).map((log: any) => ({
                    id: log.id,
                    timestamp: log.timestamp,
                    actorId: log.actor_id,
                    actorName: log.actor_name,
                    action: log.action,
                    entity: log.entity,
                    description: log.description,
                    ipAddress: log.ip_address
                }));

                return new Response(JSON.stringify({ logs: mapped }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'get-company-context': {
                const { companyId, includePayRunLineItems = false } = payload;
                if (!companyId) throw new Error('companyId required');

                await assertCompanyAccess(adminClient, authUser, companyId, ['OWNER', 'ADMIN', 'RESELLER', 'SUPER_ADMIN']);
                const payRunSelect = includePayRunLineItems
                    ? '*'
                    : 'id, company_id, period_start, period_end, pay_date, pay_frequency, status, total_gross, total_net, employee_count';

                // 3. Fetch all data in parallel
                const [
                    { data: company },
                    { data: employees },
                    { data: payRuns },
                    { data: leaveRequests },
                    { data: users }
                ] = await Promise.all([
                    adminClient.from('companies').select('*').eq('id', companyId).maybeSingle(),
                    adminClient.from('employees').select('*').eq('company_id', companyId),
                    adminClient.from('pay_runs').select(payRunSelect).eq('company_id', companyId).order('period_start', { ascending: false }),
                    adminClient.from('leave_requests').select('*').eq('company_id', companyId),
                    adminClient.from('app_users').select('*').eq('company_id', companyId)
                ]);

                return new Response(JSON.stringify({
                    company,
                    employees,
                    payRuns,
                    leaveRequests,
                    users
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'save-pay-run': {
                const { companyId, payRun } = payload || {};
                if (!companyId) throw new Error('companyId required');
                if (!payRun || typeof payRun !== 'object') throw new Error('payRun payload required');

                await assertCompanyAccess(adminClient, authUser, companyId, ['OWNER', 'ADMIN', 'RESELLER', 'SUPER_ADMIN']);

                const runRecord = payRun as Record<string, any>;
                const payRunPayload = {
                    id: runRecord.id,
                    company_id: companyId,
                    period_start: toDbPeriodStart(runRecord.period_start ?? runRecord.periodStart),
                    period_end: toDbPeriodEnd(runRecord.period_end ?? runRecord.periodEnd),
                    pay_date: runRecord.pay_date ?? runRecord.payDate,
                    pay_frequency: runRecord.pay_frequency ?? runRecord.payFrequency ?? 'MONTHLY',
                    status: runRecord.status,
                    total_gross: runRecord.total_gross ?? runRecord.totalGross ?? 0,
                    total_net: runRecord.total_net ?? runRecord.totalNet ?? 0,
                    employee_count: runRecord.employee_count ?? runRecord.employeeCount ?? runRecord.line_items?.length ?? runRecord.lineItems?.length ?? 0,
                    line_items: runRecord.line_items ?? runRecord.lineItems ?? []
                };

                const { data: savedPayRun, error: saveError } = await adminClient
                    .from('pay_runs')
                    .upsert(payRunPayload)
                    .select('*')
                    .maybeSingle();

                if (saveError) throw saveError;

                return new Response(JSON.stringify({ success: true, payRun: savedPayRun }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'get-attendance-badge': {
                const { companyId, locationId } = payload || {};
                if (!companyId) throw new Error('companyId required');
                if (!locationId) throw new Error('locationId required');

                await assertCompanyAccess(adminClient, authUser, companyId, ['OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN']);
                const location = await getActiveLocation(adminClient, companyId, locationId);

                const { data: activeBadges, error: activeBadgesError } = await adminClient
                    .from('attendance_badges')
                    .select('code_version')
                    .eq('company_id', companyId)
                    .eq('location_id', locationId)
                    .order('code_version', { ascending: false })
                    .limit(1);

                if (activeBadgesError) throw activeBadgesError;

                const codeVersion = Number(activeBadges?.[0]?.code_version || 0) + 1;
                const passCode = generateAttendancePassCode();
                const passCodeHash = await hashAttendancePassCode(companyId, locationId, passCode, codeVersion);
                const expiresAt = new Date(Date.now() + (ATTENDANCE_BADGE_TTL_HOURS * 60 * 60 * 1000)).toISOString();

                const { error: deactivateError } = await adminClient
                    .from('attendance_badges')
                    .update({ is_active: false, updated_at: new Date().toISOString() })
                    .eq('company_id', companyId)
                    .eq('location_id', locationId)
                    .eq('is_active', true);

                if (deactivateError) throw deactivateError;

                const { data: badge, error: badgeError } = await adminClient
                    .from('attendance_badges')
                    .insert({
                        company_id: companyId,
                        location_id: locationId,
                        pass_code_hash: passCodeHash,
                        code_version: codeVersion,
                        expires_at: expiresAt,
                        is_active: true,
                        rotated_at: new Date().toISOString(),
                    })
                    .select('id, expires_at, code_version')
                    .maybeSingle();

                if (badgeError) throw badgeError;

                return new Response(JSON.stringify({
                    success: true,
                    badge: {
                        id: badge?.id,
                        locationId,
                        locationName: location.name,
                        passCode,
                        expiresAt: badge?.expires_at || expiresAt,
                        codeVersion,
                    },
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'clock-attendance': {
                const {
                    companyId,
                    employeeId,
                    method,
                    position,
                } = payload || {};
                const normalizedMethod = method === 'PASS_CODE' ? 'PASS_CODE' : 'QR';

                if (!companyId) throw new Error('companyId required');
                if (!employeeId) throw new Error('employeeId required');
                if (!authUser?.id) throw new Error('Unauthorized');

                await assertAttendanceThrottle(adminClient, companyId, authUser.id);

                let location: any = null;
                try {
                    const { callerProfile, employee } = await assertAttendanceCaller(adminClient, authUser, companyId, employeeId);
                    location = await resolveAttendanceLocation(adminClient, companyId, normalizedMethod, payload || {});

                    const latitude = coerceFiniteNumber(position?.latitude, NaN);
                    const longitude = coerceFiniteNumber(position?.longitude, NaN);
                    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                        throw new Error('Location permission is required for attendance.');
                    }

                    const distanceMeters = calculateHaversineDistanceMeters(
                        { latitude, longitude },
                        { latitude: Number(location.latitude), longitude: Number(location.longitude) }
                    );
                    const allowedRadiusMeters = Number(location.geofence_radius_meters || 100);
                    if (distanceMeters > allowedRadiusMeters) {
                        throw new Error('Attendance rejected. You are outside your branch location boundary.');
                    }

                    const employeeName = `${employee.first_name || ''} ${employee.last_name || ''}`.trim()
                        || callerProfile.name
                        || String(employee.email || 'Employee');
                    const now = new Date().toISOString();

                    const { data: openShift, error: openShiftError } = await adminClient
                        .from('attendance_shifts')
                        .select('*')
                        .eq('company_id', companyId)
                        .eq('employee_id', employee.id)
                        .eq('status', 'OPEN')
                        .maybeSingle();

                    if (openShiftError) throw openShiftError;

                    if (openShift) {
                        if (openShift.location_id && openShift.location_id !== location.id) {
                            throw new Error(`Clock-out must use ${openShift.location_name || 'the same branch'} where you clocked in.`);
                        }

                        const clockInAt = String(openShift.clock_in_at);
                        const totalHours = Number(Math.max(0, (new Date(now).getTime() - new Date(clockInAt).getTime()) / 36e5).toFixed(2));

                        const { data: savedShift, error: shiftError } = await adminClient
                            .from('attendance_shifts')
                            .update({
                                status: 'SUBMITTED',
                                clock_out_at: now,
                                total_hours: totalHours,
                                updated_at: now,
                            })
                            .eq('id', openShift.id)
                            .select('*')
                            .maybeSingle();

                        if (shiftError) throw shiftError;

                        const timesheet = await upsertAttendanceTimesheet(adminClient, {
                            companyId,
                            employeeId: employee.id,
                            employeeName,
                            locationId: location.id,
                            locationName: location.name,
                            shiftId: openShift.id,
                            clockInAt,
                            clockOutAt: now,
                            method: normalizedMethod,
                        });

                        await adminClient
                            .from('attendance_shifts')
                            .update({ timesheet_id: timesheet.id, updated_at: now })
                            .eq('id', openShift.id);

                        await logAttendanceAttempt(adminClient, {
                            companyId,
                            locationId: location.id,
                            employeeId: employee.id,
                            userId: authUser.id,
                            method: normalizedMethod,
                            status: 'SUCCESS',
                            ipAddress: requestIp,
                        });

                        return new Response(JSON.stringify({
                            success: true,
                            action: 'clock_out',
                            timesheet,
                            shift: savedShift,
                        }), {
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                        });
                    }

                    const { data: newShift, error: shiftError } = await adminClient
                        .from('attendance_shifts')
                        .insert({
                            company_id: companyId,
                            employee_id: employee.id,
                            employee_name: employeeName,
                            location_id: location.id,
                            location_name: location.name,
                            user_id: authUser.id,
                            method: normalizedMethod,
                            status: 'OPEN',
                            clock_in_at: now,
                        })
                        .select('*')
                        .maybeSingle();

                    if (shiftError) throw shiftError;

                    const timesheet = await upsertAttendanceTimesheet(adminClient, {
                        companyId,
                        employeeId: employee.id,
                        employeeName,
                        locationId: location.id,
                        locationName: location.name,
                        shiftId: newShift.id,
                        clockInAt: now,
                        method: normalizedMethod,
                    });

                    await adminClient
                        .from('attendance_shifts')
                        .update({ timesheet_id: timesheet.id, updated_at: now })
                        .eq('id', newShift.id);

                    await logAttendanceAttempt(adminClient, {
                        companyId,
                        locationId: location.id,
                        employeeId: employee.id,
                        userId: authUser.id,
                        method: normalizedMethod,
                        status: 'SUCCESS',
                        ipAddress: requestIp,
                    });

                    return new Response(JSON.stringify({
                        success: true,
                        action: 'clock_in',
                        timesheet,
                        shift: newShift,
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                } catch (attendanceError: any) {
                    await logAttendanceAttempt(adminClient, {
                        companyId,
                        locationId: location?.id || payload?.locationId || null,
                        employeeId: employeeId || null,
                        userId: authUser?.id || null,
                        method: normalizedMethod,
                        status: 'FAILED',
                        reason: attendanceError?.message || 'Attendance failed',
                        ipAddress: requestIp,
                    });
                    throw attendanceError;
                }
            }

            case 'bulk-update-employee-deductions': {
                const { companyId, updates } = payload || {};
                if (!companyId) throw new Error('companyId required');
                if (!Array.isArray(updates)) throw new Error('updates array required');
                if (updates.length === 0) {
                    return new Response(JSON.stringify({ success: true, updatedCount: 0 }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                await assertCompanyAccess(adminClient, authUser, companyId, ['OWNER', 'ADMIN', 'RESELLER', 'SUPER_ADMIN']);

                const updatesById = new Map<string, { id: string; customDeductions: unknown[] }>();
                for (const rawUpdate of updates) {
                    if (!rawUpdate || typeof rawUpdate !== 'object') throw new Error('Each update must be an object');
                    const id = String((rawUpdate as Record<string, unknown>).id || '').trim();
                    if (!id) throw new Error('Each update requires an employee id');
                    updatesById.set(id, {
                        id,
                        customDeductions: normalizeCustomDeductions((rawUpdate as Record<string, unknown>).customDeductions),
                    });
                }

                const normalizedUpdates = [...updatesById.values()];

                const { data: rpcUpdatedCount, error: rpcError } = await adminClient.rpc('bulk_update_employee_deductions', {
                    p_company_id: companyId,
                    p_updates: normalizedUpdates,
                });

                if (!rpcError) {
                    return new Response(JSON.stringify({ success: true, updatedCount: Number(rpcUpdatedCount || 0) }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                if (!isMissingRpcError(rpcError)) throw rpcError;

                const employeeIds = normalizedUpdates.map((update) => update.id);
                const { data: existingEmployees, error: lookupError } = await adminClient
                    .from('employees')
                    .select('id')
                    .eq('company_id', companyId)
                    .in('id', employeeIds);

                if (lookupError) throw lookupError;
                if ((existingEmployees || []).length !== employeeIds.length) {
                    throw new Error('One or more employees do not belong to this company');
                }

                const rows = normalizedUpdates.map((update) => ({
                    id: update.id,
                    company_id: companyId,
                    custom_deductions: update.customDeductions,
                    deductions: update.customDeductions,
                }));

                const { data: updatedRows, error: bulkError } = await adminClient
                    .from('employees')
                    .upsert(rows, { onConflict: 'id' })
                    .select('id');

                if (bulkError) throw bulkError;

                return new Response(JSON.stringify({ success: true, updatedCount: updatedRows?.length || rows.length }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'get-payroll-ytd-summary': {
                const { companyId, year } = payload || {};
                if (!companyId) throw new Error('companyId required');
                const taxYear = Number(year);
                if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
                    throw new Error('Valid payroll year required');
                }

                await assertCompanyAccess(adminClient, authUser, companyId, ['OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN']);

                const { data: summaries, error: summaryError } = await adminClient.rpc('get_payroll_ytd_summary', {
                    p_company_id: companyId,
                    p_year: taxYear,
                });

                if (summaryError) throw summaryError;

                return new Response(JSON.stringify({ success: true, summaries: summaries || [] }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'delete-pay-run': {
                const { companyId, runId } = payload || {};
                if (!companyId) throw new Error('companyId required');
                if (!runId) throw new Error('runId required');

                await assertCompanyAccess(adminClient, authUser, companyId, ['OWNER', 'ADMIN', 'RESELLER', 'SUPER_ADMIN']);

                const { error: deleteError } = await adminClient
                    .from('pay_runs')
                    .delete()
                    .eq('id', runId)
                    .eq('company_id', companyId);

                if (deleteError) throw deleteError;

                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'save-audit-log': {
                const { companyId, log } = payload || {};
                if (!log || typeof log !== 'object') throw new Error('log payload required');

                if (companyId) {
                    await assertCompanyAccess(adminClient, authUser, companyId, ['OWNER', 'ADMIN', 'RESELLER', 'SUPER_ADMIN']);
                } else {
                    const callerProfile = await getCallerProfile(adminClient, authUser);
                    if (normalizeRole(callerProfile.role) !== 'SUPER_ADMIN') {
                        throw new Error('Unauthorized');
                    }
                }

                const { error: auditError } = await adminClient.from('audit_logs').insert(log);
                if (auditError) throw auditError;

                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'get-employee-by-token': {
                const { token, email } = payload || {};
                if (!token) throw new Error('token is required');

                // This is a public-facing lookup — any authenticated user clicking an
                // invite link needs to resolve their onboarding token. The service-role
                // client bypasses RLS so the query works even before the employee has
                // been linked to an auth user.
                let query = adminClient
                    .from('employees')
                    .select('*, companies(name)')
                    .eq('onboarding_token', token);

                if (email) {
                    query = query.eq('email', email.toLowerCase().trim());
                }

                const { data, error } = await query.maybeSingle();

                if (error) throw error;
                if (!data) {
                    return new Response(JSON.stringify({ employee: null }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                return new Response(JSON.stringify({ employee: data }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'save-leave-request': {
                const { companyId, leaveRequest } = payload || {};
                if (!companyId) throw new Error('companyId is required');
                if (!leaveRequest) throw new Error('leaveRequest payload is required');

                // Verify the caller has access to this company
                if (authUser) {
                    await assertCompanyAccess(adminClient, authUser, companyId, ['OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN', 'EMPLOYEE']);
                }

                const { error } = await adminClient
                    .from('leave_requests')
                    .upsert({ ...leaveRequest, company_id: companyId });

                if (error) throw error;

                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'save-employee-for-company': {
                const correlationId = req.headers.get('x-correlation-id') || '';
                const { companyId, employee, mode = 'upsert' } = payload || {};

                const edgeLog = (step: string, status: string, detail: Record<string, unknown> = {}) => {
                    if (!correlationId) return;
                    adminClient.from('diagnostic_logs').insert({
                        correlation_id: correlationId,
                        source: 'edge',
                        step,
                        status,
                        duration_ms: typeof detail.durationMs === 'number' ? detail.durationMs : null,
                        employee_id: (employee as any)?.id || null,
                        company_id: companyId || null,
                        user_id: authUser?.id || null,
                        user_role: null,
                        detail,
                    }).then(null, () => {});
                };

                const t0 = Date.now();
                edgeLog('edge-request-received', 'start', { mode });

                if (!companyId) throw new Error('companyId required');
                if (!employee || typeof employee !== 'object') throw new Error('employee payload required');
                if (!['insert', 'update', 'upsert'].includes(mode)) throw new Error('Invalid employee save mode');

                await assertCompanyAccess(adminClient, authUser, companyId, ['OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN']);
                edgeLog('edge-company-access-checked', 'ok', { durationMs: Date.now() - t0 });

                // Ensure empty strings are converted to null to avoid unique constraint violations
                const cleanEmployee = { ...employee } as Record<string, any>;
                if (cleanEmployee.trn === '') cleanEmployee.trn = null;
                if (cleanEmployee.nis === '') cleanEmployee.nis = null;

                const employeeRecord = buildEmployeePayload(cleanEmployee, companyId, mode);
                edgeLog('edge-payload-built', 'ok', { keysInPayload: Object.keys(employeeRecord as object).length });
                let result;

                // Fallback loop for schema mismatches
                let nextPayload: Record<string, any> = { ...employeeRecord };
                for (let attempt = 0; attempt < 8; attempt++) {
                    const tAttempt = Date.now();
                    switch (mode) {
                        case 'insert':
                            result = await adminClient.from('employees').insert(nextPayload);
                            break;
                        case 'update':
                            result = await adminClient
                                .from('employees')
                                .update(nextPayload)
                                .eq('id', cleanEmployee.id)
                                .eq('company_id', companyId);
                            break;
                        default:
                            result = await adminClient.from('employees').upsert(nextPayload);
                            break;
                    }

                    if (!result.error) {
                        edgeLog(`edge-schema-attempt-${attempt}`, 'ok', { durationMs: Date.now() - tAttempt, keysInPayload: Object.keys(nextPayload).length });
                        break;
                    }

                    edgeLog(`edge-schema-attempt-${attempt}`, 'error', {
                        durationMs: Date.now() - tAttempt,
                        errorCode: result.error.code,
                    });

                    const message = (result.error.message || '').toLowerCase();
                    const details = (result.error.details || '').toLowerCase();
                    const code = String(result.error.code || '').toUpperCase();

                    const isSchemaMismatch = code === 'PGRST204'
                        || (message.includes('column') && message.includes('does not exist'))
                        || message.includes('could not find the');

                    if (!isSchemaMismatch) {
                        break;
                    }

                    const combinedMsg = `${message} ${details}`;
                    const matchPostgrest = combinedMsg.match(/could not find the ['"]?([^'"]+)['"]?/i);
                    const matchPostgres = combinedMsg.match(/column ['"]?([^'"]+)['"]? (?:of relation|does not exist|in)/i);
                    const missingColumn = (matchPostgrest?.[1] || matchPostgres?.[1] || '').trim();

                    if (!missingColumn || !(missingColumn in nextPayload)) {
                        break;
                    }

                    delete nextPayload[missingColumn];
                }

                if (result?.error) throw result.error;

                edgeLog('edge-write-complete', 'ok', { durationMs: Date.now() - t0 });
                edgeLog('edge-response-sent', 'ok');
                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'get-platform-stats': {
                if (!authUser) throw new Error('Unauthorized');
                const { data: profile } = await adminClient.from('app_users').select('role').eq('id', authUser.id).maybeSingle();
                if (profile?.role?.toUpperCase() !== 'SUPER_ADMIN') {
                    throw new Error('Unauthorized: Super Admin required');
                }

                const [
                    { count: totalTenants },
                    { count: activeTenants },
                    { count: pendingApprovals },
                    { count: totalEmployees },
                    { data: activeCompanies },
                    { data: activeEmployees }
                ] = await Promise.all([
                    adminClient.from('companies').select('*', { count: 'exact', head: true }),
                    adminClient.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
                    adminClient.from('companies').select('*', { count: 'exact', head: true }).in('status', ['PENDING_PAYMENT', 'PENDING_APPROVAL']),
                    adminClient.from('employees').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
                    adminClient.from('companies').select('id, plan').eq('status', 'ACTIVE'),
                    adminClient.from('employees').select('company_id').eq('status', 'ACTIVE')
                ]);

                const activeEmployeeCounts = (activeEmployees || []).reduce((acc: Record<string, number>, employee: any) => {
                    if (employee.company_id) {
                        acc[employee.company_id] = (acc[employee.company_id] || 0) + 1;
                    }
                    return acc;
                }, {});

                const totalMRR = (activeCompanies || []).reduce((sum: number, company: any) => (
                    sum + calculatePlanMRR(company.plan, activeEmployeeCounts[company.id] || 0)
                ), 0);

                return new Response(JSON.stringify({
                    totalTenants: totalTenants || 0,
                    activeTenants: activeTenants || 0,
                    pendingApprovals: pendingApprovals || 0,
                    totalEmployees: totalEmployees || 0,
                    totalMRR
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'get-all-subscriptions': {
                if (!authUser) throw new Error('Unauthorized');
                
                // Simple role check for Super Admin
                const { data: profile } = await adminClient.from('app_users').select('role').eq('id', authUser.id).maybeSingle();
                if (profile?.role?.toUpperCase() !== 'SUPER_ADMIN') {
                    throw new Error('Unauthorized: Super Admin required');
                }

                const { data, error } = await adminClient
                    .from('subscriptions')
                    .select('*, companies(name)')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                return new Response(JSON.stringify({ subscriptions: data }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'get-paying-clients': {
                await assertSuperAdmin(adminClient, authUser);

                const [
                    { data: companies, error: companiesError },
                    { data: owners, error: ownersError },
                    { data: activeEmployees, error: employeesError },
                    { data: subscriptions, error: subscriptionsError },
                    { data: payments, error: paymentsError },
                    { data: ledgerEvents }
                ] = await Promise.all([
                    adminClient
                        .from('companies')
                        .select('id, name, email, plan, status, settings, created_at')
                        .order('created_at', { ascending: false }),
                    adminClient
                        .from('app_users')
                        .select('id, company_id, name, email, phone, role')
                        .in('role', ['OWNER', 'ADMIN']),
                    adminClient
                        .from('employees')
                        .select('company_id')
                        .eq('status', 'ACTIVE'),
                    adminClient
                        .from('subscriptions')
                        .select('id, company_id, plan_name, status, amount, currency, billing_frequency, dime_subscription_id, dimepay_subscription_id, dime_card_token, card_last_four, card_brand, payment_method_last4, payment_method_brand, access_until, next_billing_date, updated_at, created_at')
                        .order('created_at', { ascending: false }),
                    adminClient
                        .from('payment_history')
                        .select('id, company_id, amount, currency, status, transaction_id, invoice_number, payment_date, created_at')
                        .order('payment_date', { ascending: false }),
                    adminClient
                        .from('dimepay_ledger')
                        .select('company_id, dimepay_reference_id, state, event_type, created_at')
                        .order('created_at', { ascending: false })
                        .limit(300)
                ]);

                if (companiesError) throw companiesError;
                if (ownersError) throw ownersError;
                if (employeesError) throw employeesError;
                if (subscriptionsError) throw subscriptionsError;
                if (paymentsError) throw paymentsError;

                const employeeCounts = (activeEmployees || []).reduce((acc: Record<string, number>, employee: any) => {
                    if (employee.company_id) acc[employee.company_id] = (acc[employee.company_id] || 0) + 1;
                    return acc;
                }, {});

                const ownersByCompany = (owners || []).reduce((acc: Record<string, any>, user: any) => {
                    if (!user.company_id) return acc;
                    const existing = acc[user.company_id];
                    if (!existing || user.role === 'OWNER') acc[user.company_id] = user;
                    return acc;
                }, {});

                const subscriptionByCompany = (subscriptions || []).reduce((acc: Record<string, any>, subscription: any) => {
                    if (subscription.company_id && !acc[subscription.company_id]) acc[subscription.company_id] = subscription;
                    return acc;
                }, {});

                const paymentByCompany = (payments || []).reduce((acc: Record<string, any>, payment: any) => {
                    if (payment.company_id && !acc[payment.company_id]) acc[payment.company_id] = payment;
                    return acc;
                }, {});

                const ledgerByCompany = (ledgerEvents || []).reduce((acc: Record<string, any>, event: any) => {
                    if (event.company_id && !acc[event.company_id]) acc[event.company_id] = event;
                    return acc;
                }, {});

                const payingClients = await Promise.all((companies || [])
                    .filter((company: any) => normalizePlanToFrontend(company.plan) !== 'Free')
                    .map(async (company: any) => {
                        const employeeCount = employeeCounts[company.id] || 0;
                        const subscription = subscriptionByCompany[company.id];
                        const owner = ownersByCompany[company.id];
                        const authActivity = await getAuthActivityForUser(adminClient, owner?.id);
                        const latestPayment = paymentByCompany[company.id];
                        const latestLedgerEvent = ledgerByCompany[company.id];
                        const mrr = calculatePlanMRR(company.plan, employeeCount);
                        const hasCard = Boolean(
                            subscription?.dime_card_token ||
                            subscription?.card_last_four ||
                            subscription?.payment_method_last4
                        );
                        const subscriptionStatus = String(subscription?.status || '').toLowerCase();
                        const companyStatus = String(company.status || 'ACTIVE').toUpperCase();
                        const accessUntil = subscription?.access_until || subscription?.next_billing_date || null;
                        const accessDate = accessUntil ? new Date(accessUntil) : null;
                        const daysUntilAccessEnds = accessDate && !Number.isNaN(accessDate.getTime())
                            ? Math.ceil((accessDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                            : null;

                        let risk: 'ok' | 'attention' | 'critical' = 'ok';
                        if (companyStatus === 'SUSPENDED' || subscriptionStatus === 'past_due' || subscriptionStatus === 'failed') {
                            risk = 'critical';
                        } else if (!hasCard || companyStatus === 'PENDING_PAYMENT' || (typeof daysUntilAccessEnds === 'number' && daysUntilAccessEnds <= 7)) {
                            risk = 'attention';
                        }

                        return {
                            id: company.id,
                            companyName: company.name,
                            adminName: owner?.name || company.settings?.contactName || 'N/A',
                            adminEmail: owner?.email || company.email || '',
                            adminPhone: owner?.phone || company.settings?.phone || company.settings?.contactPhone || '',
                            plan: normalizePlanToFrontend(company.plan),
                            status: companyStatus,
                            subscriptionStatus: subscription?.status || null,
                            activeEmployees: employeeCount,
                            mrr,
                            arr: mrr * 12,
                            currency: subscription?.currency || 'JMD',
                            paymentMethod: hasCard
                                ? `${subscription?.card_brand || subscription?.payment_method_brand || 'Card'} ${subscription?.card_last_four || subscription?.payment_method_last4 || ''}`.trim()
                                : 'No card on file',
                            dimeSubscriptionId: subscription?.dime_subscription_id || subscription?.dimepay_subscription_id || null,
                            accessUntil,
                            lastPaymentDate: latestPayment?.payment_date || null,
                            lastPaymentAmount: latestPayment?.amount || null,
                            lastPaymentStatus: latestPayment?.status || null,
                            latestLedgerState: latestLedgerEvent?.state || null,
                            latestLedgerEventType: latestLedgerEvent?.event_type || null,
                            risk,
                            createdAt: company.created_at,
                            accountCreatedAt: authActivity.accountCreatedAt || company.created_at,
                            lastLoginAt: authActivity.lastLoginAt
                        };
                    }));

                return new Response(JSON.stringify({ clients: payingClients }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'get-all-payments': {
                if (!authUser) throw new Error('Unauthorized');
                
                // Simple role check for Super Admin
                const { data: profile } = await adminClient.from('app_users').select('role').eq('id', authUser.id).maybeSingle();
                if (profile?.role?.toUpperCase() !== 'SUPER_ADMIN') {
                    throw new Error('Unauthorized: Super Admin required');
                }

                const { data, error } = await adminClient
                    .from('payment_history')
                    .select('*, companies(name)')
                    .eq('status', 'completed')
                    .order('payment_date', { ascending: false });

                if (error) throw error;
                return new Response(JSON.stringify({ payments: data }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'get-all-super-admins': {
                if (!authUser) throw new Error('Unauthorized');
                
                const { data: profile } = await adminClient.from('app_users').select('role').eq('id', authUser.id).maybeSingle();
                if (profile?.role?.toUpperCase() !== 'SUPER_ADMIN') {
                    throw new Error('Unauthorized: Super Admin required');
                }

                // Fetch all Super Admins using the server role (RLS bypass)
                const { data, error } = await adminClient
                    .from('app_users')
                    .select('*')
                    .eq('role', 'SUPER_ADMIN')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                return new Response(JSON.stringify({ admins: data }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'get-pending-approvals': {
                if (!authUser) throw new Error('Unauthorized');
                
                const { data: profile } = await adminClient.from('app_users').select('role').eq('id', authUser.id).maybeSingle();
                if (profile?.role?.toUpperCase() !== 'SUPER_ADMIN') {
                    throw new Error('Unauthorized: Super Admin required');
                }

                const { data, error } = await adminClient
                    .from('companies')
                    .select(`
                        id,
                        name,
                        email,
                        plan,
                        status,
                        created_at,
                        owner:app_users!companies_owner_id_fkey (
                            name,
                            email
                        )
                    `)
                    .in('status', ['PENDING_PAYMENT', 'PENDING_APPROVAL'])
                    .order('created_at', { ascending: false });

                if (error) throw error;
                return new Response(JSON.stringify({ pending: data }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'approve-payment': {
                if (!authUser) throw new Error('Unauthorized');
                
                const { data: profile } = await adminClient.from('app_users').select('role').eq('id', authUser.id).maybeSingle();
                if (profile?.role?.toUpperCase() !== 'SUPER_ADMIN') {
                    throw new Error('Unauthorized: Super Admin required');
                }

                const { companyId } = payload;
                if (!companyId) throw new Error('Company ID is required for approval');

                const { data, error } = await adminClient
                    .from('companies')
                    .update({ status: 'ACTIVE' })
                    .eq('id', companyId)
                    .select();

                if (error) throw error;
                return new Response(JSON.stringify({ success: true, company: data }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'delete-account': {
                if (!authUser) throw new Error('Unauthorized');

                const { userId, userRole, companyId } = payload;
                if (!userId) throw new Error('userId required');

                // Verify the caller is deleting their own account, or is a Super Admin
                const { data: callerProfile } = await adminClient
                    .from('app_users')
                    .select('role')
                    .eq('id', authUser.id)
                    .maybeSingle();

                const callerIsSuper = callerProfile?.role?.toUpperCase() === 'SUPER_ADMIN';
                if (authUser.id !== userId && !callerIsSuper) {
                    throw new Error('Unauthorized: Can only delete your own account');
                }

                // Fetch user data to get auth_user_id
                const { data: targetUser, error: fetchErr } = await adminClient
                    .from('app_users')
                    .select('auth_user_id, company_id')
                    .eq('id', userId)
                    .maybeSingle();

                if (fetchErr) throw fetchErr;

                const authUserId = targetUser?.auth_user_id;
                const userCompanyId = companyId || targetUser?.company_id;

                // If OWNER, delete their company too
                if (userRole === 'OWNER' && userCompanyId) {
                    await adminClient.from('companies').delete().eq('id', userCompanyId);
                }

                // Delete app_users record
                const { error: deleteUserErr } = await adminClient
                    .from('app_users')
                    .delete()
                    .eq('id', userId);

                if (deleteUserErr) throw deleteUserErr;

                // Delete auth user (admin-only operation)
                if (authUserId) {
                    try {
                        await adminClient.auth.admin.deleteUser(authUserId);
                    } catch (authDeleteErr: any) {
                        console.warn('Warning: Could not delete auth user:', authDeleteErr.message);
                        // Non-fatal: app_users row is already gone
                    }
                }

                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'save-reseller-client': {
                if (!authUser) throw new Error('Unauthorized');

                const { resellerId, clientCompanyId, data: clientData } = payload;
                if (!resellerId || !clientCompanyId) throw new Error('resellerId and clientCompanyId required');

                const { error: upsertErr } = await adminClient
                    .from('reseller_clients')
                    .upsert({
                        reseller_id: resellerId,
                        client_company_id: clientCompanyId,
                        status: clientData?.status || 'ACTIVE',
                        access_level: clientData?.accessLevel || 'FULL',
                        monthly_base_fee: clientData?.monthlyBaseFee ?? 3000,
                        per_employee_fee: clientData?.perEmployeeFee ?? 100,
                        discount_rate: clientData?.discountRate ?? 0,
                        relationship_start_date: new Date().toISOString().split('T')[0],
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'reseller_id,client_company_id' });

                if (upsertErr) throw upsertErr;

                // Also link company to reseller
                await adminClient
                    .from('companies')
                    .update({ reseller_id: resellerId })
                    .eq('id', clientCompanyId);

                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            default:
                throw new Error(`Unknown action: ${action}`);
        }

    } catch (error: any) {
        console.error('Admin Handler Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
})
