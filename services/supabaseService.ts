import { supabase } from './supabaseClient';
import { generateUUID } from '../utils/uuid';
import {
  Employee,
  PayRun,
  CompanySettings,
  LeaveRequest,
  AuditLogEntry,
  ResellerClient,
  WeeklyTimesheet,
  User,
  DocumentRequest,
  ExpertReferral,
  DocumentTemplate,
  GlobalConfig
} from '../types';

// Cache for the admin client to avoid multiple instances and GoTrueClient warnings
// We use a global variable on window to be absolutely sure it's a singleton across module evaluations
let cachedAdminClient: any = (typeof window !== 'undefined' ? (window as any).__SUPABASE_ADMIN_CLIENT__ : null);
let adminClientPromise: Promise<any> | null = (typeof window !== 'undefined' ? (window as any).__SUPABASE_ADMIN_PROMIZE__ : null);

export const supabaseService = {

  // Helper to create an admin client (service role) for operations that bypass RLS
  // Only available if VITE_SUPABASE_SERVICE_ROLE_KEY is in environment
  getAdminClient: async () => {
    // 1. Check module-level cache
    if (cachedAdminClient) return cachedAdminClient;

    // 2. Check window-level cache (if module was re-evaluated)
    if (typeof window !== 'undefined' && (window as any).__SUPABASE_ADMIN_CLIENT__) {
      cachedAdminClient = (window as any).__SUPABASE_ADMIN_CLIENT__;
      return cachedAdminClient;
    }

    if (adminClientPromise) return adminClientPromise;
    if (typeof window !== 'undefined' && (window as any).__SUPABASE_ADMIN_PROMIZE__) {
      adminClientPromise = (window as any).__SUPABASE_ADMIN_PROMIZE__;
      return adminClientPromise;
    }

    // 3. Initialize if not already in progress
    console.debug('🚀 Starting Admin Client initialization');

    adminClientPromise = (async () => {
      const serviceRoleKey = import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env?.SUPABASE_SERVICE_ROLE_KEY || localStorage.getItem('VITE_SUPABASE_SERVICE_ROLE_KEY');
      const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || localStorage.getItem('VITE_SUPABASE_URL');

      if (serviceRoleKey && supabaseUrl) {
        try {
          console.debug('🔑 Admin client request - URL:', supabaseUrl, 'Key present:', !!serviceRoleKey);
          const { createClient } = await import('@supabase/supabase-js');

          const client = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
              autoRefreshToken: false,
              persistSession: false
            }
          });

          cachedAdminClient = client;
          if (typeof window !== 'undefined') {
            (window as any).__SUPABASE_ADMIN_CLIENT__ = client;
          }
          return client;
        } catch (e) {
          console.error('Failed to create admin client:', e);
          adminClientPromise = null;
          if (typeof window !== 'undefined') (window as any).__SUPABASE_ADMIN_PROMIZE__ = null;
          return null;
        }
      } else {
        if (!serviceRoleKey) console.warn('⚠️ Admin client requested but VITE_SUPABASE_SERVICE_ROLE_KEY is missing from environment.');
        if (!supabaseUrl) console.warn('⚠️ Admin client requested but VITE_SUPABASE_URL is missing.');
        adminClientPromise = null;
        if (typeof window !== 'undefined') (window as any).__SUPABASE_ADMIN_PROMIZE__ = null;
        return null;
      }
    })();

    if (typeof window !== 'undefined') {
      (window as any).__SUPABASE_ADMIN_PROMIZE__ = adminClientPromise;
    }

    return adminClientPromise;
  },

  // --- Users (Auth) ---

  getUserByEmail: async (email: string): Promise<User | null> => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (error) {
        console.error("Error fetching user:", error);
        return null;
      }
      if (!data) return null;

      return {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role as any,
        companyId: data.company_id,
        isOnboarded: data.is_onboarded,
        avatarUrl: data.avatar_url || undefined,
        phone: data.phone || undefined,
        onboardingToken: data.preferences?.onboardingToken || undefined
      };
    } catch (e) {
      console.error("Supabase connection error:", e);
      return null;
    }
  },

  // Admin version - bypasses RLS for resellers checking if client companies exist
  getUserByEmailAdmin: async (email: string): Promise<User | null> => {
    try {
      const adminClient = await supabaseService.getAdminClient();
      if (!adminClient) {
        console.warn('⚠️ Admin client not available, falling back to normal client');
        return supabaseService.getUserByEmail(email);
      }

      const { data, error } = await adminClient
        .from('app_users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (error) {
        console.error("Error fetching user (admin):", error);
        return null;
      }
      if (!data) return null;

      return {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role as any,
        companyId: data.company_id,
        isOnboarded: data.is_onboarded,
        avatarUrl: data.avatar_url || undefined,
        phone: data.phone || undefined,
        onboardingToken: data.preferences?.onboardingToken || undefined
      };
    } catch (e) {
      console.error("Admin user lookup error:", e);
      return null;
    }
  },

  // Get company by email (finds company through user email)
  getCompanyByEmail: async (email: string): Promise<CompanySettings | null> => {
    if (!supabase) return null;

    const adminClient = await supabaseService.getAdminClient();
    const effectiveClient = adminClient || supabase;

    try {
      // First find user by email
      const { data: user, error: userError } = await effectiveClient
        .from('app_users')
        .select('company_id')
        .eq('email', email)
        .maybeSingle();

      if (userError || !user || !user.company_id) {
        return null;
      }

      // Then get company
      const { data: company, error: companyError } = await effectiveClient
        .from('companies')
        .select('*')
        .eq('id', user.company_id)
        .maybeSingle();

      if (companyError || !company) {
        return null;
      }

      return {
        id: company.id, // Include company ID
        name: company.name,
        trn: company.trn || '',
        address: company.address || '',
        phone: company.phone || '',
        bankName: company.settings?.bankName || '',
        accountNumber: company.settings?.accountNumber || '',
        branchCode: company.settings?.branchCode || '',
        plan: company.plan as any,
        subscriptionStatus: company.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED' as any
      };
    } catch (e) {
      console.error("Error fetching company by email:", e);
      return null;
    }
  },

  saveUser: async (user: User) => {
    if (!supabase) {
      console.error("❌ Supabase client not available");
      throw new Error("Supabase client not initialized");
    }

    console.log("💾 Saving user to Supabase:", { id: user.id, email: user.email, companyId: user.companyId });

    // Use admin client for high-privilege write during signup/sync
    const adminClient = await supabaseService.getAdminClient();
    const effectiveClient = adminClient || supabase;

    // Prepare preferences JSONB with onboardingToken if present
    const preferences: any = {};
    if (user.onboardingToken) {
      preferences.onboardingToken = user.onboardingToken;
    }

    // Check if user exists by ID or email
    const { data: existing } = await effectiveClient
      .from('app_users')
      .select('id, preferences, company_id, role')
      .or(`id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();

    if (existing) {
      // Merge existing preferences with new ones
      const existingPrefs = (existing as any).preferences || {};
      const mergedPrefs = { ...existingPrefs, ...preferences };

      // Update existing user (use the existing ID if different from the provided one)
      const updateId = existing.id;

      // CRITICAL: Protect company_id and role if we are currently impersonating
      // This prevents "Save Profile" from corrupting the reseller's own data.
      const isImpersonating = (user as any).originalRole || (user as any).isResellerView;
      const finalCompanyId = isImpersonating ? (existing as any).company_id : (user.companyId || (existing as any).company_id);
      const finalRole = isImpersonating ? (existing as any).role : (user.role || (existing as any).role);

      const { data, error } = await effectiveClient
        .from('app_users')
        .update({
          id: user.id, // Update to new auth ID if changed
          name: user.name,
          role: finalRole as any,
          company_id: finalCompanyId,
          is_onboarded: user.isOnboarded,
          avatar_url: user.avatarUrl || null,
          phone: user.phone || null,
          preferences: mergedPrefs
        })
        .eq('id', updateId)
        .select();

      if (error) {
        console.error("❌ Error updating user:", error);
        throw error;
      }
      console.log("✅ User updated successfully:", data);
    } else {
      // Insert new user
      console.log("📝 Inserting new user into app_users table...");
      const { data, error } = await effectiveClient
        .from('app_users')
        .upsert({
          id: user.id,
          auth_user_id: user.id, // Ensure auth_user_id is also set for RLS compatibility
          email: user.email,
          name: user.name,
          role: user.role,
          company_id: user.companyId,
          is_onboarded: user.isOnboarded,
          avatar_url: user.avatarUrl || null,
          phone: user.phone || null,
          preferences: preferences
        }, {
          onConflict: 'id',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        console.error("❌ Error inserting user into app_users:", error);
        throw error;
      }
      console.log("✅ User created successfully in app_users table:", data);
    }
  },

  // --- Companies (Tenants) ---

  getCompany: async (companyId: string): Promise<CompanySettings | null> => {
    if (!supabase) return null;
    let { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .maybeSingle();

    // Fallback: If no data returned (RLS block or missing) or specific access errors
    if (!data || (error && (error.code === '406' || error.code === '42501' || error.code === 'PGRST116'))) {
      const adminClient = await supabaseService.getAdminClient();
      if (adminClient) {
        console.log(`🛡️ Using Admin client fallback for getCompany (${companyId})...Reason:`, error || 'No data returned (likely RLS)');
        const { data: adminData, error: adminError } = await adminClient
          .from('companies')
          .select('*')
          .eq('id', companyId)
          .maybeSingle();

        if (adminError) {
          console.error('❌ Admin fallback fetch failed:', adminError);
        }

        if (adminData) {
          console.log('✅ Admin fallback fetch successful');
          data = adminData;
        }
      }
    }

    if (!data) {
      console.error(`❌ Failed to load company ${companyId} even with admin fallback. Error:`, error);
      return null;
    }

    // Map database fields + JSON settings to App types
    const settings = data.settings || {};

    // Map database plan format back to app format
    const mapPlanFromDbFormat = (dbPlan: string | undefined): string => {
      if (!dbPlan) return 'Free';
      const planMap: Record<string, string> = {
        'Free': 'Free',
        'Starter': 'Starter',
        'Professional': 'Pro',
        'Enterprise': 'Enterprise'
      };
      return planMap[dbPlan] || 'Free';
    };

    return {
      id: data.id,
      name: data.name,
      trn: data.trn,
      address: data.address,
      phone: settings.phone || '',
      bankName: settings.bankName || 'NCB',
      accountNumber: settings.accountNumber || '',
      branchCode: settings.branchCode || '',
      payFrequency: settings.payFrequency || 'Monthly',
      defaultPayDate: settings.defaultPayDate || '',
      subscriptionStatus: data.status || 'ACTIVE',
      plan: mapPlanFromDbFormat(data.plan) as any,
      billingCycle: data.billing_cycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY',
      // Convert DB integer back to string format
      employeeLimit: (data.employee_limit >= 999999) ? 'Unlimited' : `${data.employee_limit} Employees`,
      resellerId: data.reseller_id,
      policies: settings.policies,
      reseller_defaults: settings.reseller_defaults
    };
  },

  saveCompany: async (companyId: string, settings: CompanySettings, userId?: string) => {
    if (!supabase) return null;

    // Use admin client for high-privilege write during signup/sync
    const adminClient = await supabaseService.getAdminClient();
    const effectiveClient = adminClient || supabase;

    // Get owner ID - use provided userId or fetch from auth
    let ownerId = userId;
    if (!ownerId) {
      const { data: authData } = await supabase.auth.getUser();
      ownerId = authData.user?.id;
    }

    if (!ownerId) {
      console.error('Unable to determine user ID for company owner');
      return null;
    }

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

    // Pack extra fields into settings JSONB
    // Pack extra fields into settings JSONB
    const settingsJson = {
      phone: settings.phone,
      bankName: settings.bankName,
      accountNumber: settings.accountNumber,
      branchCode: settings.branchCode,
      payFrequency: settings.payFrequency,
      defaultPayDate: settings.defaultPayDate,
      paymentMethod: settings.paymentMethod
    };

    const dbPlan = mapPlanToDbFormat(settings.plan);

    // Parse employee limit to integer for DB
    // Handle "Unlimited" -> 999999, "5 Employees" -> 5
    let dbLimit = 999999;
    if (settings.employeeLimit && settings.employeeLimit.toLowerCase() !== 'unlimited') {
      const match = settings.employeeLimit.match(/(\d+)/);
      if (match) {
        dbLimit = parseInt(match[1]);
      }
    }

    const { data: companyData, error } = await effectiveClient
      .from('companies')
      .upsert({
        id: companyId,
        // owner_id: ownerId, // Removed: Not in schema
        name: settings.name,
        email: settings.email,
        phone: settings.phone,
        trn: settings.trn,
        address: settings.address,
        settings: settingsJson,
        status: settings.subscriptionStatus || 'ACTIVE',
        plan: dbPlan, // Map to database format
        billing_cycle: settings.billingCycle || 'MONTHLY', // Save billing cycle
        employee_limit: dbLimit // Save employee limit as integer
        // payment_method: settings.paymentMethod // Removed: Not in schema, moved to settings JSON
      }, {
        onConflict: 'id'
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error saving company:', error);
      // Fallback: Use the Secure RPC if direct upsert failed despite admin client attempt
      console.warn("Retrying company creation via RPC fallback...");
      const { data: rpcData, error: rpcError } = await effectiveClient.rpc('create_company_secure', {
        p_company_id: companyId,
        p_owner_id: ownerId,
        p_name: settings.name,
        p_email: settings.email || null,
        p_phone: settings.phone || null,
        p_trn: settings.trn || null,
        p_address: settings.address || null,
        p_status: settings.subscriptionStatus || 'ACTIVE',
        p_plan: dbPlan,
        p_billing_cycle: settings.billingCycle || 'MONTHLY',
        p_employee_limit: dbLimit,
        p_payment_method: settings.paymentMethod,
        p_settings: settingsJson
      });

      if (rpcError) {
        console.error("RPC Fallback failed:", rpcError);
        return null;
      }
      return rpcData;
    }

    // CRITICAL: Explicitly ensure the owner is in account_members table
    if (ownerId && companyId) {
      console.log('👥 Ensuring owner is added to account_members...');
      try {
        // Try upsert with email constraint first
        const { error: memError } = await effectiveClient.from('account_members').upsert({
          account_id: companyId,
          user_id: ownerId,
          email: settings.email || '',
          role: 'OWNER',
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          invited_at: new Date().toISOString()
        }, {
          onConflict: 'account_id,email'
        });

        // Fallback: If 400 (likely missing constraint), try user_id constraint
        if (memError && (memError.code === '400' || (memError as any).status === 400)) {
          console.warn('⚠️ account_id+email constraint missing, retrying with user_id...');
          await effectiveClient.from('account_members').upsert({
            account_id: companyId,
            user_id: ownerId,
            role: 'OWNER',
            status: 'accepted',
            accepted_at: new Date().toISOString(),
            invited_at: new Date().toISOString()
          }, {
            onConflict: 'account_id,user_id'
          });
        } else if (memError) {
          console.error('❌ Error in account_members upsert:', memError);
        }
      } catch (err) {
        console.error('⚠️ Critical error adding owner to account_members:', err);
      }
    }

    return companyData;
  },

  // Save payment gateway settings to company settings JSONB
  savePaymentGatewaySettings: async (companyId: string, paymentConfig: any) => {
    if (!supabase) return;
    try {
      // Get current company settings
      const { data: company, error: fetchError } = await supabase
        .from('companies')
        .select('settings')
        .eq('id', companyId)
        .single();

      if (fetchError) {
        console.error("Error fetching company for payment settings:", fetchError);
        return;
      }

      const currentSettings = company?.settings || {};
      const updatedSettings = {
        ...currentSettings,
        paymentGateway: paymentConfig
      };

      const { error } = await supabase
        .from('companies')
        .update({ settings: updatedSettings })
        .eq('id', companyId);

      if (error) {
        console.error("Error saving payment gateway settings:", error);
      } else {
        console.log("✅ Payment gateway settings saved to Supabase");
      }
    } catch (e) {
      console.error("Error saving payment gateway settings:", e);
    }
  },

  // Get payment gateway settings from company settings
  getPaymentGatewaySettings: async (companyId: string) => {
    if (!supabase || !companyId) return null;
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('settings')
        .eq('id', companyId)
        .maybeSingle(); // Use maybeSingle to avoid errors if company doesn't exist yet (e.g., during signup)

      if (error) {
        // 406 errors are often RLS-related or company doesn't exist yet (during signup) - this is expected
        // Silently fall back to global config - no need to log as error
        return null;
      }

      if (!data) return null;
      return data.settings?.paymentGateway || null;
    } catch (e) {
      // Silently fail - will fall back to global config
      return null;
    }
  },

  // Get global config from dedicated global_config table (platform-wide)
  getGlobalConfig: async (): Promise<GlobalConfig | null> => {
    if (!supabase) return null;
    try {
      // 1. Try new global_config table first (full config for admins)
      const { data, error } = await supabase
        .from('global_config')
        .select('config')
        .eq('id', 'platform')
        .maybeSingle();

      if (!error && data) {
        console.log('✅ Loaded global config from dedicated table');
        return data.config || null;
      }

      // 2. Fallback to public_settings view (redacted config for anonymous users/signup)
      console.log('⚠️ global_config restricted, trying public_settings view');
      const { data: publicData, error: publicError } = await supabase
        .from('public_settings')
        .select('config')
        .eq('id', 'platform')
        .maybeSingle();

      if (!publicError && publicData) {
        console.log('✅ Loaded redacted global config from public view');
        return publicData.config || null;
      }

      // 3. Fallback to old method (companies.settings) for backwards compatibility
      console.log('⚠️ public_settings view not found or error, falling back to companies.settings');
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('settings')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (companyError) {
        console.error("Error fetching global config from companies:", companyError);
        return null;
      }

      return companyData?.settings?.globalConfig || null;
    } catch (e) {
      console.error("Error fetching global config:", e);
      return null;
    }
  },

  // Save global config to dedicated global_config table (platform-wide)
  saveGlobalConfig: async (config: GlobalConfig): Promise<boolean> => {
    if (!supabase) return false;
    try {
      // Try to save to new global_config table
      const { error } = await supabase
        .from('global_config')
        .upsert({
          id: 'platform',
          config: config,
          updated_at: new Date().toISOString()
        });

      if (!error) {
        console.log("✅ Global config saved to dedicated table (platform-wide)");
        return true;
      }

      // If table doesn't exist yet, fall back to old method
      console.warn("⚠️ global_config table not found, using fallback method");

      // Get all companies
      const { data: companies, error: fetchError } = await supabase
        .from('companies')
        .select('id, settings');

      if (fetchError) {
        console.error("Error fetching companies for global config:", fetchError);
        return false;
      }

      // Update all companies with global config (old method)
      if (!supabase) return false;
      const updates = (companies || []).map(company => {
        const currentSettings = company.settings || {};
        const updatedSettings = {
          ...currentSettings,
          globalConfig: config
        };

        if (!supabase) return Promise.resolve();
        return supabase
          .from('companies')
          .update({ settings: updatedSettings })
          .eq('id', company.id);
      });

      await Promise.all(updates);
      console.log("✅ Global config saved using fallback method");
      return true;
    } catch (e) {
      console.error("Error saving global config:", e);
      return false;
    }
  },

  // Get all users for a company
  getCompanyUsers: async (companyId: string): Promise<User[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('company_id', companyId);

      if (error) {
        console.error("Error fetching company users:", error);
        return [];
      }

      return (data || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role as any,
        companyId: u.company_id,
        isOnboarded: u.is_onboarded,
        avatarUrl: u.avatar_url || undefined,
        phone: u.phone || undefined,
        onboardingToken: u.preferences?.onboardingToken || undefined
      }));
    } catch (e) {
      console.error("Error fetching company users:", e);
      return [];
    }
  },

  getAllCompanies: async (): Promise<ResellerClient[]> => {
    if (!supabase) return [];

    let activeClient = supabase;
    const adminClient = await supabaseService.getAdminClient();
    if (adminClient) {
      console.debug('🕵️ Using admin client for getAllCompanies');
      activeClient = adminClient;
    }

    const { data, error } = await activeClient.from('companies').select('*');

    if (error || !data) {
      console.error("Error fetching companies:", error);
      return [];
    }

    // Map database plan format back to app format
    const mapPlanFromDbFormat = (dbPlan: string | undefined): string => {
      if (!dbPlan) return 'Free';
      const planMap: Record<string, string> = {
        'Free': 'Free',
        'Starter': 'Starter',
        'Professional': 'Pro',
        'Enterprise': 'Enterprise'
      };
      return planMap[dbPlan] || 'Free';
    };

    return data.map((c: any) => ({
      id: c.id,
      companyName: c.name,
      contactName: c.settings?.contactName || 'Admin',
      email: c.settings?.email || '',
      employeeCount: c.settings?.employeeCount || 0,
      plan: (mapPlanFromDbFormat(c.plan) || 'Free') as 'Free' | 'Starter' | 'Pro' | 'Enterprise' | 'Reseller',
      status: c.status || 'ACTIVE',
      mrr: c.settings?.mrr || 0
    }));
  },

  getCompanyById: async (companyId: string): Promise<CompanySettings | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (error || !data) {
      console.error("Error fetching company:", error);
      return null;
    }

    // Map database plan format back to app format
    const mapPlanFromDbFormat = (dbPlan: string | undefined): string => {
      if (!dbPlan) return 'Free';
      const planMap: Record<string, string> = {
        'Free': 'Free',
        'Starter': 'Starter',
        'Professional': 'Pro',
        'Enterprise': 'Enterprise'
      };
      return planMap[dbPlan] || 'Free';
    };

    return {
      id: data.id,
      name: data.name,
      trn: data.trn || '',
      address: data.address || '',
      phone: data.settings?.phone || '',
      bankName: data.settings?.bankName || '',
      accountNumber: data.settings?.accountNumber || '',
      branchCode: data.settings?.branchCode || '',
      payFrequency: data.settings?.payFrequency || 'Monthly',
      defaultPayDate: data.settings?.defaultPayDate,
      subscriptionStatus: data.status,
      plan: mapPlanFromDbFormat(data.plan) as any,
      paymentMethod: data.settings?.paymentMethod,
      resellerId: data.reseller_id,
      policies: data.settings?.policies,
      reseller_defaults: data.settings?.reseller_defaults
    };
  },

  updateCompanyStatus: async (companyId: string, status: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'PENDING_PAYMENT'): Promise<void> => {
    if (!supabase) return;

    let activeClient = supabase;
    const adminClient = await supabaseService.getAdminClient();
    if (adminClient) activeClient = adminClient;

    const { error } = await activeClient
      .from('companies')
      .update({ status: status })
      .eq('id', companyId);

    if (error) {
      console.error("Error updating company status:", error);
      throw error;
    }
  },

  deleteCompany: async (companyId: string): Promise<boolean> => {
    if (!supabase) return false;

    let activeClient = supabase;
    const adminClient = await supabaseService.getAdminClient();
    if (adminClient) activeClient = adminClient;

    // Due to Cascade Delete in DB, deleting company will remove employees, payruns, etc.
    const { error } = await activeClient
      .from('companies')
      .delete()
      .eq('id', companyId);

    if (error) {
      console.error("Error deleting company:", error);
      return false;
    }

    return true;
  },

  // --- Employees ---

  getEmployees: async (companyId: string): Promise<Employee[]> => {
    if (!supabase) return [];

    const adminClient = await supabaseService.getAdminClient();
    const effectiveClient = adminClient || supabase;

    const { data, error } = await effectiveClient
      .from('employees')
      .select('*')
      .eq('company_id', companyId);

    if (error) {
      console.error("Error loading employees:", error);
      return [];
    }

    return data.map((e: any) => ({
      id: e.id,
      firstName: e.first_name,
      lastName: e.last_name,
      email: e.email,
      trn: e.trn,
      nis: e.nis,
      employeeId: e.employee_number || undefined, // Map employee_number to employeeId
      status: e.status,
      role: e.role,
      hireDate: e.hire_date,
      jobTitle: e.job_title,
      department: e.department,
      // Unpack JSONB fields
      grossSalary: e.pay_data?.grossSalary || 0,
      hourlyRate: e.pay_data?.hourlyRate,
      payType: e.pay_data?.payType || 'SALARIED',
      payFrequency: e.pay_data?.payFrequency || 'MONTHLY',
      bankDetails: e.bank_details || {},
      leaveBalance: e.leave_balance || { vacation: 0, sick: 0, personal: 0 },
      allowances: e.allowances || [],
      deductions: e.deductions || [],
      terminationDetails: e.termination_details || undefined,
      onboardingToken: e.onboarding_token
    }));
  },

  /**
   * Get a specific employee by ID (for public payslip download)
   */
  getEmployeeById: async (employeeId: string): Promise<{ id: string; companyId: string; firstName: string; lastName: string; email: string } | null> => {
    if (!supabase) return null;

    const adminClient = await supabaseService.getAdminClient();
    const effectiveClient = adminClient || supabase;

    const { data, error } = await effectiveClient
      .from('employees')
      .select('id, company_id, first_name, last_name, email')
      .eq('id', employeeId)
      .single();

    if (error) {
      console.error("Error loading employee:", error);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      companyId: data.company_id,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email
    };
  },

  getEmployeeByToken: async (token: string, email?: string): Promise<{ employee: Employee; companyName: string; companyId: string } | null> => {
    if (!supabase) return null;
    try {
      let query = supabase
        .from('employees')
        .select(`
          *,
          companies!employees_company_id_fkey(name)
        `)
        .eq('onboarding_token', token);

      if (email) {
        query = query.eq('email', email);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error("Error fetching employee by token:", error);
        return null;
      }

      if (!data) return null;

      const employee: Employee = {
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        trn: data.trn || '',
        nis: data.nis || '',
        employeeId: data.employee_number || undefined, // Map employee_number to employeeId
        status: data.status,
        role: data.role as any,
        hireDate: data.hire_date,
        jobTitle: data.job_title,
        department: data.department,
        phone: data.phone,
        address: data.address,
        grossSalary: data.pay_data?.grossSalary || 0,
        hourlyRate: data.pay_data?.hourlyRate,
        payType: data.pay_data?.payType || 'SALARIED',
        payFrequency: data.pay_data?.payFrequency || 'MONTHLY',
        bankDetails: data.bank_details || {},
        leaveBalance: data.leave_balance || { vacation: 0, sick: 0, personal: 0 },
        allowances: data.allowances || [],
        deductions: data.deductions || [],
        terminationDetails: data.termination_details || undefined,
        onboardingToken: data.onboarding_token
      };

      // Extract company name and ID from the data
      const companyName = (data.companies as any)?.name || 'Your Company';
      const companyId = data.company_id || '';

      return { employee, companyName, companyId };
    } catch (e) {
      console.error("Error fetching employee by token:", e);
      return null;
    }
  },

  saveEmployee: async (emp: Employee, companyId: string) => {
    if (!supabase) return;

    // Pack JSONB fields
    const payData = {
      grossSalary: emp.grossSalary,
      hourlyRate: emp.hourlyRate,
      payType: emp.payType,
      payFrequency: emp.payFrequency
    };

    // Try with regular client first
    const { error } = await supabase
      .from('employees')
      .upsert({
        id: emp.id,
        company_id: companyId,
        first_name: emp.firstName,
        last_name: emp.lastName,
        email: emp.email,
        trn: emp.trn,
        nis: emp.nis,
        employee_number: emp.employeeId || null, // Save employeeId to employee_number column
        phone: emp.phone || null,
        address: emp.address || null,
        status: emp.status,
        role: emp.role,
        hire_date: emp.hireDate,
        job_title: emp.jobTitle,
        department: emp.department,
        pay_data: payData,
        bank_details: emp.bankDetails,
        leave_balance: emp.leaveBalance,
        allowances: emp.allowances,
        deductions: emp.deductions,
        termination_details: emp.terminationDetails,
        onboarding_token: emp.onboardingToken || null
      });

    // If RLS blocks (42501), use admin client fallback
    if (error && error.code === '42501') {
      console.debug('🛡️ RLS blocked employee save, using admin client...');
      const adminClient = await supabaseService.getAdminClient();
      if (adminClient) {
        const { error: adminError } = await adminClient
          .from('employees')
          .upsert({
            id: emp.id,
            company_id: companyId,
            first_name: emp.firstName,
            last_name: emp.lastName,
            email: emp.email,
            trn: emp.trn,
            nis: emp.nis,
            employee_number: emp.employeeId || null,
            phone: emp.phone || null,
            address: emp.address || null,
            status: emp.status,
            role: emp.role,
            hire_date: emp.hireDate,
            job_title: emp.jobTitle,
            department: emp.department,
            pay_data: payData,
            bank_details: emp.bankDetails,
            leave_balance: emp.leaveBalance,
            allowances: emp.allowances,
            deductions: emp.deductions,
            termination_details: emp.terminationDetails,
            onboarding_token: emp.onboardingToken || null
          });
        if (adminError) console.error("Error saving employee with admin client:", adminError);
      } else {
        console.error("Error saving employee (RLS blocked, no admin client):", error);
      }
    } else if (error) {
      console.error("Error saving employee:", error);
    }
  },

  deleteEmployee: async (employeeId: string, companyId: string) => {
    if (!supabase) return;

    const adminClient = await supabaseService.getAdminClient();
    const effectiveClient = adminClient || supabase;

    const { error } = await effectiveClient
      .from('employees')
      .delete()
      .eq('id', employeeId)
      .eq('company_id', companyId);

    if (error) {
      console.error("Error deleting employee:", error);
      throw error;
    }
  },

  // --- Pay Runs ---

  getPayRuns: async (companyId: string): Promise<PayRun[]> => {
    if (!supabase) return [];

    const adminClient = await supabaseService.getAdminClient();
    const effectiveClient = adminClient || supabase;

    const { data, error } = await effectiveClient
      .from('pay_runs')
      .select('*')
      .eq('company_id', companyId)
      .order('period_start', { ascending: false });

    if (error) {
      console.error("Error loading pay runs:", error);
      return [];
    }

    // Normalize status: map database statuses to app statuses
    const normalizeStatus = (dbStatus: string): 'DRAFT' | 'APPROVED' | 'FINALIZED' => {
      if (dbStatus === 'FINALIZED' || dbStatus === 'CANCELLED') return 'FINALIZED';
      if (dbStatus === 'APPROVED' || dbStatus === 'PROCESSING') return 'APPROVED';
      // DRAFT, REVIEW, or any other status -> DRAFT
      return 'DRAFT';
    };

    return data.map((r: any) => ({
      id: r.id,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      payDate: r.pay_date,
      payFrequency: r.pay_frequency || 'MONTHLY',
      status: normalizeStatus(r.status),
      totalGross: r.total_gross || 0,
      totalNet: r.total_net || 0,
      lineItems: r.line_items || []
    }));
  },

  /**
   * Get a specific pay run by ID (for public payslip download)
   */
  getPayRunById: async (runId: string): Promise<PayRun | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('pay_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (error) {
      console.error("Error loading pay run:", error);
      return null;
    }

    if (!data) return null;

    // Normalize status
    const normalizeStatus = (dbStatus: string): 'DRAFT' | 'APPROVED' | 'FINALIZED' => {
      if (dbStatus === 'FINALIZED' || dbStatus === 'CANCELLED') return 'FINALIZED';
      if (dbStatus === 'APPROVED' || dbStatus === 'PROCESSING') return 'APPROVED';
      return 'DRAFT';
    };

    return {
      id: data.id,
      periodStart: data.period_start,
      periodEnd: data.period_end,
      payDate: data.pay_date,
      payFrequency: data.pay_frequency || 'MONTHLY',
      status: normalizeStatus(data.status),
      totalGross: data.total_gross || 0,
      totalNet: data.total_net || 0,
      lineItems: data.line_items || []
    };
  },

  savePayRun: async (run: PayRun, companyId: string, options?: { allowMultiple?: boolean }) => {
    if (!supabase) return;
    const allowMultiple = options?.allowMultiple ?? false;

    // Use admin client for high-privilege write to bypass RLS if regular auth fails
    const adminClient = await supabaseService.getAdminClient();
    const effectiveClient = adminClient || supabase;

    // Determine pay_frequency - default to MONTHLY if not specified
    // If payFrequency is not set, we'll default to MONTHLY (most common)
    const payFrequency = run.payFrequency || 'MONTHLY';

    // Convert period_start to first day of month if in YYYY-MM format
    let periodStart = run.periodStart;
    if (periodStart.match(/^\d{4}-\d{2}$/)) {
      periodStart = `${periodStart}-01`;
    }

    // Convert period_end to last day of month if in YYYY-MM format
    let periodEnd = run.periodEnd;
    if (periodEnd.match(/^\d{4}-\d{2}$/)) {
      const [yearStr, monthStr] = periodEnd.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const lastDay = new Date(year, month, 0).getDate();
      periodEnd = `${periodEnd}-${lastDay.toString().padStart(2, '0')}`;
    }

    // Check if THIS SPECIFIC pay run exists (by ID) and pull notes for token reuse
    const { data: existingById } = await effectiveClient
      .from('pay_runs')
      .select('id, notes')
      .eq('id', run.id)
      .maybeSingle();

    // Also check if a pay run exists for this period/frequency combination (for logging)
    const { data: existingByPeriod } = await effectiveClient
      .from('pay_runs')
      .select('id')
      .eq('company_id', companyId)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .eq('pay_frequency', payFrequency)
      .maybeSingle();

    // Ensure we include a finalized token inside `notes` when a run is finalized.
    // We store it in the existing `notes` TEXT column to avoid schema changes.
    let finalizedToken: string | null = null;
    if (run.status === 'FINALIZED') {
      // Try to reuse existing token if present on the same run
      if (existingById && (existingById as any).notes) {
        const match = ((existingById as any).notes as string).match(/finalized_token:([0-9a-fA-F-]+)/);
        if (match) finalizedToken = match[1];
      }
      if (!finalizedToken) finalizedToken = generateUUID();
    }

    const payRunData: any = {
      company_id: companyId,
      period_start: periodStart,
      period_end: periodEnd,
      pay_date: run.payDate,
      pay_frequency: payFrequency,
      status: run.status,
      total_gross: run.totalGross,
      total_net: run.totalNet,
      employee_count: run.lineItems?.length || 0,
      line_items: run.lineItems || [] // Stored as JSONB
    };

    if (finalizedToken) {
      const tokenNote = `finalized_token:${finalizedToken}`;
      // Preserve any existing notes while appending token if not present
      const existingNotes = (existingById && (existingById as any).notes) ? (existingById as any).notes : '';
      if (!existingNotes || !existingNotes.includes('finalized_token:')) {
        payRunData.notes = existingNotes ? `${existingNotes}\n${tokenNote}` : tokenNote;
      } else {
        payRunData.notes = existingNotes;
      }
    }

    let error;
    let result;
    if (existingById && existingById.id === run.id) {
      // Update existing record (same ID)
      console.log('📝 Updating existing pay run:', existingById.id);
      result = await effectiveClient
        .from('pay_runs')
        .update(payRunData)
        .eq('id', run.id);
      error = result.error;
    } else {
      // No existing ID match; decide whether to update an existing period or insert
      // a new record. Default (allowMultiple=false) will update the existing period
      // run if present to avoid creating duplicate runs unexpectedly. If callers
      // explicitly pass { allowMultiple: true } we will insert a new run even
      // when a run for the same period already exists.
      if (existingByPeriod && !allowMultiple) {
        console.log('ℹ️ Existing pay run for this period found; updating it to avoid duplicates:', existingByPeriod.id);
        result = await effectiveClient
          .from('pay_runs')
          .update(payRunData)
          .eq('id', existingByPeriod.id);
        error = result.error;
      } else {
        console.log(`➕ Inserting new pay run (allowMultiple=${allowMultiple}):`, run.id);
        result = await effectiveClient
          .from('pay_runs')
          .insert({
            id: run.id,
            ...payRunData
          });
        error = result.error;

        // If insert fails due to unique constraint (existing UNIQUE on company+period+frequency),
        // handle based on allowMultiple setting
        if (error && (error.code === '23505' || /duplicate key|unique constraint|already exists/i.test(error.message || ''))) {
          if (allowMultiple) {
            // User wants multiple runs for same period - treat constraint error as success
            console.log('ℹ️ Unique constraint hit but allowMultiple=true; multiple pay runs for same period are allowed. Treating as success.');
            error = null;
            result = { data: { id: run.id }, status: 200, statusText: 'Multiple runs allowed' };
          } else {
            // Original behavior: attempt a safe fallback to update the existing period run
            console.warn('⚠️ Insert failed due to unique constraint; attempting to update existing period run instead.');
            console.warn('Conflicting pay run details:', {
              attemptedId: run.id,
              status: run.status,
              period: `${periodStart} to ${periodEnd}`,
              frequency: payFrequency
            });

            try {
              const { data: existingForPeriod } = await effectiveClient
                .from('pay_runs')
                .select('id, status')
                .eq('company_id', companyId)
                .eq('period_start', periodStart)
                .eq('period_end', periodEnd)
                .eq('pay_frequency', payFrequency)
                .maybeSingle();

              const targetId = existingForPeriod?.id || (existingByPeriod && (existingByPeriod as any).id);
              if (targetId) {
                // Only update if the new status is more advanced (DRAFT < APPROVED < FINALIZED)
                // or if statuses are the same
                const statusPriority: any = { 'DRAFT': 1, 'APPROVED': 2, 'FINALIZED': 3 };
                const existingPriority = statusPriority[existingForPeriod?.status] || 1;
                const newPriority = statusPriority[run.status] || 1;

                if (newPriority >= existingPriority) {
                  console.log('🔁 Updating existing pay run for period as fallback:', targetId, `(${existingForPeriod?.status} → ${run.status})`);
                  const updateResult = await effectiveClient
                    .from('pay_runs')
                    .update(payRunData)
                    .eq('id', targetId)
                    .select();

                  if (!updateResult.error) {
                    // Fallback succeeded - clear the original error and use the update result
                    error = null;
                    result = updateResult;
                    console.log('✅ Successfully updated existing pay run instead of creating duplicate');
                  } else {
                    error = updateResult.error;
                    result = updateResult;
                  }
                } else {
                  console.log('ℹ️ Skipping update - existing run has higher priority status:', existingForPeriod?.status);
                  // Clear error since we're intentionally not updating
                  error = null;
                  result = { data: existingForPeriod, status: 200, statusText: 'Skipped - existing run preserved' };
                }
              } else {
                console.warn('⚠️ Could not find existing pay run to update after unique constraint failure.');
              }
            } catch (fallbackErr) {
              console.error('❌ Fallback update after unique constraint failed:', fallbackErr);
            }
          }
        }
      }
    }

    console.log('📊 Save result:', {
      error: error ? JSON.stringify(error) : 'none',
      data: result?.data,
      count: result?.count,
      status: result?.status,
      statusText: result?.statusText
    });

    if (error) {
      // This should not happen if fallback logic worked correctly
      console.error("❌ Error saving pay run to Supabase:", error);
      console.error("Pay run data:", {
        id: run.id,
        period_start: periodStart,
        period_end: periodEnd,
        pay_date: run.payDate,
        pay_frequency: payFrequency,
        status: run.status,
        company_id: companyId
      });
      throw new Error(`Failed to save pay run: ${error.message || error.code || 'Unknown error'}`);
    } else {
      console.log("✅ Pay run save reported success:", {
        id: run.id,
        status: run.status,
        period: periodStart,
        resultData: result?.data,
        resultCount: result?.count
      });

      // Verify the save by querying it back (this will fail if RLS blocks read)
      console.log('🔍 Verifying pay run exists in database...');
      const { data: verifyData, error: verifyError } = await supabase
        .from('pay_runs')
        .select('id, status, company_id')
        .eq('id', run.id)
        .eq('company_id', companyId) // Add company_id filter to help RLS
        .maybeSingle(); // Use maybeSingle instead of single to avoid error on 0 rows

      if (verifyError) {
        console.error("⚠️ WARNING: Pay run save reported success but verification query failed:", {
          verifyError: JSON.stringify(verifyError),
          runId: run.id,
          companyId: companyId,
          errorCode: verifyError.code,
          errorMessage: verifyError.message
        });
        // Don't throw - RLS might block read even though write succeeded
        // The Edge Function will use SERVICE_ROLE_KEY to read it
        console.warn("⚠️ Verification failed but save succeeded. Edge Function will use SERVICE_ROLE_KEY to read.");
      } else if (!verifyData) {
        console.warn("⚠️ WARNING: Pay run save reported success but not found in database (RLS may be blocking read):", {
          runId: run.id,
          companyId: companyId
        });
        console.warn("⚠️ This is OK - Edge Function uses SERVICE_ROLE_KEY to bypass RLS");
      } else {
        console.log("✅ Verified: Pay run exists in database:", {
          id: verifyData.id,
          status: verifyData.status,
          company_id: verifyData.company_id
        });
      }
      // If finalized, persist a lightweight snapshot record with the finalized token.
      if (finalizedToken) {
        try {
          let savedId: string | undefined = undefined;
          if (result?.data && Array.isArray(result.data) && result.data.length > 0 && typeof result.data[0] === 'object' && 'id' in result.data[0]) {
            savedId = (result.data as any[])[0].id;
          } else if (run.id) {
            savedId = run.id;
          } else if (existingByPeriod && (existingByPeriod as any).id) {
            savedId = (existingByPeriod as any).id;
          }
          const snapshotPayload = {
            pay_run_id: savedId,
            company_id: companyId,
            finalized_token: finalizedToken,
            snapshot_data: {
              id: savedId,
              period_start: periodStart,
              period_end: periodEnd,
              pay_date: run.payDate,
              status: run.status,
              total_gross: run.totalGross,
              total_net: run.totalNet,
              employee_count: run.lineItems?.length || 0,
              line_items: run.lineItems || []
            },
            notes: payRunData.notes || null
          };

          const { error: snapErr } = await supabase
            .from('pay_run_snapshots')
            .insert(snapshotPayload);

          if (snapErr) {
            console.warn('⚠️ Failed to write pay_run_snapshots record:', snapErr);
          } else {
            console.log('✅ pay_run_snapshots record created for finalized run', { pay_run_id: savedId, finalizedToken });
          }
        } catch (snapEx) {
          console.warn('⚠️ Exception while creating pay_run_snapshots record:', snapEx);
        }
      }
    }
    // Return the saved data and token where available
    return { data: result?.data, finalizedToken: payRunData._finalized_token || null };
  },

  deletePayRun: async (runId: string, companyId: string): Promise<boolean> => {
    if (!supabase) return false;

    const adminClient = await supabaseService.getAdminClient();
    const effectiveClient = adminClient || supabase;

    const { error } = await effectiveClient
      .from('pay_runs')
      .delete()
      .eq('id', runId)
      .eq('company_id', companyId);

    if (error) {
      console.error("Error deleting pay run:", error);
      return false;
    }

    return true;
  },

  // --- Leave Requests ---

  getLeaveRequests: async (companyId: string): Promise<LeaveRequest[]> => {
    if (!supabase) return [];

    const adminClient = await supabaseService.getAdminClient();
    const effectiveClient = adminClient || supabase;

    try {
      const { data, error } = await effectiveClient
        .from('leave_requests')
        .select('*')
        .eq('company_id', companyId);

      if (error) {
        console.error("Error fetching leave requests:", error);
        return [];
      }

      return (data || []).map((r: any) => ({
        id: r.id,
        employeeId: r.employee_id,
        employeeName: r.employee_name || '',
        type: r.type,
        startDate: r.start_date,
        endDate: r.end_date,
        days: r.days,
        reason: r.reason,
        status: r.status,
        requestedDates: r.requested_dates || [],
        approvedDates: r.approved_dates || []
      }));
    } catch (e) {
      console.error("Error fetching leave requests:", e);
      return [];
    }
  },

  saveLeaveRequest: async (req: LeaveRequest, companyId: string) => {
    if (!supabase) return;

    const adminClient = await supabaseService.getAdminClient();
    const effectiveClient = adminClient || supabase;

    try {
      const { error } = await effectiveClient
        .from('leave_requests')
        .upsert({
          id: req.id,
          company_id: companyId,
          employee_id: req.employeeId,
          employee_name: req.employeeName,
          type: req.type,
          start_date: req.startDate,
          end_date: req.endDate,
          days: req.days,
          reason: req.reason,
          status: req.status,
          requested_dates: req.requestedDates,
          approved_dates: req.approvedDates
        });

      if (error) console.error("Error saving leave request:", error);
    } catch (e) {
      console.error("Error saving leave request:", e);
    }
  },

  // --- Timesheets ---

  getTimesheets: async (companyId: string): Promise<WeeklyTimesheet[]> => {
    if (!supabase) return [];

    const adminClient = await supabaseService.getAdminClient();
    const effectiveClient = adminClient || supabase;

    try {
      const { data, error } = await effectiveClient
        .from('timesheets')
        .select('*')
        .eq('company_id', companyId)
        .order('week_start_date', { ascending: false });

      if (error) {
        console.error("Error fetching timesheets:", error);
        return [];
      }

      return (data || []).map((ts: any) => ({
        id: ts.id,
        employeeId: ts.employee_id,
        employeeName: ts.employee_name || '',
        weekStartDate: ts.week_start_date,
        weekEndDate: ts.week_end_date,
        status: ts.status,
        totalRegularHours: ts.total_regular_hours || 0,
        totalOvertimeHours: ts.total_overtime_hours || 0,
        entries: ts.entries || []
      }));
    } catch (e) {
      console.error("Error fetching timesheets:", e);
      return [];
    }
  },

  saveTimesheet: async (ts: WeeklyTimesheet, companyId: string) => {
    if (!supabase) return;

    const adminClient = await supabaseService.getAdminClient();
    const effectiveClient = adminClient || supabase;

    try {
      const { error } = await effectiveClient
        .from('timesheets')
        .upsert({
          id: ts.id,
          company_id: companyId,
          employee_id: ts.employeeId,
          employee_name: ts.employeeName,
          week_start_date: ts.weekStartDate,
          week_end_date: ts.weekEndDate,
          status: ts.status,
          total_regular_hours: ts.totalRegularHours,
          total_overtime_hours: ts.totalOvertimeHours,
          entries: ts.entries,
          submitted_at: ts.status === 'SUBMITTED' ? new Date().toISOString() : null
        });

      if (error) console.error("Error saving timesheet:", error);
    } catch (e) {
      console.error("Error saving timesheet:", e);
    }
  },

  approveTimesheet: async (timesheetId: string, reviewerId: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('timesheets')
      .update({
        status: 'APPROVED',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', timesheetId);

    if (error) console.error("Error approving timesheet:", error);
  },

  rejectTimesheet: async (timesheetId: string, reviewerId: string, reason: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('timesheets')
      .update({
        status: 'REJECTED',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason
      })
      .eq('id', timesheetId);

    if (error) console.error("Error rejecting timesheet:", error);
  },

  // --- Document Requests ---

  getDocumentRequests: async (companyId: string): Promise<DocumentRequest[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('document_requests')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching document requests:", error);
        return [];
      }

      return (data || []).map((req: any) => ({
        id: req.id,
        employeeId: req.employee_id,
        employeeName: req.employee_name || '',
        templateId: req.template_id,
        documentType: req.document_type,
        purpose: req.purpose || '',
        status: req.status,
        requestedAt: req.created_at,
        reviewedBy: req.reviewed_by,
        reviewedAt: req.reviewed_at,
        rejectionReason: req.rejection_reason,
        generatedContent: req.generated_content,
        fileUrl: req.file_url
      }));
    } catch (e) {
      console.error("Error fetching document requests:", e);
      return [];
    }
  },

  saveDocumentRequest: async (request: DocumentRequest, companyId: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('document_requests')
        .upsert({
          id: request.id,
          company_id: companyId,
          employee_id: request.employeeId,
          template_id: request.templateId,
          document_type: request.documentType,
          purpose: request.purpose,
          status: request.status,
          reviewed_by: request.reviewedBy,
          reviewed_at: request.reviewedAt,
          rejection_reason: request.rejectionReason,
          generated_content: request.generatedContent,
          file_url: request.fileUrl
        });

      if (error) console.error("Error saving document request:", error);
    } catch (e) {
      console.error("Error saving document request:", e);
    }
  },

  approveDocumentRequest: async (requestId: string, reviewerId: string, generatedContent: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('document_requests')
      .update({
        status: 'APPROVED',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        generated_content: generatedContent,
        generated_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (error) console.error("Error approving document request:", error);
  },

  rejectDocumentRequest: async (requestId: string, reviewerId: string, reason: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('document_requests')
      .update({
        status: 'REJECTED',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason
      })
      .eq('id', requestId);

    if (error) console.error("Error rejecting document request:", error);
  },

  // --- Document Templates ---

  getDocumentTemplates: async (companyId: string): Promise<DocumentTemplate[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .or(`company_id.eq.${companyId},is_global.eq.true`)
        .order('name');

      if (error) {
        console.error("Error fetching document templates:", error);
        return [];
      }

      return (data || []).map((tpl: any) => ({
        id: tpl.id,
        name: tpl.name,
        category: tpl.category,
        content: tpl.content,
        lastModified: tpl.updated_at,
        requiresApproval: tpl.requires_approval
      }));
    } catch (e) {
      console.error("Error fetching document templates:", e);
      return [];
    }
  },

  // --- Expert Referrals (Ask an Expert) ---

  getExpertReferrals: async (companyId: string): Promise<ExpertReferral[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('expert_referrals')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching expert referrals:", error);
        return [];
      }

      return (data || []).map((ref: any) => ({
        id: ref.id,
        companyId: ref.company_id,
        userId: ref.user_id,
        userName: ref.user_name || '',
        question: ref.question,
        category: ref.category,
        urgency: ref.urgency,
        status: ref.status,
        assignedResellerId: ref.assigned_reseller_id,
        assignedExpertId: ref.assigned_expert_id,
        expertResponse: ref.expert_response,
        createdAt: ref.created_at,
        respondedAt: ref.responded_at
      }));
    } catch (e) {
      console.error("Error fetching expert referrals:", e);
      return [];
    }
  },

  saveExpertReferral: async (referral: ExpertReferral) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('expert_referrals')
        .upsert({
          id: referral.id,
          company_id: referral.companyId,
          user_id: referral.userId,
          question: referral.question,
          category: referral.category,
          urgency: referral.urgency,
          status: referral.status,
          assigned_reseller_id: referral.assignedResellerId,
          assigned_expert_id: referral.assignedExpertId,
          expert_response: referral.expertResponse,
          responded_at: referral.respondedAt
        });

      if (error) console.error("Error saving expert referral:", error);
    } catch (e) {
      console.error("Error saving expert referral:", e);
    }
  },

  // --- YTD (Year-to-Date) Tracking ---

  getEmployeeYTD: async (employeeId: string, taxYear: number) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('employee_ytd')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('tax_year', taxYear)
        .maybeSingle();

      if (error) {
        console.error("Error fetching YTD:", error);
        return null;
      }

      return data ? {
        ytdGross: data.ytd_gross || 0,
        ytdTaxableGross: data.ytd_taxable_gross || 0,
        ytdNIS: data.ytd_nis || 0,
        ytdNHT: data.ytd_nht || 0,
        ytdEdTax: data.ytd_education_tax || 0,
        ytdPAYE: data.ytd_paye || 0,
        ytdEmployerNIS: data.ytd_employer_nis || 0,
        ytdEmployerNHT: data.ytd_employer_nht || 0,
        ytdEmployerEdTax: data.ytd_employer_education_tax || 0,
        ytdEmployerHEART: data.ytd_employer_heart || 0,
        periodsPaid: data.periods_paid || 0
      } : null;
    } catch (e) {
      console.error("Error fetching YTD:", e);
      return null;
    }
  },

  updateEmployeeYTD: async (employeeId: string, companyId: string, taxYear: number, ytdData: any) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('employee_ytd')
        .upsert({
          employee_id: employeeId,
          company_id: companyId,
          tax_year: taxYear,
          ytd_gross: ytdData.ytdGross,
          ytd_taxable_gross: ytdData.ytdTaxableGross,
          ytd_nis: ytdData.ytdNIS,
          ytd_nht: ytdData.ytdNHT,
          ytd_education_tax: ytdData.ytdEdTax,
          ytd_paye: ytdData.ytdPAYE,
          ytd_employer_nis: ytdData.ytdEmployerNIS,
          ytd_employer_nht: ytdData.ytdEmployerNHT,
          ytd_employer_education_tax: ytdData.ytdEmployerEdTax,
          ytd_employer_heart: ytdData.ytdEmployerHEART,
          periods_paid: ytdData.periodsPaid,
          last_pay_date: ytdData.lastPayDate
        });

      if (error) console.error("Error updating YTD:", error);
    } catch (e) {
      console.error("Error updating YTD:", e);
    }
  },

  // --- Audit Logs ---

  saveAuditLog: async (log: AuditLogEntry, companyId: string) => {
    if (!supabase) return;

    // 1. Attempt with standard client (user's own context)
    const { error } = await supabase.from('audit_logs').insert({
      id: log.id,
      company_id: companyId,
      actor_id: log.actorId,
      actor_name: log.actorName,
      action: log.action,
      entity: log.entity,
      description: log.description,
      timestamp: log.timestamp,
      ip_address: log.ipAddress
    });

    // 2. Fallback to Admin client if forbidden (likely due to impersonation/RLS)
    if (error && (error.code === '403' || error.code === '42501')) {
      console.warn('🛡️ Audit log write failed with RLS (403), retrying with admin client...');
      const adminClient = await supabaseService.getAdminClient();
      if (adminClient) {
        await adminClient.from('audit_logs').insert({
          id: log.id,
          company_id: companyId,
          actor_id: log.actorId,
          actor_name: log.actorName,
          action: log.action,
          entity: log.entity,
          description: log.description,
          timestamp: log.timestamp,
          ip_address: log.ipAddress
        });
      }
    } else if (error) {
      console.error('❌ Failed to save audit log:', error);
    }
  },

  getAuditLogs: async (companyId: string | null, userRole?: string, userId?: string): Promise<AuditLogEntry[]> => {
    if (!supabase) return [];

    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(500);

      const isCompanyAdmin = ['OWNER', 'ADMIN', 'RESELLER'].includes(userRole || '');

      // Super admins can see all audit logs (globally or filtered by company)
      if (userRole === 'SUPER_ADMIN') {
        if (companyId) {
          query = query.eq('company_id', companyId);
        }
      } else {
        // Non-super admin MUST have a companyId to see anything
        if (!companyId) return [];

        query = query.eq('company_id', companyId);

        // Individual users (non-admins) should only see their own audit logs
        if (!isCompanyAdmin) {
          if (userId) {
            query = query.eq('actor_id', userId);
          } else {
            // If safety check fails (no user ID), return nothing
            return [];
          }
        }
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching audit logs:", error);
        return [];
      }

      if (!data) return [];

      return data.map((log: any) => ({
        id: log.id,
        timestamp: log.timestamp,
        actorId: log.actor_id,
        actorName: log.actor_name,
        action: log.action,
        entity: log.entity,
        description: log.description,
        ipAddress: log.ip_address
      }));
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      return [];
    }
  },

  // --- Subscriptions ---

  getSubscription: async (companyId: string) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error fetching subscription:", error);
        return null;
      }

      if (!data) return null;

      return {
        id: data.id,
        companyId: data.company_id,
        planName: data.plan_name,
        planType: data.plan_type,
        status: data.status,
        billingFrequency: data.billing_frequency,
        amount: parseFloat(data.amount),
        currency: data.currency,
        startDate: data.start_date,
        endDate: data.end_date,
        nextBillingDate: data.next_billing_date,
        autoRenew: data.auto_renew,
        metadata: data.metadata || {},
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (e) {
      console.error("Error fetching subscription:", e);
      return null;
    }
  },

  createSubscription: async (subscriptionData: {
    companyId: string;
    planName: string;
    planType: string;
    billingFrequency: string;
    amount: number;
    currency?: string;
    startDate?: string;
    nextBillingDate?: string;
    metadata?: any;
  }) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          company_id: subscriptionData.companyId,
          plan_name: subscriptionData.planName,
          plan_type: subscriptionData.planType,
          billing_frequency: subscriptionData.billingFrequency,
          amount: subscriptionData.amount,
          currency: subscriptionData.currency || 'JMD',
          start_date: subscriptionData.startDate || new Date().toISOString(),
          next_billing_date: subscriptionData.nextBillingDate,
          metadata: subscriptionData.metadata || {}
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating subscription:", error);
        return null;
      }

      // Update company's current_subscription_id
      await supabase
        .from('companies')
        .update({ current_subscription_id: data.id })
        .eq('id', subscriptionData.companyId);

      return data;
    } catch (e) {
      console.error("Error creating subscription:", e);
      return null;
    }
  },

  updateSubscription: async (subscriptionId: string, updates: {
    status?: string;
    planName?: string;
    planType?: string;
    amount?: number;
    nextBillingDate?: string;
    autoRenew?: boolean;
    metadata?: any;
  }) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          ...(updates.status && { status: updates.status }),
          ...(updates.planName && { plan_name: updates.planName }),
          ...(updates.planType && { plan_type: updates.planType }),
          ...(updates.amount !== undefined && { amount: updates.amount }),
          ...(updates.nextBillingDate && { next_billing_date: updates.nextBillingDate }),
          ...(updates.autoRenew !== undefined && { auto_renew: updates.autoRenew }),
          ...(updates.metadata && { metadata: updates.metadata })
        })
        .eq('id', subscriptionId)
        .select()
        .single();

      if (error) {
        console.error("Error updating subscription:", error);
        return null;
      }

      return data;
    } catch (e) {
      console.error("Error updating subscription:", e);
      return null;
    }
  },

  // --- Payment History ---

  getPaymentHistory: async (companyId: string, limit: number = 50) => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('payment_history')
        .select('*')
        .eq('company_id', companyId)
        .order('payment_date', { ascending: false })
        .limit(limit);

      if (error) {
        console.error("Error fetching payment history:", error);
        return [];
      }

      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data.map(payment => ({
        id: payment.id,
        companyId: payment.company_id,
        subscriptionId: payment.subscription_id,
        amount: parseFloat(payment.amount),
        currency: payment.currency,
        status: payment.status,
        paymentMethod: payment.payment_method,
        transactionId: payment.transaction_id,
        invoiceNumber: payment.invoice_number,
        description: payment.description,
        paymentDate: payment.payment_date,
        metadata: payment.metadata || {},
        createdAt: payment.created_at
      }));
    } catch (e) {
      console.error("Error fetching payment history:", e);
      return [];
    }
  },

  createPaymentRecord: async (paymentData: {
    companyId: string;
    subscriptionId?: string;
    amount: number;
    currency?: string;
    status: string;
    paymentMethod?: string;
    transactionId?: string;
    invoiceNumber?: string;
    description?: string;
    paymentDate?: string;
    metadata?: any;
  }) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('payment_history')
        .insert({
          company_id: paymentData.companyId,
          subscription_id: paymentData.subscriptionId,
          amount: paymentData.amount,
          currency: paymentData.currency || 'JMD',
          status: paymentData.status,
          payment_method: paymentData.paymentMethod || 'card',
          transaction_id: paymentData.transactionId,
          invoice_number: paymentData.invoiceNumber,
          description: paymentData.description,
          payment_date: paymentData.paymentDate || new Date().toISOString(),
          metadata: paymentData.metadata || {}
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating payment record:", error);
        return null;
      }

      return data;
    } catch (e) {
      console.error("Error creating payment record:", e);
      return null;
    }
  },

  getAllSubscriptions: async () => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, companies(name)')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching all subscriptions:", error);
        return [];
      }

      return data;
    } catch (e) {
      console.error("Error fetching all subscriptions:", e);
      return [];
    }
  },

  getAllPayments: async (limit: number = 1000) => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('payment_history')
        .select('*, companies(name)')
        .eq('status', 'completed')
        .order('payment_date', { ascending: false })
        .limit(limit);

      if (error) {
        console.error("Error fetching all payments:", error);
        return [];
      }

      return data;
    } catch (e) {
      console.error("Error fetching all payments:", e);
      return [];
    }
  },

  getAllSuperAdmins: async (): Promise<User[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('role', 'SUPER_ADMIN')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching super admins:", error);
        return [];
      }

      if (!data) return [];

      return data.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role as any,
        companyId: u.company_id,
        isOnboarded: u.is_onboarded,
        avatarUrl: u.avatar_url || undefined,
        phone: u.phone || undefined
      }));
    } catch (e) {
      console.error("Error fetching super admins:", e);
      return [];
    }
  },

  deleteUser: async (userId: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { error } = await supabase
        .from('app_users')
        .delete()
        .eq('id', userId);

      if (error) {
        console.error("Error deleting user:", error);
        return false;
      }

      return true;
    } catch (e) {
      console.error("Error deleting user:", e);
      return false;
    }
  },

  // Delete user account and all associated data
  deleteAccount: async (userId: string, userRole: string, companyId?: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      // 1. Get user's auth_user_id before deletion
      const { data: userData, error: fetchError } = await supabase
        .from('app_users')
        .select('auth_user_id, company_id')
        .eq('id', userId)
        .maybeSingle();

      if (fetchError) {
        console.error("Error fetching user for deletion:", fetchError);
        return false;
      }

      const authUserId = userData?.auth_user_id;
      const userCompanyId = companyId || userData?.company_id;

      // 2. If user is OWNER, delete the company (cascade will delete employees, pay runs, etc.)
      if (userRole === 'OWNER' && userCompanyId) {
        const { error: companyError } = await supabase
          .from('companies')
          .delete()
          .eq('id', userCompanyId);

        if (companyError) {
          console.error("Error deleting company:", companyError);
          // Continue with user deletion even if company deletion fails
        } else {
          console.log("✅ Company deleted (cascade will handle related data)");
        }
      }

      // 3. Delete app_users record
      const { error: userError } = await supabase
        .from('app_users')
        .delete()
        .eq('id', userId);

      if (userError) {
        console.error("Error deleting app_users record:", userError);
        return false;
      }

      // 4. Delete auth user if auth_user_id exists (requires service role)
      if (authUserId) {
        try {
          const serviceRoleKey = import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY;
          const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || localStorage.getItem('VITE_SUPABASE_URL');

          if (serviceRoleKey && supabaseUrl) {
            const { createClient } = await import('@supabase/supabase-js');
            const adminClient = createClient(supabaseUrl, serviceRoleKey, {
              auth: {
                autoRefreshToken: false,
                persistSession: false
              }
            });

            const { error: authError } = await adminClient.auth.admin.deleteUser(authUserId);
            if (authError) {
              console.warn("Could not delete auth user:", authError);
              // Continue - user is already deleted from app_users
            } else {
              console.log("✅ Auth user deleted");
            }
          } else {
            console.warn("Service role key not available - auth user may still exist");
          }
        } catch (authDeleteError) {
          console.warn("Error deleting auth user:", authDeleteError);
          // Continue - user is already deleted from app_users
        }
      }

      return true;
    } catch (e) {
      console.error("Error deleting account:", e);
      return false;
    }
  },

  // --- Reseller Client Management ---

  // Save a reseller invite (pending client)
  saveResellerInvite: async (
    resellerId: string,
    email: string,
    token: string,
    contactName?: string,
    companyName?: string
  ): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { error } = await supabase
        .from('reseller_invites')
        .upsert({
          reseller_id: resellerId,
          invite_email: email,
          invite_token: token,
          contact_name: contactName,
          company_name: companyName,
          status: 'PENDING',
        }, {
          onConflict: 'reseller_id,invite_email',
        });

      if (error) {
        console.error('Error saving reseller invite:', error);
        return false;
      }

      return true;
    } catch (e) {
      console.error('Exception in saveResellerInvite:', e);
      return false;
    }
  },

  // Get all reseller invites (pending clients)
  getResellerInvites: async (resellerId: string): Promise<any[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('reseller_invites')
        .select('*')
        .eq('reseller_id', resellerId)
        .eq('status', 'PENDING')
        .order('invited_at', { ascending: false });

      if (error) {
        console.error('Error fetching reseller invites:', error);
        return [];
      }

      return data || [];
    } catch (e) {
      console.error('Exception in getResellerInvites:', e);
      return [];
    }
  },

  // Accept a reseller invite and create the client relationship
  acceptResellerInvite: async (
    token: string,
    clientCompanyId: string,
    resellerUserId?: string,
    resellerEmail?: string,
    resellerCompanyId?: string
  ): Promise<boolean> => {
    if (!supabase) return false;
    try {
      console.log('🔗 Accepting reseller invite...', { token, clientCompanyId, resellerUserId, resellerCompanyId });

      // Get admin client for looking up invite and creating records
      const adminClient = await supabaseService.getAdminClient();
      const effectiveClient = adminClient || supabase;

      // 1. Resolve Reseller Company ID (using effective client for RLS bypass)
      let rId = resellerCompanyId;

      if (!rId) {
        // Fetch the invite info for reseller_id if not provided
        // Use effectiveClient (admin if available) to bypass RLS
        const { data: invite } = await effectiveClient
          .from('reseller_invites')
          .select('reseller_id')
          .eq('invite_token', token)
          .maybeSingle();

        rId = invite?.reseller_id;
      }

      // 2. Use the Secure RPC function first (handles linking in DB)
      const { error: rpcError } = await effectiveClient.rpc('accept_reseller_invite_v2', {
        p_invite_token: token,
        p_client_company_id: clientCompanyId || null
      });

      if (rpcError) {
        console.warn('⚠️ RPC accept_reseller_invite_v2 warning:', rpcError);
      }

      // 3. FORCE ASSOCIATIONS via Code (Direct Upserts)
      if (rId) {
        console.log('🔄 Linking company to reseller:', rId);

        // A. Update company's reseller_id (Use effectiveClient to bypass RLS)
        const { error: companyLinkError } = await effectiveClient
          .from('companies')
          .update({ reseller_id: rId })
          .eq('id', clientCompanyId);

        if (companyLinkError) {
          console.error('❌ Failed to link reseller to company:', companyLinkError);
        }

        // B. Add Reseller as Team Member (Use effectiveClient/Admin)
        if (resellerUserId && resellerEmail) {
          console.log('👥 Adding reseller to team members:', resellerEmail);
          let { error: memberError } = await effectiveClient
            .from('account_members')
            .upsert({
              account_id: clientCompanyId,
              user_id: resellerUserId,
              email: resellerEmail.toLowerCase(),
              role: 'MANAGER',
              status: 'accepted',
              accepted_at: new Date().toISOString(),
              invited_at: new Date().toISOString(),
            }, {
              onConflict: 'account_id,email',
              ignoreDuplicates: false
            });

          // Fallback: If 400 (likely missing constraint), try user_id constraint
          if (memberError && (memberError.code === '400' || (memberError as any).status === 400)) {
            console.warn('⚠️ account_id+email constraint missing, retrying with user_id...');
            const { error: fallbackError } = await effectiveClient
              .from('account_members')
              .upsert({
                account_id: clientCompanyId,
                user_id: resellerUserId,
                role: 'MANAGER',
                status: 'accepted',
                accepted_at: new Date().toISOString(),
                invited_at: new Date().toISOString(),
              }, {
                onConflict: 'account_id,user_id',
                ignoreDuplicates: false
              });
            memberError = fallbackError;
          }

          if (memberError) {
            console.error('❌ Failed to add reseller as team member:', memberError);
          }
        }

        // C. Ensure reseller_clients record exists (Client cannot do this normally)
        await effectiveClient.from('reseller_clients').upsert({
          reseller_id: rId,
          client_company_id: clientCompanyId,
          status: 'ACTIVE',
          access_level: 'FULL'
        }, { onConflict: 'reseller_id,client_company_id' });
      }

      // 4. Mark invite as accepted
      await effectiveClient.from('reseller_invites').update({
        status: 'ACCEPTED',
        accepted_at: new Date().toISOString()
      }).eq('invite_token', token);

      return true;
    } catch (e) {
      console.error('Exception in acceptResellerInvite:', e);
      return false;
    }
  },

  // Sync all companies where this user is a member into their reseller portfolio
  syncResellerPortfolio: async (resellerUserId: string): Promise<{ success: boolean; syncedCount: number; error?: string }> => {
    if (!supabase) return { success: false, syncedCount: 0, error: 'Supabase not available' };

    try {
      console.log('🔄 Syncing reseller portfolio for user:', resellerUserId);
      const adminClient = await supabaseService.getAdminClient();
      if (!adminClient) return { success: false, syncedCount: 0, error: 'Admin client not available' };

      // 1. Get user's role and company_id
      const { data: userData } = await adminClient.from('app_users').select('role, company_id').eq('id', resellerUserId).maybeSingle();

      if (!userData || (userData.role !== 'RESELLER' && userData.role !== 'Reseller')) {
        return { success: false, syncedCount: 0, error: 'User is not a Reseller' };
      }

      if (!userData.company_id) {
        return { success: false, syncedCount: 0, error: 'User has no Reseller Company ID' };
      }

      const resellerCompanyId = userData.company_id;

      // 2. Find all companies where this user is an accepted member
      const { data: memberships, error: memError } = await adminClient
        .from('account_members')
        .select('account_id')
        .eq('user_id', resellerUserId)
        .eq('status', 'accepted');

      if (memError) throw memError;
      if (!memberships || memberships.length === 0) {
        return { success: true, syncedCount: 0 };
      }

      let syncedCount = 0;
      for (const mem of memberships) {
        // Skip syncing the Reseller's own company to their client portfolio
        if (mem.account_id === resellerCompanyId) continue;

        // 3. Create/Update link in reseller_clients
        const { error: linkError } = await adminClient.from('reseller_clients').upsert({
          reseller_id: resellerCompanyId,
          client_company_id: mem.account_id,
          status: 'ACTIVE',
          access_level: 'FULL'
        }, { onConflict: 'reseller_id,client_company_id' });

        if (!linkError) {
          // 4. Update company's reseller_id
          await adminClient.from('companies').update({
            reseller_id: resellerCompanyId
          }).eq('id', mem.account_id);

          syncedCount++;
        }
      }

      console.log(`✅ Synced ${syncedCount} companies to portfolio`);
      return { success: true, syncedCount };

    } catch (error: any) {
      console.error('Error syncing reseller portfolio:', error);
      return { success: false, syncedCount: 0, error: error.message };
    }
  },

  // NEW: Robust Join Team function for Resellers to manually sync their access
  joinClientTeam: async (clientCompanyId: string, resellerUserId: string, resellerEmail: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      console.log('🔗 Reseller requesting to join client team:', { clientCompanyId, resellerUserId, resellerEmail });

      const adminClient = await supabaseService.getAdminClient();
      if (!adminClient) {
        console.error('❌ Admin client not available for joinClientTeam');
        return false;
      }

      // Add Reseller as Team Member (Admin bypasses RLS)
      let { error: memberError } = await adminClient.from('account_members').upsert({
        account_id: clientCompanyId,
        user_id: resellerUserId,
        email: resellerEmail.toLowerCase(),
        role: 'MANAGER',
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        invited_at: new Date().toISOString(),
      }, {
        onConflict: 'account_id,email',
        ignoreDuplicates: false
      });

      // Fallback: If 400 (likely missing constraint), try user_id constraint
      if (memberError && (memberError.code === '400' || (memberError as any).status === 400)) {
        console.warn('⚠️ account_id+email constraint missing, retrying with user_id...');
        const { error: fallbackError } = await adminClient.from('account_members').upsert({
          account_id: clientCompanyId,
          user_id: resellerUserId,
          role: 'MANAGER',
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          invited_at: new Date().toISOString(),
        }, {
          onConflict: 'account_id,user_id',
          ignoreDuplicates: false
        });
        memberError = fallbackError;
      }

      if (memberError) {
        console.error('❌ Failed to add reseller as team member via admin:', memberError);
        return false;
      }

      // Ensure the company is linked to the reseller in the companies table too
      // First find the reseller's company ID
      const { data: userData } = await adminClient.from('app_users').select('company_id').eq('id', resellerUserId).maybeSingle();
      if (userData?.company_id) {
        await adminClient.from('companies').update({
          reseller_id: userData.company_id
        }).eq('id', clientCompanyId);

        await adminClient.from('reseller_clients').upsert({
          reseller_id: userData.company_id,
          client_company_id: clientCompanyId,
          status: 'ACTIVE',
          access_level: 'FULL'
        }, { onConflict: 'reseller_id,client_company_id' });
      }

      return true;
    } catch (e) {
      console.error('Exception in joinClientTeam:', e);
      return false;
    }
  },

  // Create or update reseller-client relationship
  saveResellerClient: async (resellerId: string, clientCompanyId: string, data?: {
    status?: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED' | 'PENDING';
    accessLevel?: 'VIEW_ONLY' | 'MANAGE' | 'FULL';
    monthlyBaseFee?: number;
    perEmployeeFee?: number;
    discountRate?: number;
  }): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { error } = await supabase
        .from('reseller_clients')
        .upsert({
          reseller_id: resellerId,
          client_company_id: clientCompanyId,
          status: data?.status || 'ACTIVE',
          access_level: data?.accessLevel || 'FULL',
          monthly_base_fee: data?.monthlyBaseFee || 3000.00,
          per_employee_fee: data?.perEmployeeFee || 100.00,
          discount_rate: data?.discountRate || 0.00,
          relationship_start_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'reseller_id,client_company_id'
        });

      if (error) {
        console.error("Error saving reseller-client relationship:", error);
        return false;
      }

      // Also update the company's reseller_id field
      const { error: updateError } = await supabase
        .from('companies')
        .update({ reseller_id: resellerId })
        .eq('id', clientCompanyId);

      if (updateError) {
        console.error("Error updating company reseller_id:", updateError);
        // Don't fail the whole operation if this fails
      }

      return true;
    } catch (e) {
      console.error("Error saving reseller-client relationship:", e);
      return false;
    }
  },

  // Securely link an existing company to a reseller portfolio
  linkResellerToExistingCompany: async (clientEmail: string, resellerCompanyId: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      console.log(`🔗 Linking client ${clientEmail} to reseller ${resellerCompanyId} via secure RPC...`);
      const { data, error } = await supabase.rpc('link_reseller_client_secure', {
        p_client_email: clientEmail.toLowerCase(),
        p_reseller_company_id: resellerCompanyId
      });

      if (error) {
        console.error('RPC Error linking client:', error);
        return false;
      }

      if (data === true) {
        console.log('✅ Securely linked client to reseller portfolio and added as team member');
        return true;
      }

      return false;
    } catch (e) {
      console.error('Exception in linkResellerToExistingCompany:', e);
      return false;
    }
  },

  // Save reseller client with service role (bypasses RLS)
  saveResellerClientWithServiceRole: async (resellerId: string, clientCompanyId: string, data?: {
    status?: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
    accessLevel?: 'VIEW_ONLY' | 'MANAGE' | 'FULL';
    monthlyBaseFee?: number;
    perEmployeeFee?: number;
    discountRate?: number;
  }): Promise<boolean> => {
    // Try with service role key if available
    const serviceRoleKey = import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || localStorage.getItem('VITE_SUPABASE_URL');

    if (serviceRoleKey && supabaseUrl) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        });

        const { error } = await adminClient
          .from('reseller_clients')
          .upsert({
            reseller_id: resellerId,
            client_company_id: clientCompanyId,
            status: data?.status || 'ACTIVE',
            access_level: data?.accessLevel || 'FULL',
            monthly_base_fee: data?.monthlyBaseFee || 3000.00,
            per_employee_fee: data?.perEmployeeFee || 100.00,
            discount_rate: data?.discountRate || 0.00,
            relationship_start_date: new Date().toISOString().split('T')[0],
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'reseller_id,client_company_id'
          });

        if (error) {
          console.error("Error saving reseller-client relationship (service role):", error);
          return false;
        }

        // Also update the company's reseller_id field
        const { error: updateError } = await adminClient
          .from('companies')
          .update({ reseller_id: resellerId })
          .eq('id', clientCompanyId);

        if (updateError) {
          console.error("Error updating company reseller_id:", updateError);
          // Don't fail the whole operation if this fails
        }

        return true;
      } catch (e) {
        console.error("Error with service role client:", e);
        // Fall through to regular client
      }
    }

    // Fallback to regular client (may fail due to RLS)
    return await supabaseService.saveResellerClient(resellerId, clientCompanyId, data);
  },

  // Cancel a reseller invite
  cancelResellerInvite: async (inviteId: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      // Try secure RPC first (bypasses RLS while validating ownership)
      const { data: rpcResult, error: rpcError } = await supabase.rpc('cancel_reseller_invite_secure', {
        p_invite_id: inviteId
      });

      if (!rpcError && rpcResult === true) {
        return true;
      }

      if (rpcError) {
        console.warn('RPC cancel failed, falling back to direct delete...', rpcError);
      }

      const { error } = await supabase
        .from('reseller_invites')
        .delete()
        .eq('id', inviteId);

      if (error) {
        console.error('Error canceling reseller invite:', error);
        return false;
      }

      return true;
    } catch (e) {
      console.error('Exception in cancelResellerInvite:', e);
      return false;
    }
  },

  removeResellerClient: async (resellerId: string, clientCompanyId: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('remove_reseller_client_secure', {
        p_reseller_id: resellerId,
        p_client_company_id: clientCompanyId
      });

      if (!rpcError && rpcResult === true) {
        return true;
      }

      if (rpcError) {
        console.warn('RPC remove_reseller_client_secure failed, attempting direct delete...', rpcError);
      }

      const { error } = await supabase
        .from('reseller_clients')
        .delete()
        .eq('reseller_id', resellerId)
        .eq('client_company_id', clientCompanyId);

      if (error) {
        console.error('Error deleting reseller client relationship:', error);
        return false;
      }

      const { error: companyUpdateError } = await supabase
        .from('companies')
        .update({ reseller_id: null })
        .eq('id', clientCompanyId)
        .eq('reseller_id', resellerId);

      if (companyUpdateError) {
        console.warn('Warning: company reseller_id reset failed:', companyUpdateError);
      }

      return true;
    } catch (e) {
      console.error('Exception in removeResellerClient:', e);
      return false;
    }
  },

  // Get reseller clients
  getResellerClients: async (resellerId: string): Promise<ResellerClient[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('reseller_clients')
        .select(`
          *,
          client_company:companies!reseller_clients_client_company_id_fkey (
            id,
            name,
            email,
            plan,
            status,
            settings,
            employees(count)
          )
        `)
        .eq('reseller_id', resellerId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching reseller clients:", error);
        return [];
      }

      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data.map((rc: any) => {
        const company = rc.client_company;
        return {
          id: company?.id || rc.client_company_id,
          companyName: company?.name || 'Unknown Company',
          contactName: company?.email || '',
          email: company?.email || '',
          plan: company?.plan || 'Free',
          employeeCount: company?.employees?.[0]?.count || company?.settings?.employeeCount || 0,
          status: rc.status || 'ACTIVE',
          mrr: (rc.monthly_base_fee || 0) + ((rc.per_employee_fee || 0) * (company?.settings?.employeeCount || 0)),
          createdAt: rc.created_at
        };
      });
    } catch (e) {
      console.error("Error fetching reseller clients:", e);
      return [];
    }
  },

  // Get companies with pending payment approval (Direct Deposit or Reseller Billing)
  getPendingPaymentCompanies: async (): Promise<any[]> => {
    try {
      const adminClient = await supabaseService.getAdminClient();
      if (!adminClient) {
        console.error('Admin client not available for getPendingPaymentCompanies');
        return [];
      }

      // Get companies that have "PENDING_APPROVAL" status (those who chose direct deposit/reseller billing)
      const { data, error } = await adminClient
        .from('companies')
        .select(`
          id,
          name,
          email,
          plan,
          status,
          created_at,
          owner:app_users!companies_owner_id_fkey (
            name,
            email
          )
        `)
        .in('status', ['PENDING_PAYMENT', 'PENDING_APPROVAL'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching pending payment companies:', error);
        return [];
      }

      return (data || []).map((company: any) => ({
        id: company.id,
        name: company.name,
        email: company.email,
        plan: company.plan,
        status: company.status,
        created_at: company.created_at,
        owner_name: company.owner?.[0]?.name || company.owner?.name,
        owner_email: company.owner?.[0]?.email || company.owner?.email,
        monthly_fee: 5000 // TODO: Calculate based on plan
      }));
    } catch (e) {
      console.error('Exception in getPendingPaymentCompanies:', e);
      return [];
    }
  },

  // Approve a company's payment and activate their account
  approveCompanyPayment: async (companyId: string): Promise<boolean> => {
    try {
      const adminClient = await supabaseService.getAdminClient();
      if (!adminClient) {
        console.error('Admin client not available for approveCompanyPayment');
        return false;
      }

      // Update company status to ACTIVE
      const { error } = await adminClient
        .from('companies')
        .update({ status: 'ACTIVE' })
        .eq('id', companyId);

      if (error) {
        console.error('Error approving company payment:', error);
        return false;
      }

      return true;
    } catch (e) {
      console.error('Exception in approveCompanyPayment:', e);
      return false;
    }
  },

  // Get compliance overview for reseller clients
  getComplianceOverview: async (resellerId: string): Promise<Record<string, any>> => {
    if (!supabase) return {};
    try {
      // 1. Get all client IDs
      const { data: clients } = await supabase
        .from('reseller_clients')
        .select('client_company_id')
        .eq('reseller_id', resellerId);

      if (!clients || clients.length === 0) return {};
      const clientIds = clients.map((c: any) => c.client_company_id);

      // 2. Get latest finalized pay run for each client
      // Fetch finalized runs for the last 3 months for these clients.
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const { data: runs, error } = await supabase
        .from('pay_runs')
        .select('company_id, period_end, status, pay_date')
        .in('company_id', clientIds)
        .eq('status', 'FINALIZED')
        .gte('period_end', threeMonthsAgo.toISOString().split('T')[0])
        .order('period_end', { ascending: false });

      if (error) {
        console.error('Error fetching compliance runs:', error);
        return {};
      }

      // 3. Process into map (keeping only the most recent one per company)
      const overview: Record<string, any> = {};

      if (runs) {
        runs.forEach((run: any) => {
          if (!overview[run.company_id]) {
            overview[run.company_id] = {
              lastPayRunDate: run.pay_date || run.period_end,
              periodEnd: run.period_end,
              status: 'FILED'
            };
          }
        });
      }

      return overview;

    } catch (e) {
      console.error("Error fetching compliance overview:", e);
      return {};
    }
  }
};