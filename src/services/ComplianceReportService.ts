import { supabase } from './supabaseClient';

export type ComplianceReportType = 'S01' | 'S02';

export interface ComplianceReportArchiveItem {
  id: string;
  companyId: string;
  reportType: ComplianceReportType;
  reportingPeriod: string;
  originalFilename: string;
  recordCount: number;
  createdAt: string;
}

const invoke = async <T,>(action: string, payload: Record<string, unknown>): Promise<T> => {
  if (!supabase) throw new Error('Supabase client is not configured.');
  const { data, error } = await supabase.functions.invoke('admin-handler', { body: { action, payload } });
  if (error) throw error;
  return data as T;
};

export const ComplianceReportService = {
  list: async (companyId: string): Promise<ComplianceReportArchiveItem[]> => {
    const result = await invoke<{ reports?: any[] }>('get-compliance-reports', { companyId });
    return (result.reports || []).map((report) => ({
      id: String(report.id),
      companyId: String(report.company_id),
      reportType: report.report_type as ComplianceReportType,
      reportingPeriod: String(report.reporting_period),
      originalFilename: String(report.original_filename),
      recordCount: Number(report.record_count || 0),
      createdAt: String(report.created_at),
    }));
  },

  save: async (input: {
    companyId: string;
    reportType: ComplianceReportType;
    reportingPeriod: string;
    originalFilename: string;
    records: Record<string, unknown>[];
  }) => invoke('save-compliance-report', input),
};
