import { supabase } from './supabaseClient';
import { emailService } from './emailService';
import { supabaseService } from './supabaseService';

export type MemberRole = 'admin' | 'manager';

export interface Invitation {
  id: string;
  account_id: string;
  email: string;
  invited_by: string;
  created_at: string;
  status: 'pending' | 'accepted' | 'declined';
  role: MemberRole;
  token: string;
}

export interface AccountMember {
  id: string;
  account_id: string;
  user_id: string;
  email: string;
  role: MemberRole;
  status: 'pending' | 'accepted';
  invited_at: string;
  accepted_at?: string;
}

/**
 * Search for an existing user by email in Supabase auth
 */
export async function searchUserByEmail(email: string): Promise<{ exists: boolean; userId?: string }> {
  if (!supabase) return { exists: false };
  
  try {
    // UPDATED: Use RPC helper to bypass RLS and find user safely
    const { data: userId, error } = await supabase.rpc('get_user_id_by_email', { 
      email_input: email.toLowerCase() 
    });

    if (error) {
       console.error('Error searching user (RPC):', error);
       return { exists: false };
    }

    return { exists: !!userId, userId: userId || undefined };
  } catch (error) {
    console.error('Error in searchUserByEmail:', error);
    return { exists: false };
  }
}

/**
 * Invite a user to manage an account (Team Members feature)
 * Supports two scenarios:
 * 1. If user exists: Check if they need to upgrade to Reseller to manage multiple companies
 * 2. If user doesn't exist: Create invitation with email only, link on signup
 */
