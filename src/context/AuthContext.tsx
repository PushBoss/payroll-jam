
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, Role, ResellerClient } from '../core/types';
import { storage } from '../services/storage';
import { EmployeeService } from '../services/EmployeeService';
import { supabase } from '../services/supabaseClient';
import { getAuthRedirectUrl } from '../utils/domainConfig';
import type { AccountMember } from '../features/employees/inviteService';
import { normalizePlanToDatabase } from '../utils/planNames';
import { toast } from 'sonner';
import { AppRoute, getPathForRoute } from '../app/routes';
import { generateUUID } from '../utils/uuid';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isRevalidating: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (user: User & {
    password: string;
    companyName?: string;
    plan?: string;
    address?: string;
    city?: string;
    parish?: string;
    billingCycle?: 'monthly' | 'annual';
    employeeLimit?: string;
    paymentMethod?: 'card' | 'direct-deposit' | 'reseller-billing';
    numEmployees?: number;
    numCompanies?: number;
    legalConsentAccepted?: boolean;
    legalConsentAcceptedAt?: string;
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
const SIGN_OUT_TIMEOUT_MS = 3000;
const AUTH_USER_LOOKUP_TIMEOUT_MS = 8000;

const isAlreadyRegisteredError = (error: unknown) => {
  const err = error as { message?: string; code?: string };
  const message = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  return code === 'user_already_exists'
    || code === 'email_exists'
    || message.includes('already registered')
    || message.includes('already exists');
};

const withAuthTimeout = <T,>(promise: Promise<T>): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      window.setTimeout(() => reject(new Error('User lookup timed out')), AUTH_USER_LOOKUP_TIMEOUT_MS)
    ),
  ]);

const isUserLookupTimeoutError = (error: unknown) =>
  error instanceof Error && error.message === 'User lookup timed out';

const getCachedUserForEmail = (email: string) => {
  const storedUser = storage.getUser();
  return storedUser?.email?.toLowerCase() === email.toLowerCase() ? storedUser : null;
};

const clearLocalAuthState = () => {
  storage.saveUser(null);
  if (typeof window === 'undefined') return;

  Object.keys(localStorage)
    .filter((key) => key.startsWith('sb-') && key.endsWith('-auth-token'))
    .forEach((key) => localStorage.removeItem(key));
};

