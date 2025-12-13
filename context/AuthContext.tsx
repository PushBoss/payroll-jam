
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Role, ResellerClient } from '../types';
import { storage } from '../services/storage';
import { supabaseService } from '../services/supabaseService';
import { supabase } from '../services/supabaseClient';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (user: User & { password: string; companyName?: string; plan?: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  impersonate: (client: ResellerClient) => void;
  stopImpersonation: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    // Check for existing Supabase session
    const initAuth = async () => {
      try {
        if (!supabase) {
          // Fallback to localStorage if Supabase not available
          const storedUser = storage.getUser();
          if (storedUser && isMounted) {
            setUser(storedUser);
          }
          if (isMounted) setIsLoading(false);
          return;
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          // Try localStorage fallback
          const storedUser = storage.getUser();
          if (storedUser && isMounted) {
            setUser(storedUser);
          }
          if (isMounted) setIsLoading(false);
          return;
        }
        
        if (session?.user) {
          // Load user profile from app_users table
          const appUser = await supabaseService.getUserByEmail(session.user.email!);
          if (appUser && isMounted) {
            setUser(appUser);
            storage.saveUser(appUser);
          } else if (!appUser && isMounted) {
            // User authenticated but no profile - sign out
            console.warn('User authenticated but no profile found');
            try {
              await supabase.auth.signOut();
            } catch (error) {
              console.warn('Sign out failed during profile check:', error);
            }
            // Force clear Supabase session from localStorage
            if (typeof window !== 'undefined') {
              localStorage.removeItem('sb-arqbxlaudfbmiqvwwmnt-auth-token');
            }
            setUser(null);
            storage.saveUser(null);
          }
        } else {
          // Fallback to localStorage
          const storedUser = storage.getUser();
          if (storedUser && isMounted) {
            setUser(storedUser);
          }
        }
        
        if (isMounted) setIsLoading(false);
      } catch (error) {
        console.error('Auth initialization error:', error);
        // Fallback to localStorage on any error
        const storedUser = storage.getUser();
        if (storedUser && isMounted) {
          setUser(storedUser);
        }
        if (isMounted) setIsLoading(false);
      }
    };

    initAuth();
    
    return () => {
      isMounted = false;
    };

    // Listen for auth changes
    let authSubscription: any = null;
    if (supabase) {
      const { data: { subscription } } = supabase!.auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return;
        
        console.log('🔄 Auth event:', event);
        
        // Handle email confirmation
        if (event === 'SIGNED_IN' && session?.user) {
          const appUser = await supabaseService.getUserByEmail(session.user.email!);
          if (appUser && isMounted) {
            setUser(appUser);
            storage.saveUser(appUser);
            
            // Redirect to login page after email confirmation
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const type = hashParams.get('type');
            if (type === 'signup') {
              console.log('✅ Email confirmed, redirecting to login...');
              toast.success('Email confirmed! Please login to continue.');
              setTimeout(() => {
                if (isMounted) window.location.href = '/?page=login';
              }, 2000);
            }
          }
        } else if (event === 'SIGNED_OUT') {
          if (isMounted) {
            setUser(null);
            storage.saveUser(null);
          }
        }
      });

      authSubscription = subscription;
    }
    
    return () => {
      isMounted = false;
      if (authSubscription) authSubscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error);
        throw error;
      }

      if (!data.user) {
        throw new Error('No user data returned from login');
      }

      console.log('✅ Auth login successful, fetching user profile...');
      
      const appUser = await supabaseService.getUserByEmail(data.user.email!);
      
      if (!appUser) {
        throw new Error('User profile not found in database');
      }
      
      console.log('✅ User profile loaded:', appUser.email);
      setUser(appUser);
      storage.saveUser(appUser);
    } catch (error) {
      console.error('❌ Login failed:', error);
      throw error;
    }
  };

  const signup = async (userData: User & { password: string; companyName?: string; plan?: string; resellerInviteToken?: string }) => {
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }

    try {
      // 1. Create auth user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
      });

      if (authError) {
        console.error('❌ Auth signup error:', authError);
        throw authError;
      }

      if (!authData.user) {
        throw new Error('No user returned from signup');
      }

      console.log('✅ Supabase Auth user created:', authData.user.id);

      // 2. Create company record first (if needed)
      if (userData.companyName && userData.companyId) {
        const isPaidPlan = userData.plan && userData.plan !== 'Free';
        
        // Map plan names to match database constraint: ('Free', 'Starter', 'Professional', 'Enterprise')
        const mapPlanToDbFormat = (plan: string | undefined): string => {
          if (!plan) return 'Free';
          const planMap: Record<string, string> = {
            'Free': 'Free',
            'Starter': 'Starter',
            'Pro': 'Professional',
            'Professional': 'Professional',
            'Reseller': 'Enterprise', // Map Reseller to Enterprise for now
            'Enterprise': 'Enterprise'
          };
          return planMap[plan] || 'Free';
        };
        
        const dbPlan = mapPlanToDbFormat(userData.plan);
        
        const companyData = {
          name: userData.companyName,
          trn: '',
          address: '',
          phone: '',
          bankName: '',
          accountNumber: '',
          branchCode: '',
          payFrequency: 'Monthly',
          subscriptionStatus: (isPaidPlan && (userData as any).paymentMethod === 'direct-deposit' ? 'PENDING_PAYMENT' : 'ACTIVE') as 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'PENDING_PAYMENT',
          plan: dbPlan as any,
          paymentMethod: (userData as any).paymentMethod || 'card'
        };
        
        const savedCompany = await supabaseService.saveCompany(userData.companyId, companyData);
        if (!savedCompany) {
          throw new Error('Failed to create company record');
        }
        console.log('✅ Company saved to Supabase:', userData.companyName);
        
        // Wait a moment to ensure company is committed before creating user
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // If there's a reseller invite token, accept it
        if (userData.resellerInviteToken) {
          const accepted = await supabaseService.acceptResellerInvite(userData.resellerInviteToken, userData.companyId);
          if (accepted) {
            console.log('✅ Reseller invitation accepted during signup');
          } else {
            console.warn('⚠️ Failed to accept reseller invitation, but continuing with signup');
          }
        }
      }

      // 3. Create app_users profile (linked to auth user)
      const appUser: User = {
        id: authData.user.id, // Use Supabase Auth user ID
        email: userData.email,
        name: userData.name,
        role: userData.role,
        companyId: userData.companyId,
        isOnboarded: userData.isOnboarded || false
      };

      console.log('📝 Creating user profile:', { 
        id: appUser.id, 
        email: appUser.email, 
        companyId: appUser.companyId,
        role: appUser.role 
      });

      try {
        await supabaseService.saveUser(appUser);
        console.log('✅ User profile saved to app_users table:', appUser.email);
      } catch (profileError) {
        console.error('❌ CRITICAL: Failed to create user profile:', profileError);
        // Try to clean up auth user if profile creation fails
        try {
          await supabase.auth.admin?.deleteUser(authData.user.id);
          console.log('🧹 Cleaned up orphaned auth user');
        } catch (cleanupError) {
          console.error('⚠️ Failed to cleanup auth user:', cleanupError);
        }
        throw new Error(`Profile creation failed: ${(profileError as any).message || 'Unknown error'}`);
      }

      // 4. Update local state
      setUser(appUser);
      storage.saveUser(appUser);
      
      console.log('✅ Signup completed successfully - user will receive confirmation email');

    } catch (error) {
      console.error('❌ Signup failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.warn('Sign out failed (possibly session already expired):', error);
    }
    // Force clear Supabase session from localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sb-arqbxlaudfbmiqvwwmnt-auth-token');
    }
    setUser(null);
    storage.saveUser(null);
  };

  const updateUser = (updates: Partial<User>) => {
    if (!user) return;
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    storage.saveUser(updatedUser);
    // Attempt background sync
    supabaseService.saveUser(updatedUser).catch(err => console.warn("Auth update sync failed", err));
  };

  const impersonate = (client: ResellerClient) => {
    if (!user) return;
    const originalRole = user.originalRole || user.role;
    const impersonatedUser = {
        ...user,
        originalRole: originalRole,
        companyId: client.id,
        role: Role.ADMIN
    };
    setUser(impersonatedUser);
    storage.saveUser(impersonatedUser);
  };

  const stopImpersonation = () => {
      if (!user || !user.originalRole) return;
      const restoredUser = {
          ...user,
          role: user.originalRole,
          originalRole: undefined,
          companyId: undefined // Clear context
      };
      setUser(restoredUser);
      storage.saveUser(restoredUser);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, updateUser, impersonate, stopImpersonation }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