export async function inviteUserToAccount(payload: {
  accountId: string;
  email: string;
  role: MemberRole;
  invitedBy: string;
}): Promise<{ success: boolean; error?: string; member?: AccountMember; requiresUpgrade?: boolean }> {
  if (!supabase) return { success: false, error: 'Database connection unavailable' };
  
  try {
    // Verify company exists
    const { data: companiesData, error: companyError } = await supabase
      .from('companies')
      .select('id, plan, owner_id, name')
      .eq('id', payload.accountId);

    if (companyError) {
      console.error('❌ Company lookup failed:', companyError);
      return { success: false, error: 'Company not found.' };
    }

    const company = Array.isArray(companiesData) && companiesData.length > 0 ? companiesData[0] : null;
    
    if (!company) {
      return { success: false, error: 'Company not found.' };
    }

    const companyName = company.name || 'Payroll-Jam';
    const normalizedEmail = payload.email.toLowerCase();

    // Check if user exists
    const { exists, userId } = await searchUserByEmail(normalizedEmail);

    // Check if already a member (by email, since user might not exist yet)
    const { data: existingByEmail } = await supabase
      .from('account_members')
      .select('id, user_id, status')
      .eq('account_id', payload.accountId)
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingByEmail) {
      if (existingByEmail.status === 'accepted') {
        return { success: false, error: 'User is already a member of this company.' };
      }
      // If pending, we can still proceed (might be resending)
    }

    // If user exists, check for upgrade requirement and existing membership by user_id
    let requiresUpgrade = false;
    if (exists && userId) {
      // Use admin client to check upgrade requirements to bypass RLS
      const adminClient = await supabaseService.getAdminClient();
      
      if (adminClient) {
          try {
              // 1. Check user profile
              const { data: userProfile } = await adminClient
                .from('app_users')
                .select('role, company_id')
                .eq('id', userId)
                .maybeSingle();
              
              console.log('🛡️ Admin check - User Profile:', userProfile);
                
              const role = userProfile?.role?.toUpperCase();
              const isReseller = role === 'RESELLER' || role === 'SUPERADMIN';
              
              if (!isReseller) {
                  // 2. Check all companies where they are OWNER or MEMBER
                  
                  // A. Find companies they own
                  const { data: ownedCompanies } = await adminClient
                    .from('companies')
                    .select('id, plan, name')
                    .eq('owner_id', userId);
                    
                  // B. Find companies where they are a member
                  const { data: memberships } = await adminClient
                    .from('account_members')
                    .select('account_id')
                    .eq('user_id', userId)
                    .eq('status', 'accepted');
                    
                  const memberCompanyIds = memberships?.map(m => m.account_id) || [];
                  
                  let memberCompanies: any[] = [];
                  if (memberCompanyIds.length > 0) {
                      const { data: mComp } = await adminClient
                        .from('companies')
                        .select('id, plan, name')
                        .in('id', memberCompanyIds);
                      memberCompanies = mComp || [];
                  }
                  
                  const allCompanies = [
                      ...(ownedCompanies || []),
                      ...memberCompanies
                  ];

                  console.log(`🛡️ Admin check - Found ${allCompanies.length} relevant companies for user ${userId}`);
                  console.log('🛡️ Admin check - Company details:', allCompanies);

                  if (allCompanies.length > 0) {
                      // If they already have any company AND none of them are Reseller/Enterprise plans, 
                      // then joining another company requires a Reseller upgrade.
                      const hasResellerPlan = allCompanies.some(c => 
                          c.plan === 'Enterprise' || c.plan === 'Reseller'
                      );
                      
                      if (!hasResellerPlan) {
                          requiresUpgrade = true;
                          console.log('⚠️ Invitee belongs to existing companies but none have a Reseller plan. Upgrade required.');
                      }
                  } else if (userProfile?.company_id) {
                      // fallback to profile's company_id if no memberships found
                      const { data: primaryComp } = await adminClient
                        .from('companies')
                        .select('id, plan, name')
                        .eq('id', userProfile.company_id)
                        .maybeSingle();
                        
                      console.log('🛡️ Admin check - Primary Company Fallback:', primaryComp);
                      
                      if (primaryComp && primaryComp.plan !== 'Enterprise') {
                          requiresUpgrade = true;
                          console.log('⚠️ Invitee primary company is non-reseller:', primaryComp.name);
                      }
                  }
              }
              console.log(`🛡️ Admin check complete. Role: ${role}, Requires Upgrade: ${requiresUpgrade}`);
          } catch (adminErr) {
              console.error('Error in admin upgrade check:', adminErr);
          }
      }

      // Check if already a member by user_id
      const { data: existingByUserId } = await supabase
        .from('account_members')
        .select('id')
        .eq('account_id', payload.accountId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingByUserId) {
        return { success: false, error: 'User is already a member of this company.' };
      }
    }

    // Create or update invitation (user_id can be null if user doesn't exist yet)
    const invitationData: any = {
      account_id: payload.accountId,
      email: normalizedEmail,
      role: payload.role,
      status: 'pending',
      invited_at: new Date().toISOString(),
    };

    if (userId) {
      invitationData.user_id = userId;
    }

    // Use upsert to handle resending invites
    const { data, error } = await supabase
      .from('account_members')
      .upsert(
        invitationData,
        {
          onConflict: 'account_id,email',
          ignoreDuplicates: false
        }
      )
      .select()
      .single();

    if (error) {
      console.error('Error creating/updating invitation:', error);
      return { success: false, error: error.message };
    }

    // Send invitation email
    try {
      // If user doesn't exist, we should direct them to signup.
      // If they do exist, we can direct them to the dashboard where they will see the acceptance prompt.
      const inviteLink = exists 
        ? `${window.location.origin}/?page=dashboard` 
        : `${window.location.origin}/?page=signup&email=${encodeURIComponent(normalizedEmail)}`;
      
      // Send manager invite email (for team member invitations)
      await emailService.sendManagerInvite(
        normalizedEmail,
        normalizedEmail.split('@')[0], // Use email prefix as name if unknown
        companyName,
        inviteLink,
        payload.role,
        requiresUpgrade // Pass upgrade requirement flag
      );
    } catch (emailError) {
      console.warn('Failed to send invitation email, but member was created:', emailError);
    }

    return { success: true, member: data as AccountMember, requiresUpgrade };
  } catch (error) {
    console.error('Error in inviteUserToAccount:', error);
    return { success: false, error: 'Failed to send invitation' };
  }
}

/**
 * Get all members of an account
 */
export async function getAccountMembers(accountId: string): Promise<AccountMember[]> {
  if (!supabase) return [];
  
  try {
    const { data, error } = await supabase
      .from('account_members')
      .select('*')
      .eq('account_id', accountId)
      .order('invited_at', { ascending: false });

    if (error) {
      console.error('Error fetching account members:', error);
      return [];
    }

    return (data || []) as AccountMember[];
  } catch (error) {
    console.error('Error in getAccountMembers:', error);
    return [];
  }
}

