import { supabase } from '../../services/supabaseClient';
import { emailService } from '../../services/emailService';
import { buildAppUrl } from '../../app/routes';


export type MemberRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'RESELLER' | 'owner' | 'admin' | 'manager' | 'employee' | 'reseller';

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
export async function searchUserByEmail(email: string): Promise<{ exists: boolean; userId?: string; role?: string; companyId?: string }> {
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
    if (!userId) return { exists: false };

    // UPDATED: Use admin-handler to safely search profile bypassing RLS
    let userProfile = null;
    try {
      const { data: resData, error: invokeError } = await supabase.functions.invoke('admin-handler', {
        body: { action: 'get-user-admin', payload: { email } }
      });
      if (!invokeError && resData) {
        userProfile = resData.user;
      }
    } catch (e) {
      console.warn('Failed to fetch user profile via admin query', e);
    }

    return {
      exists: true,
      userId,
      role: userProfile?.role,
      companyId: userProfile?.company_id
    };
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
    const { exists, userId, role: inviteeRole } = await searchUserByEmail(normalizedEmail);
    console.log(`🔍 Inviting user: ${normalizedEmail}, Exists: ${exists}, ID: ${userId}, Role: ${inviteeRole}`);

    // 🔍 2. Check for existing Reseller if the invitee is a Reseller
    // Companies can only be managed by one Reseller company at a time
    const isInviteeReseller = inviteeRole === 'RESELLER' || inviteeRole === 'SUPER_ADMIN';

    if (isInviteeReseller) {
      try {
        const { data: checkData, error: checkError } = await supabase.functions.invoke('admin-handler', {
          body: { action: 'check-reseller-management', payload: { accountId: payload.accountId } }
        });
        if (!checkError && checkData?.hasExistingReseller) {
          return { success: false, error: 'This company is already managed by a Reseller. Please remove the existing Reseller before adding a new one.' };
        }
      } catch (e) {
        console.warn('Could not verify existing resellers:', e);
      }
    }

    // 🔍 1. Check total member limit (5)
    // Alias counts (pending invites) and existing members all count towards this
    const { count, error: countError } = await supabase
      .from('account_members')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', payload.accountId);

    if (countError) {
      console.error('Error counting members:', countError);
    } else if (count !== null && count >= 5) {
      // Small optimization: If we are just updating/resending to an existing record, we skip the limit
      const { data: alreadyMember } = await supabase
        .from('account_members')
        .select('id')
        .eq('account_id', payload.accountId)
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (!alreadyMember) {
        return { success: false, error: 'Maximum limit of 5 team members reached for this company.' };
      }
    }

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
      try {
        const { data: upgradeData, error: upgradeErr } = await supabase.functions.invoke('admin-handler', {
          body: { action: 'check-upgrade-requirement', payload: { userId } }
        });
        if (!upgradeErr && upgradeData?.requiresUpgrade) {
          requiresUpgrade = true;
          console.log('⚠️ Upgrade requirement verified via edge function.');
        }
      } catch (err) {
        console.warn('Could not verify upgrade requirement:', err);
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
    let { data, error } = await supabase
      .from('account_members')
      .upsert(
        invitationData,
        {
          onConflict: 'account_id,email',
          ignoreDuplicates: false
        }
      )
      .select()
      .maybeSingle();

    // Fallback: If 400 (likely missing constraint) and we have a userId, try account_id,user_id
    if (error && (error.code === '400' || (error as any).status === 400) && invitationData.user_id) {
      console.warn('⚠️ account_id+email constraint missing, retrying with user_id...');
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('account_members')
        .upsert(
          invitationData,
          {
            onConflict: 'account_id,user_id',
            ignoreDuplicates: false
          }
        )
        .select()
        .maybeSingle();
      data = fallbackData;
      error = fallbackError;
    }

    if (error) {
      console.error('Error creating/updating invitation:', error);
      return { success: false, error: error.message };
    }

    // Send invitation email
    try {
      // If user doesn't exist, we should direct them to signup.
      // If they do exist, we can direct them to the dashboard where they will see the acceptance prompt.
      const inviteLink = exists
        ? buildAppUrl('dashboard')
        : buildAppUrl('signup', { email: normalizedEmail, invitation: 'true' });

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
      return 'OWNER';
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
  if (!supabase) return [];

  try {
    const { data: invokeData, error: invokeError } = await supabase.functions.invoke('admin-handler', {
      body: { action: 'get-pending-invitations', payload: { email } }
    });

    if (invokeError) {
      console.error('Error fetching pending invitations:', invokeError);
      return [];
    }

    const data = invokeData?.data;
    if (!data) return [];

    // Transform the data to flatten company and inviter info
    const invitations = await Promise.all(
      data.map(async (invite: any) => {
        let inviterName = 'Team';

        if (invite.inviter && Array.isArray(invite.inviter) && invite.inviter.length > 0) {
          const ownerId = invite.inviter[0].owner_id;
          if (ownerId && supabase) {
            const { data: inviterUser } = await supabase
              .from('app_users')
              .select('name')
              .eq('id', ownerId)
              .single();
            inviterName = inviterUser?.name || 'Team';
          }

        }

        let companyName = invite.companies?.[0]?.name as string | undefined;
        let companyPlan = invite.companies?.[0]?.plan as string | undefined;

        if (!companyName && invite.account_id && supabase) {
          try {
            const { data: summary, error: summaryError } = await supabase.rpc('get_company_invite_summary', {
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
  if (!supabase) return false;

  try {
    const { data, error } = await supabase.functions.invoke('admin-handler', {
      body: { action: 'accept-invitation', payload: { accountId, userId, verifyEmail } }
    });

    if (error) {
      console.error('Error accepting invitation:', error);
      return false;
    }

    // AUDIT LOG
    try {
      await supabase.from('audit_logs').insert({
        company_id: accountId,
        actor_id: userId,
        action: 'UPDATE',
        entity: 'ACCOUNT_MEMBER',
        entity_id: accountId,
        description: `Accepted invitation to company ${accountId}`
      });
    } catch (auditErr) {
      console.warn('⚠️ Failed to log invitation acceptance audit:', auditErr);
    }

    return data?.success || false;
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
  try {
    const { data, error } = await supabase.functions.invoke('admin-handler', {
      body: { 
        action: 'accept-invitation', 
        payload: { invitationIds, userId, verifyEmail, userEmail } 
      }
    });

    if (error) {
      console.error('Error accepting multiple invitations:', error);
      return { success: false, acceptedCount: 0, failedCount: invitationIds.length };
    }

    return {
      success: data?.success || false,
      acceptedCount: data?.acceptedCount || 0,
       failedCount: invitationIds.length - (data?.acceptedCount || 0)
    };
  } catch (err) {
    console.error('Error in acceptMultipleInvitations:', err);
    return { success: false, acceptedCount: 0, failedCount: invitationIds.length };
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
    if (role === 'ADMIN' || role === 'MANAGER' || role === 'OWNER' || role === 'admin' || role === 'manager' || role === 'owner') {
      await emailService.sendManagerInvite(
        email,
        email.split('@')[0],
        companyName,
        buildAppUrl('dashboard'),
        role
      );
    } else {
      await emailService.sendInvite(
        email,
        email.split('@')[0],
        buildAppUrl('settings', { section: 'team' })
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
