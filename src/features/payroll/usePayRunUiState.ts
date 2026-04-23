import { useState } from 'react';
import { auditService } from '../../core/auditService';
import { PayRunLineItem, StatutoryDeductions, User } from '../../core/types';
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
        detail: { id: string; name: string; amount: number; isTaxable: boolean }
    ) => void;
    updateLineItemTaxes: (employeeId: string, updates: Partial<StatutoryDeductions>) => void;
}

export const usePayRunUiState = ({
    currentUser,
    addAdHocItem,
    updateLineItemTaxes
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
    const [taxOverrideForm, setTaxOverrideForm] = useState<StatutoryDeductions>({
        nis: 0,
        nht: 0,
        edTax: 0,
        paye: 0,
        pension: 0,
        totalDeductions: 0,
        netPay: 0
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

        addAdHocItem(adHocModal.employeeId, adHocModal.type, {
            id: `adhoc-${Date.now()}`,
            name: newItemName,
            amount: parseFloat(newItemAmount),
            isTaxable: true
        });

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

    return {
        adHocModal,
        newItemName,
        newItemAmount,
        addEmployeeModalOpen,
        viewingPayslip,
        taxModalOpen,
        selectedTaxItem,
        taxOverrideForm,
        setNewItemName,
        setNewItemAmount,
        setAddEmployeeModalOpen,
        setViewingPayslip,
        setTaxOverrideForm,
        openAdHocModal,
        closeAdHocModal,
        submitAdHocItem,
        openTaxModal,
        closeTaxModal,
        submitTaxOverride
    };
};