/**
 * Get user's role in an account
 */
export async function getUserRoleInAccount(
  accountId: string,
  userId: string
): Promise<MemberRole | null> {
  if (!supabase) return null;
  
  try {
    // 1. Check if user is the owner
    const { data: company } = await supabase
      .from('companies')
      .select('owner_id')
      .eq('id', accountId)
      .single();
      
    if (company && company.owner_id === userId) {
      return 'admin';
    }

    // 2. Check account members (use array return to avoid 406 errors)
    const { data, error } = await supabase
      .from('account_members')
      .select('role')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .limit(1);

    if (error) {
      console.error('Error fetching user role:', error);
      return null;
    }

    return (data && data.length > 0) ? data[0].role : null;
  } catch (error) {
    console.error('Error in getUserRoleInAccount:', error);
    return null;
  }
}

/**
 * Get pending invitations for an email address
 * Used during signup to check if new user has invitations waiting
 */
export async function getPendingInvitationsByEmail(
  email: string
): Promise<(AccountMember & { company_name?: string; inviter_name?: string; company_plan?: string })[]> {
  const client = supabase;
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('account_members')
      .select(
        `id, account_id, user_id, email, role, status, invited_at, accepted_at,
        companies:account_id (name, plan),
        inviter:companies!account_id (owner_id)
      `
      )
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .order('invited_at', { ascending: false });

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching pending invitations:', error);
      return [];
    }

    if (!data) return [];

    // Transform the data to flatten company and inviter info
    const invitations = await Promise.all(
      data.map(async (invite: any) => {
        let inviterName = 'Team';
        
        if (invite.inviter && Array.isArray(invite.inviter) && invite.inviter.length > 0) {
          const ownerId = invite.inviter[0].owner_id;
          if (ownerId) {
            const { data: inviterUser } = await client
              .from('app_users')
              .select('name')
              .eq('id', ownerId)
              .single();
            inviterName = inviterUser?.name || 'Team';
          }
        }

        let companyName = invite.companies?.[0]?.name as string | undefined;
        let companyPlan = invite.companies?.[0]?.plan as string | undefined;

          if (!companyName && invite.account_id) {
          try {
              const { data: summary, error: summaryError } = await client.rpc('get_company_invite_summary', {
              p_company_id: invite.account_id
            });

            if (!summaryError && summary) {
              const summaryRow = Array.isArray(summary) ? summary[0] : summary;
              companyName = summaryRow?.company_name || companyName;
              companyPlan = summaryRow?.company_plan || companyPlan;
            } else if (summaryError) {
              console.warn('Could not load company invite summary:', summaryError);
            }
          } catch (summaryException) {
            console.warn('Exception fetching company invite summary:', summaryException);
          }
        }

        return {
          ...invite,
          company_name: companyName || 'Unknown Company',
          company_plan: companyPlan || 'Free',
          inviter_name: inviterName
        };
      })
    );

    return invitations;
  } catch (error) {
    console.error('Error in getPendingInvitationsByEmail:', error);
    return [];
  }
}

/**
 * Get invitation details for display during acceptance
 */
export async function getInvitationDetails(accountId: string): Promise<{
  company_name: string;
  company_plan: string;
  inviter_name: string;
} | null> {
  if (!supabase) return null;

  try {
    const { data: company } = await supabase
      .from('companies')
      .select('id, name, plan, owner_id')
      .eq('id', accountId)
      .single();

    if (!company) return null;

    const { data: inviter } = await supabase
      .from('app_users')
      .select('name')
      .eq('id', company.owner_id)
      .single();

    return {
      company_name: company.name,
      company_plan: company.plan,
      inviter_name: inviter?.name || 'Team'
    };
  } catch (error) {
    console.error('Error in getInvitationDetails:', error);
    return null;
  }
}

/**
 * Accept an invitation and optionally mark email as verified
 */
