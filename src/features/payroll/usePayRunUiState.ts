import { useState } from 'react';
import { auditService } from '../../core/auditService';
import { EmployerContributions, PayRunLineItem, StatutoryDeductions, User } from '../../core/types';
import { toast } from 'sonner';

interface AdHocModalState {
    isOpen: boolean;
    employeeId: string;
    type: 'ADDITIONS' | 'DEDUCTIONS';
}

interface UsePayRunUiStateParams {
    currentUser: User | null;
    addAdHocItem: (
        employeeId: string,
        type: 'ADDITIONS' | 'DEDUCTIONS',
        detail: { id: string; name: string; amount: number; isTaxable: boolean },
        period?: string
    ) => void;
    updateLineItemTaxes: (employeeId: string, updates: Partial<StatutoryDeductions>) => void;
    updateLineItemEmployerContributions: (employeeId: string, updates: Partial<EmployerContributions>) => void;
    payPeriod?: string;
}

export const usePayRunUiState = ({
    currentUser,
    addAdHocItem,
    updateLineItemTaxes,
    updateLineItemEmployerContributions,
    payPeriod
}: UsePayRunUiStateParams) => {
    const [adHocModal, setAdHocModal] = useState<AdHocModalState>({
        isOpen: false,
        employeeId: '',
        type: 'ADDITIONS'
    });
    const [newItemName, setNewItemName] = useState('');
    const [newItemAmount, setNewItemAmount] = useState('');
    const [addEmployeeModalOpen, setAddEmployeeModalOpen] = useState(false);
    const [viewingPayslip, setViewingPayslip] = useState<PayRunLineItem | null>(null);
    const [taxModalOpen, setTaxModalOpen] = useState(false);
    const [selectedTaxItem, setSelectedTaxItem] = useState<PayRunLineItem | null>(null);
    const [employerTaxModalOpen, setEmployerTaxModalOpen] = useState(false);
    const [selectedEmployerTaxItem, setSelectedEmployerTaxItem] = useState<PayRunLineItem | null>(null);
    const [taxOverrideForm, setTaxOverrideForm] = useState<StatutoryDeductions>({
        nis: 0,
        nht: 0,
        edTax: 0,
        paye: 0,
        pension: 0,
        totalDeductions: 0,
        netPay: 0
    });
    const [employerTaxOverrideForm, setEmployerTaxOverrideForm] = useState<EmployerContributions>({
        employerNIS: 0,
        employerNHT: 0,
        employerEdTax: 0,
        employerHEART: 0,
        totalEmployerCost: 0
    });

    const openAdHocModal = (employeeId: string, type: 'ADDITIONS' | 'DEDUCTIONS') => {
        setAdHocModal({ isOpen: true, employeeId, type });
        setNewItemName('');
        setNewItemAmount('');
    };

    const closeAdHocModal = () => {
        setAdHocModal(prev => ({ ...prev, isOpen: false }));
    };

    const submitAdHocItem = (event: React.FormEvent) => {
        event.preventDefault();
        if (!newItemName || !newItemAmount) return;

        addAdHocItem(
            adHocModal.employeeId,
            adHocModal.type,
            {
                id: `adhoc-${Date.now()}`,
                name: newItemName,
                amount: parseFloat(newItemAmount),
                isTaxable: true
            },
            payPeriod
        );

        closeAdHocModal();
        toast.success('Item added to this pay run');
    };

    const openTaxModal = (item: PayRunLineItem) => {
        setSelectedTaxItem(item);
        setTaxOverrideForm({
            nis: item.nis,
            nht: item.nht,
            edTax: item.edTax,
            paye: item.paye,
            pension: item.pension,
            totalDeductions: item.totalDeductions,
            netPay: item.netPay
        });
        setTaxModalOpen(true);
    };

    const closeTaxModal = () => {
        setTaxModalOpen(false);
    };

    const openEmployerTaxModal = (item: PayRunLineItem) => {
        const employerContributions = item.employerContributions || {
            employerNIS: 0,
            employerNHT: 0,
            employerEdTax: 0,
            employerHEART: 0,
            totalEmployerCost: 0
        };
        setSelectedEmployerTaxItem(item);
        setEmployerTaxOverrideForm(employerContributions);
        setEmployerTaxModalOpen(true);
    };

    const closeEmployerTaxModal = () => {
        setEmployerTaxModalOpen(false);
    };

    const submitTaxOverride = (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedTaxItem) return;

        updateLineItemTaxes(selectedTaxItem.employeeId, {
            nis: parseFloat(taxOverrideForm.nis.toString()) || 0,
            nht: parseFloat(taxOverrideForm.nht.toString()) || 0,
            edTax: parseFloat(taxOverrideForm.edTax.toString()) || 0,
            paye: parseFloat(taxOverrideForm.paye.toString()) || 0,
        });

        auditService.log(currentUser, 'UPDATE', 'PayRun', `Manually overrode taxes for ${selectedTaxItem.employeeName}`);
        closeTaxModal();
        toast.success('Tax override applied');
    };

    const submitEmployerTaxOverride = (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedEmployerTaxItem) return;

        updateLineItemEmployerContributions(selectedEmployerTaxItem.employeeId, {
            employerNIS: parseFloat(employerTaxOverrideForm.employerNIS.toString()) || 0,
            employerNHT: parseFloat(employerTaxOverrideForm.employerNHT.toString()) || 0,
            employerEdTax: parseFloat(employerTaxOverrideForm.employerEdTax.toString()) || 0,
            employerHEART: parseFloat(employerTaxOverrideForm.employerHEART.toString()) || 0,
        });

        auditService.log(currentUser, 'UPDATE', 'PayRun', `Manually overrode employer taxes for ${selectedEmployerTaxItem.employeeName}`);
        closeEmployerTaxModal();
        toast.success('Employer tax override applied');
    };

    return {
        adHocModal,
        newItemName,
        newItemAmount,
        addEmployeeModalOpen,
        viewingPayslip,
        taxModalOpen,
        selectedTaxItem,
        employerTaxModalOpen,
        selectedEmployerTaxItem,
        taxOverrideForm,
        employerTaxOverrideForm,
        setNewItemName,
        setNewItemAmount,
        setAddEmployeeModalOpen,
        setViewingPayslip,
        setTaxOverrideForm,
        setEmployerTaxOverrideForm,
        openAdHocModal,
        closeAdHocModal,
        submitAdHocItem,
        openTaxModal,
        closeTaxModal,
        submitTaxOverride,
        openEmployerTaxModal,
        closeEmployerTaxModal,
        submitEmployerTaxOverride
    };
};
