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

    if ((callerRole === 'OWNER' || callerRole === 'ADMIN' || callerRole === 'RESELLER') && callerProfile.company_id === companyId) {
        return callerProfile;
    }

    if (callerRole === 'OWNER' || callerRole === 'ADMIN' || callerRole === 'RESELLER') {
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

        // --- Handle Actions ---
        
        switch (action) {
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
                const from = page * pageSize;
                const to = from + pageSize - 1;

                const { data: companies, error: compError, count } = await adminClient
                    .from('companies')
                    .select('id, name, email, plan, status, settings, created_at', { count: 'exact' })
                    .order('created_at', { ascending: false })
                    .range(from, to);

                if (compError) throw compError;

                // Enrich with owner name from app_users
                const enriched = await Promise.all((companies || []).map(async (c: any) => {
                    const billingGift = toBillingGift(c.settings?.billingGift);
                    const { data: ownerData } = await adminClient
                        .from('app_users')
                        .select('name, email')
                        .eq('company_id', c.id)
                        .in('role', ['OWNER', 'ADMIN'])
                        .order('role', { ascending: true }) // ADMIN < OWNER alphabetically, but OWNER preferred
                        .limit(1)
                        .maybeSingle();

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
                        contactName: ownerData?.name || c.settings?.contactName || 'N/A',
                        plan: normalizePlanToFrontend(c.plan),
                        status: c.status || 'ACTIVE',
                        billingGift,
                        hasActiveBillingGift: isBillingGiftActive(billingGift),
                        employeeCount: activeEmployeeCount,
                        mrr,
                        createdAt: c.created_at
                    };
                }));

                return new Response(JSON.stringify({ companies: enriched, total: count }), {
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
