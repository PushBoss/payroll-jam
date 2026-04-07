// @ts-ignore: Deno remote import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore: Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// @ts-ignore: Deno global
declare const Deno: any;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
            
            case 'onboard-confirmed-user': {
                const { email, password, name } = payload;
                // Only allow this if perhaps we don't have strict authUser constraints, or specifically reseller/owner
                const { data, error } = await adminClient.auth.admin.createUser({
                    email,
                    password,
                    email_confirm: true,
                    user_metadata: {
                        full_name: name
                    }
                });
                
                if (error) throw error;
                return new Response(JSON.stringify({ user: data.user }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
                        const hasResellerPlan = allCompanies.some((c: any) => c.plan === 'Enterprise' || c.plan === 'Reseller');
                        if (!hasResellerPlan) requiresUpgrade = true;
                    } else if (userProfile?.company_id) {
                        const { data: primaryComp } = await adminClient
                          .from('companies')
                          .select('id, plan, name')
                          .eq('id', userProfile.company_id)
                          .maybeSingle();

                        if (primaryComp && primaryComp.plan !== 'Enterprise') requiresUpgrade = true;
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
                        .eq('company_id', c.id);

                    const planMap: Record<string, string> = {
                        'Free': 'Free', 'Starter': 'Starter',
                        'Professional': 'Pro', 'Enterprise': 'Enterprise'
                    };

                    return {
                        id: c.id,
                        companyName: c.name,
                        email: c.email || ownerData?.email || '',
                        contactName: ownerData?.name || c.settings?.contactName || 'N/A',
                        plan: planMap[c.plan] || 'Free',
                        status: c.status || 'ACTIVE',
                        employeeCount: empCount || 0,
                        mrr: c.settings?.mrr || 0,
                        createdAt: c.created_at
                    };
                }));

                return new Response(JSON.stringify({ companies: enriched, total: count }), {
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
                const { companyId } = payload;
                if (!companyId) throw new Error('companyId required');

                // 1. Validate Caller role
                if (!authUser) throw new Error('Unauthorized');
                const { data: callerProfile } = await adminClient
                    .from('app_users')
                    .select('role, company_id')
                    .eq('id', authUser.id)
                    .maybeSingle();

                const callerRole = callerProfile?.role?.toUpperCase();
                const isSuperAdmin = callerRole === 'SUPER_ADMIN';
                const isReseller = callerRole === 'RESELLER';

                if (!isSuperAdmin && !isReseller) {
                    throw new Error('Unauthorized: Admin or Reseller role required');
                }

                // 2. If Reseller, validate relationship
                if (isReseller) {
                    const { data: relationship } = await adminClient
                        .from('reseller_clients')
                        .select('*')
                        .eq('reseller_id', callerProfile.company_id)
                        .eq('client_company_id', companyId)
                        .eq('status', 'ACTIVE')
                        .maybeSingle();

                    if (!relationship) {
                        // Also check if they are a member of the team
                        const { data: membership } = await adminClient
                            .from('account_members')
                            .select('*')
                            .eq('account_id', companyId)
                            .eq('user_id', authUser.id)
                            .eq('status', 'accepted')
                            .maybeSingle();

                        if (!membership) {
                            throw new Error('Unauthorized: No relationship with this company');
                        }
                    }
                }

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
                    adminClient.from('pay_runs').select('*').eq('company_id', companyId).order('period_start', { ascending: false }),
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
                    { data: activeCompanies }
                ] = await Promise.all([
                    adminClient.from('companies').select('*', { count: 'exact', head: true }),
                    adminClient.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
                    adminClient.from('companies').select('*', { count: 'exact', head: true }).in('status', ['PENDING_PAYMENT', 'PENDING_APPROVAL']),
                    adminClient.from('employees').select('*', { count: 'exact', head: true }),
                    adminClient.from('companies').select('settings').eq('status', 'ACTIVE')
                ]);

                // Sum up MRR from settings
                const totalMRR = (activeCompanies || []).reduce((sum: number, c: any) => sum + (c.settings?.mrr || 0), 0);

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
