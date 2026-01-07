import { useState, useEffect } from 'react';
import { supabaseService } from '../services/supabaseService';
import { useAuth } from './useAuth';

export interface Account {
  id: string;
  owner_id: string;
  company_name: string;
  email: string;
  phone?: string;
  subscription_plan?: string;
  created_at: string;
}

/**
 * Hook to fetch the current user's account
 */
export function useAccount() {
  const { user } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccount = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        const { data, error: supabaseError } = await supabaseService.supabase
          .from('accounts')
          .select('*')
          .eq('owner_id', user.id)
          .single();

        if (supabaseError && supabaseError.code !== 'PGRST116') {
          throw supabaseError;
        }

        setAccount(data as Account);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching account:', err);
        setError(err.message || 'Failed to fetch account');
      } finally {
        setLoading(false);
      }
    };

    fetchAccount();
  }, [user?.id]);

  const refetch = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const { data, error: supabaseError } = await supabaseService.supabase
        .from('accounts')
        .select('*')
        .eq('owner_id', user.id)
        .single();

      if (supabaseError && supabaseError.code !== 'PGRST116') {
        throw supabaseError;
      }

      setAccount(data as Account);
      setError(null);
    } catch (err: any) {
      console.error('Error refetching account:', err);
      setError(err.message || 'Failed to fetch account');
    } finally {
      setLoading(false);
    }
  };

  return { account, loading, error, refetch };
}
