import { supabase } from './supabaseClient';
import { EmployeeService } from './EmployeeService';
import { CompanyService } from './CompanyService';
import { BillingService } from './BillingService';
import { ResellerService } from './ResellerService';
import { AuditLogEntry, ResellerClient, User, DbAppUserRow, DbCompanyRow, DbAuditLogRow, toRole, toPlanLabel } from '../core/types';
import { normalizePlanToFrontend } from '../utils/planNames';

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const mapResellerClient = (row: Record<string, unknown>): ResellerClient => {
	const company = (row.client_company || row.client_company_id || row.companies || row.company || {}) as Record<string, unknown>;
	const companySettings = (company?.settings || {}) as Record<string, unknown>;
	const employees = company?.employees as Array<{ count?: number }> | undefined;
	return {
		id: (company?.id as string) || (row.client_company_id as string),
		companyName: (company?.name as string) || (company?.companyName as string) || 'Unknown Company',
		contactName: (company?.email as string) || (row.contact_name as string) || '',
		email: (company?.email as string) || (row.email as string) || '',
		plan: toPlanLabel(normalizePlanToFrontend((company?.plan as string) || (row.plan as string) || 'Free')),
		employeeCount: employees?.[0]?.count || (companySettings?.employeeCount as number) || (row.employeeCount as number) || 0,
		status: (row.status as ResellerClient['status']) || (company?.status as ResellerClient['status']) || 'ACTIVE',
		mrr: ((row.monthly_base_fee as number) || 0) + (((row.per_employee_fee as number) || 0) * ((companySettings?.employeeCount as number) || (row.employeeCount as number) || 0)),
		createdAt: row.created_at as string,
	};
};

/**
 * Backward-compatible façade composed from focused services.
 *
 * Legacy callers may continue importing `supabaseService`, but the underlying
 * 3k-line monolith has been retired. New code should still prefer direct,
 * single-purpose service imports.
 */
