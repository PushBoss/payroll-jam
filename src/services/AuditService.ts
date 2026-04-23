import { supabase } from './supabaseClient';
import { AuditLogEntry, DbAuditLogRow } from '../core/types';

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const AuditService = {
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
      throw error;
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
};