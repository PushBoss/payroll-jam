import { supabase } from './supabaseClient';
import { User } from '../core/types';
import { EmployeeService } from './EmployeeService';

const getServiceRoleClient = async () => {
	const serviceRoleKey = import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY;
	const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || localStorage.getItem('VITE_SUPABASE_URL');

	if (!serviceRoleKey || !supabaseUrl) return null;

	const { createClient } = await import('@supabase/supabase-js');
	return createClient(supabaseUrl, serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
};

export const UserService = {
  getUserByEmail: EmployeeService.getUserByEmail,
  saveUser: EmployeeService.saveUser,
  getCompanyUsers: EmployeeService.getCompanyUsers,

  getAllSuperAdmins: async (): Promise<User[]> => {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('role', 'SUPER_ADMIN')
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('Error fetching super admins:', error);
      return [];
    }

    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as any,
      companyId: row.company_id,
      isOnboarded: row.is_onboarded,
      avatarUrl: row.avatar_url || undefined,
      phone: row.phone || undefined,
    }));
  },

  deleteUser: async (userId: string) => {
    if (!supabase) return false;

    const { error } = await supabase.from('app_users').delete().eq('id', userId);
    if (error) {
      console.error('Error deleting user:', error);
      return false;
    }

    return true;
  },

  deleteAccount: async (userId: string, userRole: string, companyId?: string) => {
    if (!supabase) return false;

    try {
      const { data: userData, error: fetchError } = await supabase
        .from('app_users')
        .select('auth_user_id, company_id')
        .eq('id', userId)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching user for deletion:', fetchError);
        return false;
      }

      const authUserId = userData?.auth_user_id;
      const userCompanyId = companyId || userData?.company_id;

      if (userRole === 'OWNER' && userCompanyId) {
        await supabase.from('companies').delete().eq('id', userCompanyId);
      }

      const { error: userError } = await supabase.from('app_users').delete().eq('id', userId);
      if (userError) {
        console.error('Error deleting app_users record:', userError);
        return false;
      }

      if (authUserId) {
        try {
          const adminClient = await getServiceRoleClient();
          if (adminClient) {
            await adminClient.auth.admin.deleteUser(authUserId);
          }
        } catch (error) {
          console.warn('Error deleting auth user:', error);
        }
      }

      return true;
    } catch (error) {
      console.error('Error deleting account:', error);
      return false;
    }
  },
};