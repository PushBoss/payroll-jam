import { DocumentRequest } from '../core/types';
import { supabase } from './supabaseClient';

const mapDocumentRequestRow = (row: Record<string, any>): DocumentRequest => ({
  id: String(row.id || ''),
  companyId: row.company_id || row.companyId || undefined,
  employeeId: String(row.employee_id || row.employeeId || ''),
  employeeName: String(row.employee_name || row.employeeName || ''),
  templateId: String(row.template_id || row.templateId || ''),
  documentType: String(row.document_type || row.documentType || ''),
  purpose: String(row.purpose || ''),
  status: (row.status || 'PENDING') as DocumentRequest['status'],
  requestedAt: String(row.requested_at || row.requestedAt || ''),
  reviewedBy: row.reviewed_by || row.reviewedBy || undefined,
  reviewedAt: row.reviewed_at || row.reviewedAt || undefined,
  rejectionReason: row.rejection_reason || row.rejectionReason || undefined,
  generatedContent: row.generated_content || row.generatedContent || undefined,
  fileUrl: row.file_url || row.fileUrl || undefined,
});

const toDocumentRequestPayload = (request: DocumentRequest, companyId: string) => ({
  id: request.id,
  company_id: companyId,
  employee_id: request.employeeId,
  employee_name: request.employeeName,
  template_id: request.templateId,
  document_type: request.documentType,
  purpose: request.purpose,
  status: request.status,
  requested_at: request.requestedAt,
  reviewed_by: request.reviewedBy || null,
  reviewed_at: request.reviewedAt || null,
  rejection_reason: request.rejectionReason || null,
  generated_content: request.generatedContent || null,
  file_url: request.fileUrl || null,
});

export const DocumentService = {
  getDocumentRequests: async (companyId: string): Promise<DocumentRequest[]> => {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('document_requests')
      .select('*')
      .eq('company_id', companyId)
      .order('requested_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapDocumentRequestRow);
  },

  saveDocumentRequest: async (request: DocumentRequest, companyId: string): Promise<DocumentRequest> => {
    if (!supabase) return request;

    const { data, error } = await supabase
      .from('document_requests')
      .upsert(toDocumentRequestPayload(request, companyId))
      .select('*')
      .single();

    if (error) throw error;
    return mapDocumentRequestRow(data || request);
  },
};
