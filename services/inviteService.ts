import { supabase } from './supabaseClient';
import { emailService } from './emailService';

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
    const { data, error } = await supabase
      .from('app_users')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (not an error)
      console.error('Error searching user:', error);
      return { exists: false };
    }

    return { exists: !!data, userId: data?.id };
  } catch (error) {
    console.error('Error in searchUserByEmail:', error);
    return { exists: false };
  }
}

/**
 * Invite a user to manage an account
 * If invitee already manages a non-Reseller account, warn them to upgrade to Reseller
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
      .select('id, plan, owner_id')
      .eq('id', payload.accountId);

    if (companyError) {
      console.error('❌ Company lookup failed:', companyError);
      return { success: false, error: 'Company not found.' };
    }

    const company = Array.isArray(companiesData) && companiesData.length > 0 ? companiesData[0] : null;
    
    if (!company) {
      return { success: false, error: 'Company not found.' };
    }

    // Check if user exists
    const { exists, userId } = await searchUserByEmail(payload.email);

    if (!exists || !userId) {
      console.error('❌ User search failed for email:', payload.email);
      return { success: false, error: 'User not found. They need to sign up first.' };
    }

    // Check if invitee already manages a non-Reseller company
    // Users can only manage one company unless they are a Reseller
    let requiresUpgrade = false;
    const { data: inviteeCompanies } = await supabase
      .from('companies')
      .select('id, plan')
      .eq('owner_id', userId);

    if (inviteeCompanies && inviteeCompanies.length > 0) {
      // Invitee already owns company/companies
      const hasNonResellerCompany = inviteeCompanies.some((comp: any) => comp.plan !== 'Reseller');
      if (hasNonResellerCompany) {
        requiresUpgrade = true;
        // Will warn them in the email to upgrade to Reseller to manage multiple companies
      }
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from('account_members')
      .select('id')
      .eq('account_id', payload.accountId)
      .eq('user_id', userId)
      .single();

    if (existing) {
      return { success: false, error: 'User is already a member of this company.' };
    }

    // Create invitation
    const { data, error } = await supabase
      .from('account_members')
      .insert([
        {
          account_id: payload.accountId,
          user_id: userId,
          email: payload.email.toLowerCase(),
          role: payload.role,
          status: 'pending',
          invited_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating invitation:', error);
      return { success: false, error: error.message };
    }

    // Send invitation email
    try {
      // Include upgrade message for invitees who already manage non-Reseller companies
      if (requiresUpgrade) {
        console.log('ℹ️ Invitee will need to upgrade to Reseller to manage multiple companies');
      }
      
      // Send the appropriate type of invitation email based on role
      if (payload.role === 'admin' || payload.role === 'manager') {
        // This is a management invitation (reseller/manager/admin)
        // Get company name first
        const { data: companyData } = await supabase
          .from('companies')
          .select('name')
          .eq('id', payload.accountId)
          .single();
          
        const companyName = companyData?.name || 'Payroll-Jam';
        
        await emailService.sendManagerInvite(
          payload.email,
          payload.email.split('@')[0], // Use email prefix as name if unknown
          companyName,
          `${window.location.origin}/?page=dashboard`, // Direct to dashboard where invite UI exists
          payload.role
        );
      } else {
        // Standard employee invite (existing flow)
        await emailService.sendInvite(
          payload.email,
          payload.email.split('@')[0],
          `${window.location.origin}/?page=settings&section=team`
        );
      }
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
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
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
          if (ownerId && supabase) {
            const { data: inviterUser } = await supabase
              .from('app_users')
              .select('name')
              .eq('id', ownerId)
              .single();
            inviterName = inviterUser?.name || 'Team';
          }
        }

        return {
          ...invite,
          company_name: invite.companies?.[0]?.name || 'Unknown Company',
          company_plan: invite.companies?.[0]?.plan || 'Free',
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
    const { error: updateError } = await supabase
      .from('account_members')
      .update({ 
        status: 'accepted', 
        user_id: userId,
        accepted_at: new Date().toISOString() 
      })
      .eq('account_id', accountId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error accepting invitation:', updateError);
      return false;
    }

    // Mark email as verified in auth.users if verifyEmail flag is true
    // This proves they own the email since they received and accepted the invitation
    if (verifyEmail) {
      try {
        const { error: verifyError } = await supabase.auth.admin.updateUserById(userId, {
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
 */
export async function acceptMultipleInvitations(
  invitationIds: string[],
  userId: string,
  verifyEmail = true
): Promise<{ success: boolean; acceptedCount: number; failedCount: number }> {
  if (!supabase) return { success: false, acceptedCount: 0, failedCount: 0 };

  let acceptedCount = 0;
  let failedCount = 0;

  try {
    const { error: updateError } = await supabase
      .from('account_members')
      .update({ 
        status: 'accepted', 
        user_id: userId,
        accepted_at: new Date().toISOString() 
      })
      .in('id', invitationIds);

    if (updateError) {
      console.error('Error accepting invitations:', updateError);
      return { success: false, acceptedCount: 0, failedCount: invitationIds.length };
    }

    acceptedCount = invitationIds.length;

    // Mark email as verified in auth.users if flag is true
    if (verifyEmail) {
      try {
        await supabase.auth.admin.updateUserById(userId, {
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