export const supabaseService = {
	getUserByEmail: EmployeeService.getUserByEmail,
	saveUser: EmployeeService.saveUser,
	getCompanyUsers: EmployeeService.getCompanyUsers,
	saveCompany: CompanyService.saveCompany,
	getCompanyById: CompanyService.getCompanyById,
	getGlobalConfig: CompanyService.getGlobalConfig,
	saveGlobalConfig: CompanyService.saveGlobalConfig,
	getPaymentGatewaySettings: CompanyService.getPaymentGatewaySettings,
	getPaymentHistory: BillingService.getPaymentHistory,
	getAllSubscriptions: BillingService.getAllSubscriptions,
	getAllPayments: BillingService.getAllPayments,

	savePaymentGatewaySettings: async (companyId: string, paymentConfig: any) => {
		if (!supabase) return;
		const { data: company, error: fetchError } = await supabase
			.from('companies')
			.select('settings')
			.eq('id', companyId)
			.single();

		if (fetchError) {
			console.error('Error fetching company for payment settings:', fetchError);
			return;
		}

		const { error } = await supabase
			.from('companies')
			.update({
				settings: {
					...(company?.settings || {}),
					paymentGateway: paymentConfig,
				},
			})
			.eq('id', companyId);

		if (error) {
			console.error('Error saving payment gateway settings:', error);
		}
	},

	getAllCompanies: async (): Promise<ResellerClient[]> => {
		if (!supabase) return [];
		const { data, error } = await supabase.from('companies').select('*');
		if (error || !data) {
			console.error('Error fetching companies:', error);
			return [];
		}

		return data.map((company: DbCompanyRow) => {
		const settings = (company.settings || {}) as Record<string, unknown>;
		return {
		id: company.id,
		companyName: company.name,
		contactName: (settings.contactName as string) || 'Admin',
		email: (settings.email as string) || '',
		employeeCount: (settings.employeeCount as number) || 0,
		plan: toPlanLabel(normalizePlanToFrontend(company.plan || 'Free')),
		status: (company.status || 'ACTIVE') as ResellerClient['status'],
		mrr: (settings.mrr as number) || 0,
	};
	});
	},

	updateCompanyStatus: async (companyId: string, status: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'PENDING_PAYMENT') => {
		if (!supabase) return;
		const { error } = await supabase.from('companies').update({ status }).eq('id', companyId);
		if (error) throw error;
	},

	deleteCompany: async (companyId: string) => {
		if (!supabase) return false;
		const { error } = await supabase.from('companies').delete().eq('id', companyId);
		if (error) {
			console.error('Error deleting company:', error);
			return false;
		}
		return true;
	},

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

	saveAuditLog: async (log: AuditLogEntry, companyId: string | null) => {
		if (!supabase) return;

		const payload: Record<string, string | undefined> = {
		id: log.id,
		actor_name: log.actorName,
		action: log.action,
		entity: log.entity,
		description: log.description,
		timestamp: log.timestamp,
		ip_address: log.ipAddress,
	};

		if (companyId && isUuid(companyId)) payload.company_id = companyId;
		if (log.actorId && isUuid(log.actorId)) payload.actor_id = log.actorId;

		const { error } = await supabase.from('audit_logs').insert(payload);
		if (error) {
			console.error('Failed to save audit log:', error);
		}
	},

	getAuditLogs: async (companyId: string | null, userRole?: string, userId?: string): Promise<AuditLogEntry[]> => {
		if (!supabase) return [];

		let query = supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(500);
		const isCompanyAdmin = ['OWNER', 'ADMIN', 'RESELLER'].includes(userRole || '');

		if (userRole === 'SUPER_ADMIN') {
			if (companyId) query = query.eq('company_id', companyId);
		} else {
			if (!companyId) return [];
			query = query.eq('company_id', companyId);
			if (!isCompanyAdmin) {
				if (!userId) return [];
				query = query.eq('actor_id', userId);
			}
		}

		const { data, error } = await query;
		if (error || !data) {
			console.error('Error fetching audit logs:', error);
			return [];
		}

		return data.map((log: DbAuditLogRow) => ({
		id: log.id,
		timestamp: log.timestamp,
		actorId: log.actor_id || '',
		actorName: log.actor_name,
		action: log.action as AuditLogEntry['action'],
		entity: log.entity,
		description: log.description,
		ipAddress: log.ip_address,
	}));
	},

	saveResellerInvite: async (
		resellerId: string,
		clientEmail: string,
		inviteToken?: string,
		contactName?: string,
		companyName?: string,
	) => {
		if (!supabase) return false;

		const payload: Record<string, any> = {
			reseller_id: resellerId,
			invite_email: clientEmail.toLowerCase(),
			client_email: clientEmail.toLowerCase(),
			invite_token: inviteToken || null,
			contact_name: contactName || null,
			company_name: companyName || null,
			status: 'PENDING',
		};

		const { error } = await supabase
			.from('reseller_invites')
			.upsert(payload, { onConflict: 'reseller_id,invite_email' });

		if (!error) return true;

		console.warn('Primary reseller invite upsert failed, retrying with fallback columns:', error);
		return ResellerService.saveResellerInvite(resellerId, clientEmail, companyName);
	},

	cancelResellerInvite: async (inviteId: string) => {
		if (!supabase) return false;
		try {
			const { data: rpcResult, error: rpcError } = await supabase.rpc('cancel_reseller_invite_secure', {
				p_invite_id: inviteId,
			});

			if (!rpcError && rpcResult === true) {
				return true;
			}

			const { error } = await supabase.from('reseller_invites').delete().eq('id', inviteId);
			if (error) {
				console.error('Error canceling reseller invite:', error);
				return false;
			}

			return true;
		} catch (error) {
			console.error('Exception in cancelResellerInvite:', error);
			return false;
		}
	},

	saveResellerClientWithServiceRole: ResellerService.saveResellerClientWithServiceRole,

	removeResellerClient: async (resellerId: string, clientCompanyId: string) => {
		if (!supabase) return false;
		try {
			const { data: rpcResult, error: rpcError } = await supabase.rpc('remove_reseller_client_secure', {
				p_reseller_id: resellerId,
				p_client_company_id: clientCompanyId,
			});

			if (!rpcError && rpcResult === true) {
				return true;
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

			await supabase.from('companies').update({ reseller_id: null }).eq('id', clientCompanyId).eq('reseller_id', resellerId);
			return true;
		} catch (error) {
			console.error('Exception in removeResellerClient:', error);
			return false;
		}
	},

	getResellerInvites: async (resellerId: string) => {
		if (!supabase) return [];
		const { data, error } = await supabase
			.from('reseller_invites')
			.select('*')
			.eq('reseller_id', resellerId)
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error fetching reseller invites:', error);
			return [];
		}

		return data || [];
	},

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

			if (error || !data) {
				console.error('Error fetching reseller clients:', error);
				return [];
			}

			return data.map(mapResellerClient);
		} catch (error) {
			console.error('Error fetching reseller clients:', error);
			return [];
		}
	},

	getComplianceOverview: async (resellerId: string): Promise<Record<string, { lastPayRunDate: string; periodEnd: string; status: string }>> => {
		if (!supabase) return {};

		try {
			const { data: clients } = await supabase
				.from('reseller_clients')
				.select('client_company_id')
				.eq('reseller_id', resellerId);

			if (!clients?.length) return {};

			const clientIds = clients.map((client: { client_company_id: string }) => client.client_company_id);
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

			const overview: Record<string, { lastPayRunDate: string; periodEnd: string; status: string }> = {};
			(runs || []).forEach((run: { company_id: string; pay_date?: string; period_end: string }) => {
				if (!overview[run.company_id]) {
					overview[run.company_id] = {
						lastPayRunDate: run.pay_date || run.period_end,
						periodEnd: run.period_end,
						status: 'FILED',
					};
				}
			});

			return overview;
		} catch (error) {
			console.error('Error fetching compliance overview:', error);
			return {};
		}
	},
};

export { EmployeeService } from './EmployeeService';
export { CompanyService } from './CompanyService';
export { PayrollService } from './PayrollService';
export { BillingService } from './BillingService';
export { ResellerService } from './ResellerService';
