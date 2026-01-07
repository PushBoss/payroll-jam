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
    // Verify account exists (any tier can have team members invited)
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, subscription_plan, owner_id')
      .eq('id', payload.accountId)
      .single();

    if (accountError) {
      console.error('❌ Account lookup failed:', accountError);
      return { success: false, error: 'Account not found.' };
    }

    if (!account) {
      return { success: false, error: 'Account not found.' };
    }

    // Check if user exists
    const { exists, userId } = await searchUserByEmail(payload.email);

    if (!exists || !userId) {
      console.error('❌ User search failed for email:', payload.email);
      return { success: false, error: 'User not found. They need to sign up first.' };
    }

    // Check if invitee already manages a non-Reseller account
    // Users can only manage one account unless they are a Reseller
    let requiresUpgrade = false;
    const { data: inviteeAccounts } = await supabase
      .from('accounts')
      .select('id, subscription_plan')
      .eq('owner_id', userId);

    if (inviteeAccounts && inviteeAccounts.length > 0) {
      // Invitee already manages account(s)
      const hasNonResellerAccount = inviteeAccounts.some((acc: any) => acc.subscription_plan !== 'Reseller');
      if (hasNonResellerAccount) {
        requiresUpgrade = true;
        // Will warn them in the email to upgrade to Reseller to manage multiple accounts
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
      return { success: false, error: 'User is already a member of this account.' };
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
      // Include upgrade message for invitees who already manage non-Reseller accounts
      if (requiresUpgrade) {
        console.log('ℹ️ Invitee will need to upgrade to Reseller to manage multiple accounts');
      }
      
      await emailService.sendInvite(
        payload.email,
        payload.email.split('@')[0],
        `${window.location.origin}/?page=settings&section=team`
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
    const { data, error } = await supabase
      .from('account_members')
      .select('role')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user role:', error);
      return null;
    }

    return data?.role || null;
  } catch (error) {
    console.error('Error in getUserRoleInAccount:', error);
    return null;
  }
}

/**
 * Accept an invitation
 */
export async function acceptInvitation(accountId: string, userId: string): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('account_members')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('account_id', accountId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error accepting invitation:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in acceptInvitation:', error);
    return false;
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
