
import { storage } from '../services/storage';
import { User, AuditLogEntry } from './types';
import { generateUUID } from '../utils/uuid';
import { supabaseService } from '../services/supabaseService';

export const auditService = {
  log: (
    user: User | null | undefined,
    action: AuditLogEntry['action'],
    entity: string,
    description: string
  ) => {
    if (!user) return;

    const newLog: AuditLogEntry = {
      id: generateUUID(),
      timestamp: new Date().toISOString(),
      actorId: user.id,
      actorName: user.name,
      action,
      entity,
      description,
      ipAddress: '192.168.1.1' // Mocked since we are client-side
    };

    // Save to Supabase (non-blocking)
    // Save to Supabase if companyId exists OR if user is SUPER_ADMIN (global logs)
    if (user.companyId || user.role === 'SUPER_ADMIN') {
      supabaseService.saveAuditLog(newLog, user.companyId || null).catch((error: unknown) => {
        console.error('Failed to save audit log to Supabase:', error);
        // Fallback to localStorage if Supabase fails
        const logs = storage.getAuditLogs() || [];
        const updatedLogs = [newLog, ...logs].slice(0, 500);
        storage.saveAuditLogs(updatedLogs);
      });
    } else {
      // Fallback to localStorage if no companyId
      const logs = storage.getAuditLogs() || [];
      const updatedLogs = [newLog, ...logs].slice(0, 500);
      storage.saveAuditLogs(updatedLogs);
    }
  },

  getLogs: async (companyId: string | null, userRole?: string, userId?: string): Promise<AuditLogEntry[]> => {
    // Try to get from Supabase first
    try {
      const logs = await supabaseService.getAuditLogs(companyId, userRole, userId);
      if (logs && logs.length > 0) {
        return logs;
      }
    } catch (error) {
      console.error('Failed to fetch audit logs from Supabase:', error);
    }

    // Fallback to localStorage (for backward compatibility)
    return storage.getAuditLogs() || [];
  },

  clearLogs: () => {
    storage.saveAuditLogs([]);
  }
};
