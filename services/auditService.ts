
import { storage } from './storage';
import { User, AuditLogEntry } from '../types';
import { generateUUID } from '../utils/uuid';

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

    const logs = storage.getAuditLogs() || [];
    // Keep last 500 logs for performance
    const updatedLogs = [newLog, ...logs].slice(0, 500);
    storage.saveAuditLogs(updatedLogs);
  },

  getLogs: () => {
    return storage.getAuditLogs() || [];
  },
  
  clearLogs: () => {
    storage.saveAuditLogs([]);
  }
};