const signOutWithTimeout = async () => {
  if (!supabase) return;
  await Promise.race([
    supabase.auth.signOut(),
    new Promise<void>((_, reject) => {
      window.setTimeout(() => reject(new Error('Supabase sign out timed out')), SIGN_OUT_TIMEOUT_MS);
    }),
  ]);
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => storage.getUser());
  const [isLoading, setIsLoading] = useState(() => !Boolean(storage.getUser()));
  const [isRevalidating, setIsRevalidating] = useState(() => Boolean(storage.getUser()));

  const ensureSelfProfile = async (sessionEmail: string) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.functions.invoke('admin-handler', {
        body: { action: 'ensure-self-profile', payload: {} }
      });

      if (error) {
        console.warn('ensure-self-profile invoke error:', error);
        return null;
      }

      if (data?.user?.email) {
        return await EmployeeService.getUserByEmail(data.user.email);
      }

      // Fallback: try by the session email
      return await EmployeeService.getUserByEmail(sessionEmail);
    } catch (e) {
      console.warn('ensure-self-profile failed:', e);
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Check for existing Supabase session
    const initAuth = async () => {
      const done = () => {
        if (isMounted) {
          setIsLoading(false);
          setIsRevalidating(false);
        }
      };

      try {
        if (!supabase) {
          // Fallback to localStorage if Supabase not available
          const storedUser = storage.getUser();
          if (storedUser && isMounted) {
            setUser(storedUser);
          }
          done();
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
          done();
          return;
        }

        if (session?.user) {
          // Block unconfirmed signup emails from logging in
          if (!session.user.email_confirmed_at) {
            console.warn('Session user email not confirmed. Signing out.');
            setUser(null);
            storage.saveUser(null);
            try {
              await supabase.auth.signOut();
            } catch (signOutError) {
              console.warn('Sign out failed:', signOutError);
            }
            done();
            return;
          }

          const sessionEmail = session.user.email!;

          // Load user profile from app_users table
          let appUser: User | null = null;
          try {
            appUser = await withAuthTimeout(EmployeeService.getUserByEmail(sessionEmail));
          } catch (error) {
            if (isUserLookupTimeoutError(error)) {
              console.warn('Profile lookup timed out during auth initialization; using cached session if available.');
              const cachedUser = getCachedUserForEmail(sessionEmail);
              if (cachedUser && isMounted) {
                setUser(cachedUser);
                storage.saveUser(cachedUser);
              }
              done();
              return;
            }

            throw error;
          }

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
            // User authenticated but no profile - attempt self-heal via Edge Function
            console.warn('User authenticated but no profile found; attempting recovery');
            const recovered = await ensureSelfProfile(sessionEmail);
            if (recovered && isMounted) {
              setUser(recovered);
              storage.saveUser(recovered);
            } else if (isMounted) {
              // Recovery failed - sign out
              try {
                await supabase.auth.signOut();
              } catch (error) {
                console.warn('Sign out failed during profile recovery:', error);
              }
              setUser(null);
              storage.saveUser(null);
            }
          }
        } else {
          // No active session — clear stale cached user if present
          if (isMounted) {
            setUser(null);
            storage.saveUser(null);
          }
        }

        done();
      } catch (error) {
        console.error('Auth initialization error:', error);
        // Fallback to localStorage on any error
        const storedUser = storage.getUser();
        if (storedUser && isMounted) {
          setUser(storedUser);
        }
        done();
      }
    };

    initAuth();

    // Listen for auth changes
    let authSubscription: any = null;
    if (supabase) {
      const { data: { subscription } } = supabase!.auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return;

        console.log('🔄 Auth event:', event);

        // Handle email confirmation
        if (event === 'SIGNED_IN' && session?.user) {
          const sessionEmail = session.user.email!;
          if (!session.user.email_confirmed_at) {
            console.warn('🔄 SIGNED_IN event for unconfirmed user. Signing out.');
            setUser(null);
            storage.saveUser(null);
            try {
              await supabase!.auth.signOut();
            } catch (signOutError) {
              console.warn('Sign out failed:', signOutError);
            }
            return;
          }

          let appUser: User | null = null;
          try {
            appUser = await withAuthTimeout(EmployeeService.getUserByEmail(sessionEmail));
          } catch (error) {
            if (isUserLookupTimeoutError(error)) {
              console.warn('Profile lookup timed out during auth event; keeping cached session while startup continues.');
              const cachedUser = getCachedUserForEmail(sessionEmail);
              if (cachedUser && isMounted) {
                setUser(cachedUser);
                storage.saveUser(cachedUser);
              }
              return;
            }

            console.warn('Profile lookup failed during auth event:', error);
            return;
          }

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
              let redirectPath: AppRoute = 'dashboard';
              if (appUser.role === Role.EMPLOYEE) {
                redirectPath = 'portal-home';
              } else if (appUser.role === Role.RESELLER) {
                redirectPath = 'reseller-dashboard';
              } else if (appUser.role === Role.SUPER_ADMIN) {
                redirectPath = 'sa-overview';
              }

              setTimeout(() => {
                if (isMounted) window.location.href = getPathForRoute(redirectPath);
              }, 1500);
            }
          } else if (!appUser && isMounted) {
            try {
              const recovered = await ensureSelfProfile(sessionEmail);
              if (recovered && isMounted) {
                setUser(recovered);
                storage.saveUser(recovered);
              }
            } catch (error) {
              console.warn('Profile recovery failed during auth event:', error);
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
        const recovered = await ensureSelfProfile(data.user.email!);
        if (!recovered) {
          throw new Error('User profile not found in database');
        }
        console.log('✅ User profile recovered:', recovered.email);
        setUser(recovered);
        storage.saveUser(recovered);
        return;
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
    address?: string;
    city?: string;
    parish?: string;
    billingCycle?: 'monthly' | 'annual';
    employeeLimit?: string;
    paymentMethod?: 'card' | 'direct-deposit' | 'reseller-billing';
    numEmployees?: number;
    numCompanies?: number;
    legalConsentAccepted?: boolean;
    legalConsentAcceptedAt?: string;
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
        const empCount = Number((userData as any).numEmployees || 0);
        if (empCount > 5) {
          const err = new Error('Free plan supports up to 5 employees. Please choose a paid plan.');
          (err as any).code = 'FREE_PLAN_LIMIT';
          throw err;
        }
      }

      const isCompanySignup = Boolean(userData.companyName?.trim() && userData.companyId);
      const companyCreatorRole =
        userData.role === Role.RESELLER || userData.plan === 'Reseller' || userData.plan === 'Enterprise'
          ? Role.RESELLER
          : Role.OWNER;
      const effectiveSignupRole = isCompanySignup ? companyCreatorRole : userData.role;
      const shouldCreateCompany = isCompanySignup && (effectiveSignupRole === Role.OWNER || effectiveSignupRole === Role.RESELLER);
      const shouldAutoAcceptInvitations = !shouldCreateCompany && Boolean(userData.skipEmailVerification || userData.resellerInviteToken);
      const signupFinalizeToken = generateUUID();

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
              payload: { email: userData.email, password: userData.password, name: userData.name, role: effectiveSignupRole, signupFinalizeToken }
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
            emailRedirectTo: getAuthRedirectUrl('/verify-email'),
            data: {
              full_name: userData.name,
              name: userData.name,
              phone: userData.phone || undefined,
              role: effectiveSignupRole,
              signup_flow: shouldCreateCompany ? 'company_signup' : 'invitation_signup',
              company_id: shouldCreateCompany ? userData.companyId : undefined,
              signup_finalize_token: signupFinalizeToken,
            },
          },
        });
        authData = response.data;
        authError = response.error;
      }

      if (authError) {
        if (shouldCreateCompany && isAlreadyRegisteredError(authError)) {
          console.warn('⚠️ Auth user already exists; attempting company signup recovery with password sign-in.');
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: userData.email,
            password: userData.password,
          });

          if (!signInError && signInData.user) {
            authData = signInData;
            authError = null;
          } else {
            console.error('❌ Existing account recovery sign-in failed:', signInError);
          }
        }
      }

      if (authError) {
        console.error('❌ Auth signup error:', authError);
        throw authError;
      }

      if (!authData.user) {
        throw new Error('No user returned from signup');
      }

      console.log('✅ Supabase Auth user created:', authData.user.id);

      const parseEmployeeLimit = (limit?: string): number => {
        if (!limit || limit === 'Unlimited') return 999999;
        const match = limit.match(/\d+/);
        return match ? Number(match[0]) : 999999;
      };

      const isPaidPlan = userData.plan && userData.plan !== 'Free';
      const billingCycle: 'MONTHLY' | 'ANNUAL' = (userData as any).billingCycle === 'annual' ? 'ANNUAL' : 'MONTHLY';
      const employeeLimit = (userData as any).employeeLimit || 'Unlimited';
      let companyStatus: 'ACTIVE' | 'PENDING_PAYMENT' =
        (isPaidPlan && (userData as any).paymentMethod === 'direct-deposit') ||
          (isPaidPlan && (userData as any).paymentMethod === 'reseller-billing')
          ? 'PENDING_PAYMENT'
          : 'ACTIVE';

      if ((userData as any).paymentMethod === 'reseller-billing') {
        companyStatus = 'ACTIVE';
      }

      const { data: finalizeData, error: finalizeError } = await supabase.functions.invoke('admin-handler', {
        body: {
          action: 'finalize-signup',
          payload: {
            userId: authData.user.id,
            email: userData.email,
            name: userData.name,
            phone: userData.phone || null,
            signupFinalizeToken,
            intent: shouldCreateCompany ? 'company_signup' : 'invitation_signup',
            verifyEmail: userData.skipEmailVerification,
            acceptPendingInvitations: shouldAutoAcceptInvitations,
            resellerInviteToken: userData.resellerInviteToken || undefined,
            company: shouldCreateCompany ? {
              companyId: userData.companyId,
              name: userData.companyName,
              trn: '',
              address: userData.address || '',
              plan: normalizePlanToDatabase(userData.plan),
              billingCycle,
              employeeLimit: parseEmployeeLimit(employeeLimit),
              status: companyStatus,
              settings: {
                email: userData.email,
                phone: userData.phone || '',
                contactName: userData.name,
                companyName: userData.companyName,
                city: userData.city,
                parish: userData.parish,
                acquisitionSource: (userData as any).acquisitionSource,
                paymentMethod: (userData as any).paymentMethod,
                signupDetails: {
                  numEmployees: userData.numEmployees,
                  numCompanies: userData.numCompanies,
                  acquisitionSource: (userData as any).acquisitionSource,
                  legalConsentAccepted: userData.legalConsentAccepted,
                  legalConsentAcceptedAt: userData.legalConsentAcceptedAt,
                },
              },
            } : undefined,
          },
        },
      });

      if (finalizeError) throw finalizeError;
      if (!finalizeData?.success || !finalizeData?.user) {
        throw new Error('Signup finalization failed');
      }

      const finalUser: User = {
        id: finalizeData.user.id,
        name: finalizeData.user.name,
        email: finalizeData.user.email,
        role: finalizeData.user.role as Role,
        companyId: finalizeData.user.companyId || undefined,
        isOnboarded: finalizeData.user.isOnboarded,
        avatarUrl: finalizeData.user.avatarUrl || undefined,
        phone: finalizeData.user.phone || undefined
      };

      const pendingInvitations: (AccountMember & { company_name?: string; inviter_name?: string; company_plan?: string })[] = [];

      // Only log the user in locally if Supabase returned an active session 
      // (which happens if Confirm Email is off, or if created via admin handler).
      if (authData.session || userData.skipEmailVerification) {
        setUser(finalUser);
        storage.saveUser(finalUser);
      }

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
    setUser(null);
    clearLocalAuthState();

    try {
      await signOutWithTimeout();
    } catch (error) {
      console.warn('Sign out failed (possibly session already expired):', error);
    }
  };

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;
      const updatedUser = { ...prev, ...updates };
      storage.saveUser(updatedUser);
      EmployeeService.saveUser(updatedUser).catch(err => console.warn("Auth update sync failed", err));
      return updatedUser;
    });
  }, []);

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
    <AuthContext.Provider value={{ user, isLoading, isRevalidating, login, signup, logout, updateUser, impersonate, stopImpersonation }}>
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
