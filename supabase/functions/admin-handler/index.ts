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

            case 'delete-super-admin': {
                const { userId } = payload;
                const { error } = await adminClient.auth.admin.deleteUser(userId);
                if (error) throw error;
                return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
