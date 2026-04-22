import { supabase } from './supabaseClient';
import { User, DbAppUserRow, toRole } from '../core/types';
import { EmployeeService } from './EmployeeService';

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

    return data.map((row: DbAppUserRow) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: toRole(row.role),
      companyId: row.company_id ?? undefined,
      isOnboarded: row.is_onboarded,
      avatarUrl: row.avatar_url ?? undefined,
      phone: row.phone ?? undefined,
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
      const { data, error } = await supabase.functions.invoke('admin-handler', {
        body: {
          action: 'delete-account',
          payload: { userId, userRole, companyId }
        }
      });

      if (error) {
        console.error('Error deleting account via Edge Function:', error);
        return false;
      }

      return data?.success === true;
    } catch (error) {
      console.error('Error deleting account:', error);
      return false;
    }
  },
};