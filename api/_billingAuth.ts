import type { VercelRequest } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';

const BILLING_ROLES = new Set(['OWNER', 'ADMIN', 'RESELLER', 'SUPER_ADMIN']);

export const requireBillingAccess = async (req: VercelRequest, companyId: string) => {
  const header = req.headers.authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : '';
  if (!token) throw new Error('Unauthorized');

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) throw new Error('Unauthorized');
  const authUser = authData.user;
  const email = String(authUser.email || '').trim().toLowerCase();

  let { data: profile, error: profileError } = await supabaseAdmin
    .from('app_users')
    .select('id, company_id, role, email')
    .eq('id', authUser.id)
    .maybeSingle();
  if (profileError) throw profileError;

  if (!profile && email) {
    const { data: profiles, error } = await supabaseAdmin
      .from('app_users')
      .select('id, company_id, role, email')
      .ilike('email', email)
      .limit(2);
    if (error) throw error;
    if (!profiles || profiles.length !== 1) throw new Error('Unauthorized');
    profile = profiles[0];
  }
  if (!profile || !BILLING_ROLES.has(String(profile.role || '').toUpperCase())) throw new Error('Unauthorized');
  if (String(profile.role).toUpperCase() === 'SUPER_ADMIN') return profile;
  if (profile.company_id === companyId) return profile;

  const [{ data: member, error: memberError }, { data: company, error: companyError }] = await Promise.all([
    supabaseAdmin.from('account_members').select('account_id').eq('account_id', companyId).eq('user_id', profile.id).eq('status', 'accepted').maybeSingle(),
    supabaseAdmin.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
  ]);
  if (memberError || companyError) throw memberError || companyError;
  if (member || company?.owner_id === profile.id || company?.owner_id === authUser.id) return profile;
  throw new Error('Unauthorized');
};
