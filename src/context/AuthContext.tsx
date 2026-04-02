
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Role, ResellerClient, CompanySettings } from '../core/types';
import { storage } from '../services/storage';
import { EmployeeService } from '../services/EmployeeService';
import { CompanyService } from '../services/CompanyService';
import { supabase } from '../services/supabaseClient';
import { getAuthRedirectUrl } from '../utils/domainConfig';
import { getPendingInvitationsByEmail, acceptMultipleInvitations, AccountMember } from '../features/employees/inviteService';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (user: User & {
    password: string;
    companyName?: string;
    plan?: string;
    skipEmailVerification?: boolean;
    resellerInviteToken?: string;
    resellerUserId?: string;
    resellerEmail?: string;
    resellerCompanyId?: string;
  }) => Promise<{
    userId: string;
    pendingInvitations: (AccountMember & { company_name?: string; inviter_name?: string; company_plan?: string })[];
  }>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  impersonate: (client: ResellerClient) => void;
  stopImpersonation: () => Promise<void>;
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
          const appUser = await EmployeeService.getUserByEmail(session.user.email!);
          if (appUser && isMounted) {

            // Check for active impersonation in storage to restore it
            const storedUser = storage.getUser();
            if (storedUser && storedUser.email === appUser.email && storedUser.originalRole) {
              console.log('🔄 Restoring impersonation session');
              const restoredUser = {
                ...appUser, // Keep fresh profile data
                role: storedUser.role, // Use impersonated role
                companyId: storedUser.companyId, // Use impersonated company
                originalRole: storedUser.originalRole // Keep persistence flag
              };
              setUser(restoredUser);
              storage.saveUser(restoredUser);
            } else {
              setUser(appUser);
              storage.saveUser(appUser);
            }

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
          const appUser = await EmployeeService.getUserByEmail(session.user.email!);
          if (appUser && isMounted) {
            setUser(appUser);
            storage.saveUser(appUser);

            // Redirect to appropriate dashboard after email confirmation
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const type = hashParams.get('type');
            if (type === 'signup') {
              console.log('✅ Email confirmed, redirecting to dashboard...');
              toast.success('Email confirmed! Welcome to PayrollJam.');

              // Determine redirect path based on user role
              let redirectPath = 'dashboard';
              if (appUser.role === Role.EMPLOYEE) {
                redirectPath = 'portal-home';
              } else if (appUser.role === Role.RESELLER) {
                redirectPath = 'reseller-dashboard';
              } else if (appUser.role === Role.SUPER_ADMIN) {
                redirectPath = 'sa-overview';
              }

              setTimeout(() => {
                if (isMounted) window.location.href = `/?page=${redirectPath}`;
              }, 1500);
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

      // CRITICAL: Check if email is verified
      if (!data.user.email_confirmed_at) {
        console.warn('🚫 Login blocked: Email not verified');
        // Sign out the user immediately
        await supabase.auth.signOut();
        // Throw specific error for unverified email
        const unverifiedError = new Error('Email not verified');
        (unverifiedError as any).code = 'EMAIL_NOT_VERIFIED';
        (unverifiedError as any).email = email;
        throw unverifiedError;
      }

      console.log('✅ Auth login successful, fetching user profile...');

      const appUser = await EmployeeService.getUserByEmail(data.user.email!);

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

  const signup = async (userData: User & {
    password: string;
    companyName?: string;
    plan?: string;
    skipEmailVerification?: boolean;
    resellerInviteToken?: string;
    resellerUserId?: string;
    resellerEmail?: string;
    resellerCompanyId?: string;
  }) => {
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }

    try {
      // Server-side guard: prevent Free-plan signups with too many employees
      if (userData.plan === 'Free') {
        const empCount = (userData as any).numEmployees || 0;
        if (empCount > 5) {
          const err = new Error('Free plan supports up to 5 employees. Please choose a paid plan.');
          (err as any).code = 'FREE_PLAN_LIMIT';
          throw err;
        }
      }

      let authData;
      let authError;

      // 1. Create auth user in Supabase Auth
      // If skipEmailVerification is true, we use the admin client to create the user already confirmed
      if (userData.skipEmailVerification) {
        console.log('⚡ Using Edge Function to create confirmed user...');
        try {
          const { data, error } = await supabase.functions.invoke('admin-handler', {
            body: { 
              action: 'onboard-confirmed-user', 
              payload: { email: userData.email, password: userData.password, name: userData.name } 
            }
          });

          if (!error && data?.user) {
            console.log('✅ User created via Edge Function (confirmed)');
            authData = { user: data.user, session: null };

            // Now sign in the user to establish a session in the regular client
            const { error: signInError } = await supabase.auth.signInWithPassword({
              email: userData.email,
              password: userData.password
            });

            if (signInError) {
              console.error('❌ Error signing in after admin creation:', signInError);
            }
          } else {
            authError = error;
            console.warn('⚠️ Edge Function creation failed, falling back to standard signup:', error);
          }
        } catch (e) {
          authError = e;
          console.warn('⚠️ Edge Function request failed, falling back to standard signup:', e);
        }
      }

      // Standard signup fallback
      if (!authData) {
        const response = await supabase.auth.signUp({
          email: userData.email,
          password: userData.password,
          options: {
            emailRedirectTo: getAuthRedirectUrl('?page=verify-email'),
          },
        });
        authData = response.data;
        authError = response.error;
      }

      if (authError) {
        console.error('❌ Auth signup error:', authError);
        throw authError;
      }

      if (!authData.user) {
        throw new Error('No user returned from signup');
      }

      console.log('✅ Supabase Auth user created:', authData.user.id);

      // PART 1: Create app_users profile (linked to auth user)
      // We do this FIRST so the profile exists if other records need to link to it
      // Note: We temporarily omit companyId if we're about to create a new company 
      // to avoid Foreign Key violations (companies table entry doesn't exist yet).
      const shouldCreateCompany = userData.companyName && userData.companyId &&
        (userData.role === 'OWNER' || userData.role === 'RESELLER');

      const appUser: User = {
        id: authData.user.id, // Use Supabase Auth user ID
        email: userData.email,
        name: userData.name,
        role: userData.role,
        companyId: shouldCreateCompany ? undefined : userData.companyId, // Link later for new companies
        isOnboarded: userData.isOnboarded || false
      };

      console.log('📝 Creating user profile:', {
        id: appUser.id,
        email: appUser.email,
        companyId: appUser.companyId,
        role: appUser.role
      });

      try {
        await EmployeeService.saveUser(appUser);
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

      // Wait a moment to ensure profile is committed
      await new Promise(resolve => setTimeout(resolve, 100));

      // PART 2: Create company record (ONLY for Owners/Resellers starting a NEW business)
      // Managers/Employees are usually invited to existing businesses and should BYPASS this.
      if (shouldCreateCompany) {
        console.log('🏢 Creating new company for Owner/Reseller...');
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

        // Map billing cycle to database format (MONTHLY/ANNUAL uppercase)
        const billingCycle: 'MONTHLY' | 'ANNUAL' = (userData as any).billingCycle === 'annual' ? 'ANNUAL' : 'MONTHLY';
        const employeeLimit = (userData as any).employeeLimit || 'Unlimited';

        console.log('🔍 SIGNUP DEBUG:', {
          'userData.plan (from form)': userData.plan,
          'dbPlan (mapped for DB)': dbPlan,
          'isPaidPlan': isPaidPlan,
          'billingCycle': billingCycle,
          'employeeLimit': employeeLimit
        });

        // Determine company status based on payment method
        // PENDING_PAYMENT for direct deposit/reseller billing, ACTIVE for card payment or free plan
        let companyStatus: 'ACTIVE' | 'PENDING_PAYMENT' =
          (isPaidPlan && (userData as any).paymentMethod === 'direct-deposit') ||
            (isPaidPlan && (userData as any).paymentMethod === 'reseller-billing')
            ? 'PENDING_PAYMENT'
            : 'ACTIVE';

        // 🔍 NEW: Reseller Billing bypass
        const isResellerBilling = (userData as any).paymentMethod === 'reseller-billing';
        if (isResellerBilling) {
          companyStatus = 'ACTIVE'; // Bypass immediate payment requirement
          console.log('✅ Reseller Billing detected: Bypassing immediate payment for company');
        }

        const companyData: CompanySettings & { status?: string } = {
          name: userData.companyName!,
          email: userData.email, // Added email
          trn: '',
          address: '',
          phone: '',
          bankName: '',
          accountNumber: '',
          branchCode: '',
          payFrequency: 'Monthly',
          subscriptionStatus: (isPaidPlan && (userData as any).paymentMethod === 'direct-deposit' ? 'PENDING_PAYMENT' : 'ACTIVE') as any,
          plan: dbPlan as any,
          billingCycle: billingCycle, // Save billing cycle
          employeeLimit: employeeLimit, // Save employee limit
          paymentMethod: (userData as any).paymentMethod || 'card',
          status: companyStatus // Add status field for approval workflow
        };

        const savedCompany = await CompanyService.saveCompany(userData.companyId!, companyData);
        if (!savedCompany) {
          throw new Error('Failed to create company record');
        }
        console.log('✅ Company saved to Supabase:', userData.companyName);

        // Update the user profile with the new company link (now that the company exists)
        await EmployeeService.saveUser({ ...appUser, companyId: userData.companyId });
        console.log('✅ User profile linked to new company');

        // If there's a reseller invite token, accept it
        if (userData.resellerInviteToken) {
          const accepted = await CompanyService.acceptResellerInvite(
            userData.resellerInviteToken,
            userData.companyId!
          );
          if (accepted) {
            console.log('✅ Reseller invitation accepted during signup');
          } else {
            console.warn('⚠️ Failed to accept reseller invitation, but continuing with signup');
          }
        }
      } else {
        console.log('⏩ Bypassing company creation (User is invited or missing company details)');
      }

      // PART 3: Check for pending team member invitations and accept them automatically
      console.log('🔍 Checking for pending invitations for:', userData.email);
      const pendingInvitations = await getPendingInvitationsByEmail(userData.email);
      console.log('📬 Found pending invitations:', pendingInvitations.length);

      // Automatically accept all pending team member invitations
      if (pendingInvitations.length > 0) {
        const invitationIds = pendingInvitations.map(inv => inv.id);
        const acceptResult = await acceptMultipleInvitations(invitationIds, authData.user.id, true, userData.email);
        console.log(`✅ Accepted ${acceptResult.acceptedCount} team member invitation(s)`);
      }

      // 5. Update local state
      // Always use the latest companyId if it was created during signup
      if (shouldCreateCompany && userData.companyId) {
        appUser.companyId = userData.companyId;
      }

      // If we accepted invitations, fetch the user again to get the updated company_id
      let finalUser = appUser;
      if (pendingInvitations.length > 0) {
        // Use edge function to bypass RLS/caching issues for the newly updated user
        try {
          const { data: resData, error: invokeError } = await supabase.functions.invoke('admin-handler', {
            body: { action: 'get-user-admin', payload: { email: userData.email } }
          });
          const updatedUser = resData?.user;

          if (!invokeError && updatedUser) {
            console.log('✅ Fetched updated user via Edge Function with company_id:', updatedUser.company_id);
            finalUser = {
              id: updatedUser.id,
              name: updatedUser.name,
              email: updatedUser.email,
              role: updatedUser.role as any,
              companyId: updatedUser.company_id,
              isOnboarded: updatedUser.is_onboarded,
              avatarUrl: updatedUser.avatar_url,
              phone: updatedUser.phone
            };
          } else {
            const fallbackUser = await EmployeeService.getUserByEmail(userData.email);
            if (fallbackUser) finalUser = fallbackUser;
          }
        } catch (e) {
          const fallbackUser = await EmployeeService.getUserByEmail(userData.email);
          if (fallbackUser) finalUser = fallbackUser;
        }
      }

      setUser(finalUser);
      storage.saveUser(finalUser);

      console.log('✅ Signup completed successfully');

      // Return pending invitations (now accepted) with the correct userId
      return {
        userId: authData.user.id,
        pendingInvitations
      };

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
    EmployeeService.saveUser(updatedUser).catch(err => console.warn("Auth update sync failed", err));
  };

  const impersonate = (client: any) => {
    if (!user) return;
    console.log('🎭 Impersonating client:', client.companyName);

    // Safety check: ensure we are capturing the TRUE original role
    const originalRole = user.originalRole || user.role;

    const impersonatedUser = {
      ...user,
      originalRole: originalRole,
      companyId: client.id,
      role: Role.ADMIN
    };

    setUser(impersonatedUser);
    storage.saveUser(impersonatedUser);

    // Force a small delay to ensure state propagates before nav (though sync state updates should be fine)
  };

  const stopImpersonation = async () => {
    if (!user || !user.originalRole) return;

    try {
      // Fetch fresh user profile to restore original companyId
      const freshUser = await EmployeeService.getUserByEmail(user.email);

      if (freshUser) {
        setUser(freshUser);
        storage.saveUser(freshUser);
        console.log('✅ Personation stopped. User context restored.');
      } else {
        // Fallback if fetch fails (should allow minimal restore)
        const restoredUser = {
          ...user,
          role: user.originalRole,
          originalRole: undefined,
          companyId: undefined // Warning: this might leave resellers without companyId temporarily
        };
        setUser(restoredUser);
        storage.saveUser(restoredUser);
      }
    } catch (e) {
      console.error('Error restoring user context:', e);
      // Fallback
      const restoredUser = {
        ...user,
        role: user.originalRole,
        originalRole: undefined,
        companyId: undefined
      };
      setUser(restoredUser);
      storage.saveUser(restoredUser);
    }
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
