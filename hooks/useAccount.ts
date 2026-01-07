import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';

export interface Account {
  id: string;
  owner_id: string;
  name: string;
  email?: string;
  phone?: string;
  plan?: string;
  created_at?: string;
}

/**
 * Hook to fetch the current user's company/account
 * Queries the companies table where owner_id matches the authenticated user
 */
export function useAccount() {
  const { user } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccount = async () => {
      if (!user?.id || !supabase) {
        setLoading(false);
        return;
      }

      try {
        const { data, error: supabaseError } = await supabase
          .from('companies')
          .select('*')
          .eq('owner_id', user.id);

        if (supabaseError) {
          throw supabaseError;
        }

        // Get the first company owned by the user
        const accountData = Array.isArray(data) && data.length > 0 ? data[0] : null;
        setAccount(accountData as Account | null);
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
    if (!user?.id || !supabase) return;

    setLoading(true);
    try {
      const { data, error: supabaseError } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_id', user.id);

      if (supabaseError) {
        throw supabaseError;
      }

      // Get the first company owned by the user
      const accountData = Array.isArray(data) && data.length > 0 ? data[0] : null;
      setAccount(accountData as Account | null);
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
