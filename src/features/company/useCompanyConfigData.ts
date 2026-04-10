import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CompanySettings,
  Department,
  Designation,
  DocumentTemplate,
  GlobalConfig,
  IntegrationConfig,
  PricingPlan,
  TaxConfig,
} from '../../core/types';
import { storage } from '../../services/storage';
import { updateGlobalConfig } from '../../services/updateGlobalConfig';
import { CompanyService } from '../../services/CompanyService';
import { INITIAL_PLANS } from '../../services/planService';
import { DEFAULT_TAX_CONFIG } from '../payroll/payrollConfig';

export const useCompanyConfigData = () => {
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(() => storage.getGlobalConfig());
  const [companyData, setCompanyData] = useState<CompanySettings | null>(storage.getCompanyData());
  const [taxConfig, setTaxConfig] = useState<TaxConfig>(storage.getTaxConfig() || DEFAULT_TAX_CONFIG);
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfig>(
    storage.getIntegrationConfig() || { provider: 'CSV', mappings: [] }
  );
  const [templates, setTemplates] = useState<DocumentTemplate[]>(storage.getTemplates() || []);
  const [plans, setPlans] = useState<PricingPlan[]>(() => storage.getPricingPlans() || INITIAL_PLANS);
  const [departments, setDepartments] = useState<Department[]>(storage.getDepartments() || []);
  const [designations, setDesignations] = useState<Designation[]>(storage.getDesignations() || []);

  const hasSupabaseEnv = Boolean(import.meta.env?.VITE_SUPABASE_URL && import.meta.env?.VITE_SUPABASE_ANON_KEY);

  useEffect(() => {
    if (!hasSupabaseEnv || globalConfig?.dataSource === 'SUPABASE') return;
    const updatedConfig = { ...(globalConfig || {}), dataSource: 'SUPABASE' } as GlobalConfig;
    storage.saveGlobalConfig(updatedConfig);
    setGlobalConfig(updatedConfig);
  }, [globalConfig, hasSupabaseEnv]);

  const isSupabaseMode = useMemo(() => {
    if (hasSupabaseEnv) return true;
    return globalConfig?.dataSource === 'SUPABASE';
  }, [globalConfig?.dataSource, hasSupabaseEnv]);

  useEffect(() => {
    storage.saveTaxConfig(taxConfig);
  }, [taxConfig]);

  useEffect(() => {
    storage.saveIntegrationConfig(integrationConfig);
  }, [integrationConfig]);

  useEffect(() => {
    storage.saveTemplates(templates);
  }, [templates]);

  useEffect(() => {
    storage.saveDepartments(departments);
  }, [departments]);

  useEffect(() => {
    storage.saveDesignations(designations);
  }, [designations]);

  useEffect(() => {
    async function loadPlansFromBackend() {
      if (!isSupabaseMode) {
        setPlans(INITIAL_PLANS);
        return;
      }

      try {
        const config = await CompanyService.getGlobalConfig();
        if (config) {
          setGlobalConfig(config);
          storage.saveGlobalConfig(config);
        }

        if (config?.pricingPlans && Array.isArray(config.pricingPlans) && config.pricingPlans.length > 0) {
          setPlans(config.pricingPlans);
          storage.savePricingPlans(config.pricingPlans);
          return;
        }

        setPlans(INITIAL_PLANS);
        storage.savePricingPlans(INITIAL_PLANS);
        await updateGlobalConfig({ pricingPlans: INITIAL_PLANS });
      } catch (error) {
        console.error('Failed to load plans from backend, using cache or defaults:', error);
        const cached = storage.getPricingPlans();
        setPlans(cached || INITIAL_PLANS);
      }
    }

    void loadPlansFromBackend();
  }, [isSupabaseMode]);

  const applyLoadedCompany = useCallback((loadedCompany: CompanySettings | null) => {
    if (!loadedCompany) return;

    setCompanyData(loadedCompany);
    if (loadedCompany.taxConfig) setTaxConfig(loadedCompany.taxConfig);
    if ((loadedCompany as any).departments) setDepartments((loadedCompany as any).departments);
    if ((loadedCompany as any).designations) setDesignations((loadedCompany as any).designations);
    storage.saveCompanyData(loadedCompany);
  }, []);

  const handleUpdatePlans = useCallback(async (updatedPlans: PricingPlan[]) => {
    setPlans(updatedPlans);
    storage.savePricingPlans(updatedPlans);

    if (isSupabaseMode) {
      try {
        await updateGlobalConfig({ pricingPlans: updatedPlans });
      } catch (error) {
        console.error('Failed to update plans in backend:', error);
        toast.error('Failed to save pricing plans');
      }
    }
  }, [isSupabaseMode]);

  const handleUpdateCompany = useCallback(async (data: CompanySettings, companyId?: string) => {
    const updatedData = {
      ...data,
      departments: (data as any).departments || departments,
      designations: (data as any).designations || designations,
    };

    setCompanyData(updatedData);
    storage.saveCompanyData(updatedData);
    if (isSupabaseMode && companyId) {
      await CompanyService.saveCompany(companyId, updatedData);
    }
  }, [departments, designations, isSupabaseMode]);

  const handleUpdateDepartments = useCallback(async (newDepartments: Department[], companyId?: string) => {
    setDepartments(newDepartments);
    if (companyData) {
      const updated = { ...companyData, departments: newDepartments } as any;
      setCompanyData(updated);
      if (isSupabaseMode && companyId) {
        await CompanyService.saveCompany(companyId, updated);
      }
    }
  }, [companyData, isSupabaseMode]);

  const handleUpdateDesignations = useCallback(async (newDesignations: Designation[], companyId?: string) => {
    setDesignations(newDesignations);
    if (companyData) {
      const updated = { ...companyData, designations: newDesignations } as any;
      setCompanyData(updated);
      if (isSupabaseMode && companyId) {
        await CompanyService.saveCompany(companyId, updated);
      }
    }
  }, [companyData, isSupabaseMode]);

  const handleUpdateTaxConfig = useCallback(async (newConfig: TaxConfig, companyId?: string) => {
    setTaxConfig(newConfig);
    if (companyData) {
      const updated = { ...companyData, taxConfig: newConfig };
      setCompanyData(updated);
      storage.saveCompanyData(updated);
      if (isSupabaseMode && companyId) {
        await CompanyService.saveCompany(companyId, updated);
        toast.success('Tax configuration updated');
      }
    }
  }, [companyData, isSupabaseMode]);

  return {
    globalConfig,
    setGlobalConfig,
    companyData,
    setCompanyData,
    taxConfig,
    integrationConfig,
    setIntegrationConfig,
    templates,
    setTemplates,
    plans,
    departments,
    designations,
    isSupabaseMode,
    applyLoadedCompany,
    handleUpdatePlans,
    handleUpdateCompany,
    handleUpdateDepartments,
    handleUpdateDesignations,
    handleUpdateTaxConfig,
  };
};