export async function acceptInvitation(
  accountId: string,
  userId: string,
  verifyEmail = true
): Promise<boolean> {
  const client = supabase;
  if (!client) return false;

  try {
    // Determine if we should match by user_id or if we need to find it by something else
    // If the user already exists, they might be in account_members with their user_id
    // If they just signed up, they might only be there by email.
    
    // First, try updating by user_id
    const { error: updateError, data: updatedRows } = await client
      .from('account_members')
      .update({ 
        status: 'accepted', 
        user_id: userId,
        accepted_at: new Date().toISOString() 
      })
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .select();

    let success = !updateError && updatedRows && updatedRows.length > 0;

    // If that didn't work, maybe the invitation exists but user_id is null?
    if (!success) {
        // Get user's email to try matching by email
        const { data: userAuth } = await client.auth.getUser();
        const userEmail = userAuth.user?.email;
        
        if (userEmail) {
            const { error: emailUpdateError, data: emailUpdatedRows } = await client
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
    }

    if (!success) {
      console.error('Failed to accept invitation: No matching pending invitation found.');
      return false;
    }

    // NEW: If user is a Reseller, also add this company to their reseller portfolio
    // This allows clients to "Invite" their Reseller partner directly
    try {
        console.log(`🔍 Checking if user ${userId} is a Reseller...`);
        // Use admin permissions to check user role to avoid RLS issues
        const serviceRoleKey = import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY || localStorage.getItem('VITE_SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || localStorage.getItem('VITE_SUPABASE_URL');
        
        let targetRole: string | null = null;
        let targetCompanyId: string | null = null;

        if (serviceRoleKey && supabaseUrl) {
            console.log('🛡️ Using Admin Client for role check...');
            const { createClient } = await import('@supabase/supabase-js');
            const adminClient = createClient(supabaseUrl, serviceRoleKey);
            const { data: userData, error: userError } = await adminClient.from('app_users').select('role, company_id').eq('id', userId).maybeSingle();
            if (userError) console.error('❌ Error fetching user data via admin:', userError);
            targetRole = userData?.role;
            targetCompanyId = userData?.company_id;
        } else {
            console.log('👥 Using Standard Client for role check...');
            const { data: userData, error: userError } = await client.from('app_users').select('role, company_id').eq('id', userId).maybeSingle();
            if (userError) console.error('❌ Error fetching user data via standard client:', userError);
            targetRole = userData?.role;
            targetCompanyId = userData?.company_id;
        }

        console.log(`👤 User data found: role=${targetRole}, companyId=${targetCompanyId}`);

        // Handle both 'RESELLER' and 'Reseller' just in case
        const isReseller = targetRole === 'RESELLER' || targetRole === 'Reseller';

        if (isReseller && targetCompanyId) {
            console.log('🔄 Accepting user is a Reseller, linking client company to portfolio...');
            
            if (serviceRoleKey && supabaseUrl) {
                const { createClient } = await import('@supabase/supabase-js');
                const adminClient = createClient(supabaseUrl, serviceRoleKey);
                
                // 1. Create portfolio link
                console.log(`🔗 Creating reseller_clients link: reseller=${targetCompanyId}, client=${accountId}`);
                const { error: linkError } = await adminClient.from('reseller_clients').upsert({
                    reseller_id: targetCompanyId,
                    client_company_id: accountId,
                    status: 'ACTIVE',
                    access_level: 'FULL'
                }, { onConflict: 'reseller_id,client_company_id' });

                if (linkError) {
                    console.error('❌ Error creating reseller_clients link:', linkError);
                } else {
                    console.log('✅ reseller_clients link created/updated');
                }

                // 2. Link company to reseller
                console.log(`🔗 Updating company reseller_id: company=${accountId}, reseller=${targetCompanyId}`);
                const { error: companyUpdateError } = await adminClient.from('companies').update({ reseller_id: targetCompanyId }).eq('id', accountId);
                
                if (companyUpdateError) {
                    console.error('❌ Error updating company reseller_id:', companyUpdateError);
                } else {
                    console.log('✅ Company reseller_id updated');
                }
                
                console.log('✅ Portfolio link established for Reseller via Admin Client');
            } else {
                console.warn('⚠️ No Admin Key available, attempting linkage via standard client...');
                // Best effort if no admin key
                await client.from('reseller_clients').upsert({
                    reseller_id: targetCompanyId,
                    client_company_id: accountId,
                    status: 'ACTIVE',
                    access_level: 'FULL'
                }, { onConflict: 'reseller_id,client_company_id' });
                await client.from('companies').update({ reseller_id: targetCompanyId }).eq('id', accountId);
            }
        } else {
            if (!isReseller) console.log('ℹ️ User is not a Reseller, skipping portfolio linking.');
            if (!targetCompanyId) console.log('ℹ️ User has no company_id, skipping portfolio linking.');
        }
    } catch (assocError) {
        console.warn('Non-fatal error establishing reseller association:', assocError);
    }

    // Mark email as verified in auth.users if verifyEmail flag is true
    // This proves they own the email since they received and accepted the invitation
    if (verifyEmail) {
      try {
        const { error: verifyError } = await client.auth.admin.updateUserById(userId, {
          email_confirm: true
        });

        if (verifyError) {
          console.warn('Warning: Could not mark email as verified:', verifyError);
          // Don't fail the acceptance just because email verification failed
        } else {
          console.log('✅ Email marked as verified via invitation acceptance');
        }
      } catch (verifyException) {
        console.warn('Warning: Exception marking email verified:', verifyException);
        // Non-fatal: continue even if verification marking fails
      }
    }

    return true;
  } catch (error) {
    console.error('Error in acceptInvitation:', error);
    return false;
  }
}

/**
 * Accept multiple invitations at once (for when user has multiple pending)
 * Updates invitations by ID and sets user_id (works even if user_id was null when invitation was created)
 */
export async function acceptMultipleInvitations(
  invitationIds: string[],
  userId: string,
  verifyEmail = true,
  userEmail?: string
): Promise<{ success: boolean; acceptedCount: number; failedCount: number }> {
  if (!supabase) return { success: false, acceptedCount: 0, failedCount: 0 };

  let acceptedCount = 0;
  let failedCount = 0;

  try {
    // Update invitations by ID (this works even if user_id was null when created)
    // We match by ID and optionally by email to ensure we're updating the right invitations
    let query = supabase
      .from('account_members')
      .update({ 
        status: 'accepted', 
        user_id: userId,
        accepted_at: new Date().toISOString() 
      })
      .in('id', invitationIds);

    // If email is provided, also match by email for extra safety
    if (userEmail) {
      query = query.eq('email', userEmail.toLowerCase());
    }

    const { error: updateError } = await query;

    if (updateError) {
      console.error('Error accepting invitations:', updateError);
      return { success: false, acceptedCount: 0, failedCount: invitationIds.length };
    }

    acceptedCount = invitationIds.length;

    // NEW: If user is a Reseller, also link these companies to their reseller portfolio
    try {
        console.log(`🔍 Checking if accepting user ${userId} is a Reseller (Multiple)...`);
        
        // Use credentials for admin lookup to bypass potential RLS issues
        const serviceRoleKey = import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY || localStorage.getItem('VITE_SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || localStorage.getItem('VITE_SUPABASE_URL');
        
        let targetRole: string | null = null;
        let targetCompanyId: string | null = null;

        if (serviceRoleKey && supabaseUrl) {
            const { createClient } = await import('@supabase/supabase-js');
            const adminClient = createClient(supabaseUrl, serviceRoleKey);
            const { data: userData } = await adminClient.from('app_users').select('role, company_id').eq('id', userId).maybeSingle();
            targetRole = userData?.role;
            targetCompanyId = userData?.company_id;
        } else {
            const { data: userData } = await supabase.from('app_users').select('role, company_id').eq('id', userId).maybeSingle();
            targetRole = userData?.role;
            targetCompanyId = userData?.company_id;
        }

        console.log(`👤 User data found (Multiple): role=${targetRole}, companyId=${targetCompanyId}`);

        if (targetRole === 'RESELLER' && targetCompanyId) {
            console.log('🔄 Accepting user is a Reseller, linking accepted companies to portfolio...');
            
            // Fetch account_ids for the invitations we just accepted
            const { data: acceptedInvites } = await supabase
                .from('account_members')
                .select('account_id')
                .in('id', invitationIds);
                
            if (acceptedInvites && acceptedInvites.length > 0) {
                if (serviceRoleKey && supabaseUrl) {
                    const { createClient } = await import('@supabase/supabase-js');
                    const adminClient = createClient(supabaseUrl, serviceRoleKey);
                    
                    for (const invite of acceptedInvites) {
                        console.log(`🔗 Linking company ${invite.account_id} to Reseller portfolio...`);
                        // 1. Create portfolio link
                        await adminClient.from('reseller_clients').upsert({
                            reseller_id: targetCompanyId,
                            client_company_id: invite.account_id,
                            status: 'ACTIVE',
                            access_level: 'FULL'
                        }, { onConflict: 'reseller_id,client_company_id' });

                        // 2. Link company to reseller
                        await adminClient.from('companies').update({ reseller_id: targetCompanyId }).eq('id', invite.account_id);
                    }
                    console.log(`✅ Portfolio links established for ${acceptedInvites.length} companies via Admin Client`);
                } else {
                    for (const invite of acceptedInvites) {
                        await supabase.from('reseller_clients').upsert({
                            reseller_id: targetCompanyId,
                            client_company_id: invite.account_id,
                            status: 'ACTIVE',
                            access_level: 'FULL'
                        }, { onConflict: 'reseller_id,client_company_id' });
                        await supabase.from('companies').update({ reseller_id: targetCompanyId }).eq('id', invite.account_id);
                    }
                }
            }
        }
    } catch (assocError) {
        console.warn('Non-fatal error establishing reseller associations:', assocError);
    }

    // Mark email as verified in auth.users if flag is true
    if (verifyEmail) {
      try {
        await supabase!.auth.admin.updateUserById(userId, {
          email_confirm: true
        });
        console.log('✅ Email marked as verified via invitation acceptance');
      } catch (verifyException) {
        console.warn('Warning: Exception marking email verified:', verifyException);
        // Non-fatal
      }
    }

    return { success: true, acceptedCount, failedCount };
  } catch (error) {
    console.error('Error in acceptMultipleInvitations:', error);
    return { success: false, acceptedCount, failedCount: invitationIds.length - acceptedCount };
  }
}

/**
 * Decline an invitation
 */
export async function declineInvitation(accountId: string, userId: string): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('account_members')
      .update({ status: 'declined' })
      .eq('account_id', accountId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error declining invitation:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in declineInvitation:', error);
    return false;
  }
}

/**
 * Remove a member from an account (admin only)
 */
export async function removeMemberFromAccount(
  accountId: string,
  memberId: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Database connection unavailable' };
  
  try {
    const { error } = await supabase
      .from('account_members')
      .delete()
      .eq('account_id', accountId)
      .eq('id', memberId);

    if (error) {
      console.error('Error removing member:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in removeMemberFromAccount:', error);
    return { success: false, error: 'Failed to remove member' };
  }
}

/**
 * Resend invitation to a pending member
 */
export async function resendInvitation(memberId: string): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Database connection unavailable' };

  try {
    // 1. Get member details + company details
    const { data: member, error: memberError } = await supabase
      .from('account_members')
      .select('*, companies:account_id(name)')
      .eq('id', memberId)
      .single();

    if (memberError || !member) {
      console.error('Error fetching member for resend:', memberError);
      return { success: false, error: 'Member not found' };
    }

    if (member.status !== 'pending') {
      return { success: false, error: 'User has already accepted the invitation' };
    }

    // 2. Prepare email data
    const email = member.email;
    const role = member.role;
    // @ts-ignore
    const companyName = member.companies?.name || 'Payroll-Jam';
    
    // 3. Send email using the same logic as inviteUserToAccount
    if (role === 'admin' || role === 'manager') {
       await emailService.sendManagerInvite(
          email,
          email.split('@')[0], 
          companyName,
          `${window.location.origin}/?page=dashboard`,
          role
        );
    } else {
        await emailService.sendInvite(
          email,
          email.split('@')[0],
          `${window.location.origin}/?page=settings&section=team`
        );
    }
    
    // 4. Update invited_at timestamp to show it was resent
    await supabase
      .from('account_members')
      .update({ invited_at: new Date().toISOString() })
      .eq('id', memberId);

    return { success: true };

  } catch (error) {
     console.error('Error resending invitation:', error);
     return { success: false, error: 'Failed to resend invitation' };
  }
}
