import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const validTaxConfigEntries = (config?: Partial<TaxConfig> | null): Partial<TaxConfig> => (
  config
    ? Object.fromEntries(
      Object.entries(config).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
    ) as Partial<TaxConfig>
    : {}
);

export const useCompanyConfigData = () => {
  const hasSupabaseEnv = Boolean(import.meta.env?.VITE_SUPABASE_URL && import.meta.env?.VITE_SUPABASE_ANON_KEY);
  const cachedGlobalConfig = storage.getGlobalConfig();

  // Initialise globalConfig: if Supabase env is present, stamp dataSource immediately so no
  // extra render is needed to fix it up after mount.
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(() => {
    const cached = cachedGlobalConfig;
    if (hasSupabaseEnv && cached && cached.dataSource !== 'SUPABASE') {
      const stamped = { ...cached, dataSource: 'SUPABASE' } as GlobalConfig;
      storage.saveGlobalConfig(stamped);
      return stamped;
    }
    if (hasSupabaseEnv && !cached) {
      const fresh = { dataSource: 'SUPABASE' } as GlobalConfig;
      storage.saveGlobalConfig(fresh);
      return fresh;
    }
    return cached;
  });

  const [companyData, setCompanyData] = useState<CompanySettings | null>(() => storage.getCompanyData());
  const [taxConfig, setTaxConfig] = useState<TaxConfig>(() => ({
    ...DEFAULT_TAX_CONFIG,
    ...validTaxConfigEntries(cachedGlobalConfig?.taxConfig),
    ...validTaxConfigEntries(storage.getTaxConfig()),
  }));
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfig>(
    () => storage.getIntegrationConfig() || { provider: 'CSV', mappings: [] }
  );
  const [templates, setTemplates] = useState<DocumentTemplate[]>(() => storage.getTemplates() || []);
  const [plans, setPlans] = useState<PricingPlan[]>(() => storage.getPricingPlans() || INITIAL_PLANS);
  const [departments, setDepartments] = useState<Department[]>(() => storage.getDepartments() || []);
  const [designations, setDesignations] = useState<Designation[]>(() => storage.getDesignations() || []);

  const isSupabaseMode = useMemo(() => {
    if (hasSupabaseEnv) return true;
    return globalConfig?.dataSource === 'SUPABASE';
  }, [globalConfig?.dataSource, hasSupabaseEnv]);

  const globalDefaultTaxConfig = useMemo(() => ({
    ...DEFAULT_TAX_CONFIG,
    ...validTaxConfigEntries(globalConfig?.taxConfig),
  }), [globalConfig?.taxConfig]);

  // Mount guards: skip first effect fire so we never write back data we just read from localStorage
  const didMountTax = useRef(false);
  const didMountIntegration = useRef(false);
  const didMountTemplates = useRef(false);
  const didMountDepts = useRef(false);
  const didMountDesigs = useRef(false);

  useEffect(() => {
    if (!didMountTax.current) { didMountTax.current = true; return; }
    storage.saveTaxConfig(taxConfig);
  }, [taxConfig]);

  useEffect(() => {
    if (!companyData?.taxConfig) {
      setTaxConfig(globalDefaultTaxConfig);
    }
  }, [companyData?.taxConfig, globalDefaultTaxConfig]);

  useEffect(() => {
    if (!didMountIntegration.current) { didMountIntegration.current = true; return; }
    storage.saveIntegrationConfig(integrationConfig);
  }, [integrationConfig]);

  useEffect(() => {
    if (!didMountTemplates.current) { didMountTemplates.current = true; return; }
    storage.saveTemplates(templates);
  }, [templates]);

  useEffect(() => {
    if (!didMountDepts.current) { didMountDepts.current = true; return; }
    storage.saveDepartments(departments);
  }, [departments]);

  useEffect(() => {
    if (!didMountDesigs.current) { didMountDesigs.current = true; return; }
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
    // Merge DB config with defaults so every TaxConfig field has a valid number
    setTaxConfig({
      ...globalDefaultTaxConfig,
      ...validTaxConfigEntries(loadedCompany.taxConfig),
    });
    if (loadedCompany.departments) setDepartments(loadedCompany.departments);
    if (loadedCompany.designations) setDesignations(loadedCompany.designations);
    storage.saveCompanyData(loadedCompany);
  }, [globalDefaultTaxConfig]);

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
      departments: data.departments || departments,
      designations: data.designations || designations,
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
      const updated: CompanySettings = { ...companyData, departments: newDepartments };
      setCompanyData(updated);
      if (isSupabaseMode && companyId) {
        await CompanyService.saveCompany(companyId, updated);
      }
    }
  }, [companyData, isSupabaseMode]);

  const handleUpdateDesignations = useCallback(async (newDesignations: Designation[], companyId?: string) => {
    setDesignations(newDesignations);
    if (companyData) {
      const updated: CompanySettings = { ...companyData, designations: newDesignations };
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
