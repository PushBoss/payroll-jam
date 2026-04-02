import { TAX_CONSTANTS } from '../core/taxUtils';
import { supabaseService } from './supabaseService';
import { supabase } from './supabaseClient';



export interface PolicySet {
    nis_cap_annual?: number;
    paye_threshold?: number;
    shift_patterns?: any;
    holiday_observances?: any;
    [key: string]: any;
}

/**
 * Core Global Mandatory policies.
 * These are the hard-coded defaults that cannot be overridden by statutory rules
 * but serve as the baseline for the system.
 */
export const CORE_GLOBAL_POLICIES: PolicySet = {
    nis_cap_annual: TAX_CONSTANTS.NIS_CAP_ANNUAL,
    paye_threshold: TAX_CONSTANTS.PAYE_THRESHOLD,
};

/**
 * Resolution Strategy: "Most-Specific-Wins"
 * Priority: Local (Company) > Reseller > Global (Core)
 */
export const policyService = {
    /**
     * Resolves a policy key for a given company.
     * Walks up the hierarchy from Company -> Reseller -> Global.
     */
    resolvePolicy: async (companyId: string, policyKey: string): Promise<any> => {
        // 1. Check Local (Company) Overrides
        const company = await supabaseService.getCompanyById(companyId);
        if (company && company.policies && company.policies[policyKey] !== undefined) {
            console.log(`🎯 Policy [${policyKey}] resolved from Local: ${company.policies[policyKey]}`);
            return company.policies[policyKey];
        }

        // 2. Check Reseller Defaults
        let resellerId = company?.resellerId;
        if (!resellerId) {
            // Fallback: try to find reseller_id if not in the cached company object
            if (supabase) {
                const { data: rawCompany } = await supabase
                    .from('companies')
                    .select('reseller_id')
                    .eq('id', companyId)
                    .maybeSingle();

                if (rawCompany?.reseller_id) {
                    resellerId = rawCompany.reseller_id;
                }
            }
        }

        if (resellerId) {
            const reseller = await supabaseService.getCompanyById(resellerId);
            if (reseller && reseller.reseller_defaults && reseller.reseller_defaults[policyKey] !== undefined) {
                console.log(`🎯 Policy [${policyKey}] resolved from Reseller: ${reseller.reseller_defaults[policyKey]}`);
                return reseller.reseller_defaults[policyKey];
            }
        }

        // 3. Fallback to Global (Core)
        console.log(`🎯 Policy [${policyKey}] resolved from Global: ${CORE_GLOBAL_POLICIES[policyKey]}`);
        return CORE_GLOBAL_POLICIES[policyKey];
    },

    /**
     * Resolves a set of policies for a company.
     */
    getEffectivePolicies: async (companyId: string): Promise<PolicySet> => {
        const effective: PolicySet = { ...CORE_GLOBAL_POLICIES };

        const company = await supabaseService.getCompanyById(companyId);
        if (!company) return effective;

        // Merge Reseller Defaults
        let resellerId = company.resellerId;
        if (!resellerId) {
            if (supabase) {
                const { data: rawCompany } = await supabase
                    .from('companies')
                    .select('reseller_id')
                    .eq('id', companyId)
                    .maybeSingle();
                resellerId = rawCompany?.reseller_id;
            }
        }

        if (resellerId) {
            const reseller = await supabaseService.getCompanyById(resellerId);
            if (reseller && reseller.reseller_defaults) {
                Object.assign(effective, reseller.reseller_defaults);
            }
        }

        // Merge Local Overrides
        if (company.policies) {
            Object.assign(effective, company.policies);
        }

        return effective;
    }
};
