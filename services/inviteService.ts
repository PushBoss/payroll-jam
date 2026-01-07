import { supabaseService } from './supabaseService';
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
  try {
    const { data, error } = await supabaseService.supabase
      .from('profiles')
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
 * Invite a user to an account
 */
export async function inviteUserToAccount(payload: {
  accountId: string;
  email: string;
  role: MemberRole;
  invitedBy: string;
}): Promise<{ success: boolean; error?: string; member?: AccountMember }> {
  try {
    // Verify account exists and is a reseller account
    const { data: account, error: accountError } = await supabaseService.supabase
      .from('accounts')
      .select('id, subscription_plan, owner_id')
      .eq('id', payload.accountId)
      .single();

    if (accountError || !account) {
      return { success: false, error: 'Account not found.' };
    }

    if (account.subscription_plan !== 'Reseller') {
      return { success: false, error: 'Only Reseller accounts can invite team members.' };
    }

    // Check if user exists
    const { exists, userId } = await searchUserByEmail(payload.email);

    if (!exists) {
      return { success: false, error: 'User not found. They need to sign up first.' };
    }

    // Check if already a member
    const { data: existing } = await supabaseService.supabase
      .from('account_members')
      .select('id')
      .eq('account_id', payload.accountId)
      .eq('user_id', userId)
      .single();

    if (existing) {
      return { success: false, error: 'User is already a member of this account.' };
    }

    // Create invitation
    const { data, error } = await supabaseService.supabase
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
      await emailService.sendInvite(
        payload.email,
        payload.email.split('@')[0],
        `${window.location.origin}/?page=settings&section=team`
      );
    } catch (emailError) {
      console.warn('Failed to send invitation email, but member was created:', emailError);
    }

    return { success: true, member: data as AccountMember };
  } catch (error) {
    console.error('Error in inviteUserToAccount:', error);
    return { success: false, error: 'Failed to send invitation' };
  }
}

/**
 * Get all members of an account
 */
export async function getAccountMembers(accountId: string): Promise<AccountMember[]> {
  try {
    const { data, error } = await supabaseService.supabase
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
  try {
    const { data, error } = await supabaseService.supabase
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
  try {
    const { error } = await supabaseService.supabase
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
  try {
    const { error } = await supabaseService.supabase
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
  try {
    const { error } = await supabaseService.supabase
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
