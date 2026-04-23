import React from 'react';
import { Icons } from '../../../components/Icons';
import { PayRunLineItem } from '../../../core/types';

interface PayRunDraftRowProps {
  item: PayRunLineItem;
  updateLineItemGross: (id: string, val: string) => void;
  openAdHocModal: (id: string, type: 'ADDITIONS' | 'DEDUCTIONS') => void;
  openTaxModal: (item: PayRunLineItem) => void;
  removeEmployeeFromRun: (id: string) => void;
  removeAdHocItem: (employeeId: string, itemId: string) => void;
}

export const PayRunDraftRow: React.FC<PayRunDraftRowProps> = ({
  item,
  updateLineItemGross,
  openAdHocModal,
  openTaxModal,
  removeEmployeeFromRun,
  removeAdHocItem
}) => {
  const hasAdditions = item.additions > 0;
  const hasDeductions = item.deductions > 0;
  const isManualTax = item.isTaxOverridden === true;
  const [showAdditionsMenu, setShowAdditionsMenu] = React.useState(false);
  const [showDeductionsMenu, setShowDeductionsMenu] = React.useState(false);

  return (
    <tr className="hover:bg-gray-50 group">
      <td className="px-6 py-4">
        <p className="font-bold text-gray-900 text-sm">{item.employeeName}</p>
        <p className="text-xs text-gray-400">{item.employeeCustomId || 'No ID'}</p>
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end">
          <input
            type="number"
            value={item.grossPay}
            onChange={(e) => updateLineItemGross(item.employeeId, e.target.value)}
            className="w-28 text-right border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-jam-orange focus:border-jam-orange bg-white shadow-sm"
          />
        </div>
      </td>
      <td className="px-6 py-4 text-center overflow-visible">
        <div className="flex flex-col items-center relative">
          {hasAdditions ? (
            <div className="flex flex-col items-center relative">
              <button onClick={() => setShowAdditionsMenu(!showAdditionsMenu)} className="text-green-600 font-bold text-sm mb-1 hover:text-green-700 cursor-pointer">
                +${item.additions.toLocaleString()}
              </button>
              {showAdditionsMenu && (
                <div className="absolute top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-3 z-[100] min-w-[250px] left-1/2 transform -translate-x-1/2">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-gray-700">Additions</span>
                    <button onClick={() => setShowAdditionsMenu(false)} className="text-gray-400 hover:text-gray-600">
                      <Icons.Close className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {item.additionsBreakdown?.map((add) => (
                      <div key={add.id} className="flex justify-between items-center text-xs p-2 hover:bg-gray-50 rounded">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{add.name}</div>
                          <div className="text-gray-500 text-[10px]">{add.isTaxable === false ? 'Non-taxable' : 'Taxable'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-green-600 font-bold">${add.amount.toLocaleString()}</span>
                          <button
                            onClick={() => {
                              removeAdHocItem(item.employeeId, add.id);
                              if (item.additionsBreakdown?.length === 1) setShowAdditionsMenu(false);
                            }}
                            className="text-red-500 hover:text-red-700"
                            title="Delete"
                          >
                            <Icons.Trash className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setShowAdditionsMenu(false);
                      openAdHocModal(item.employeeId, 'ADDITIONS');
                    }}
                    className="w-full mt-2 text-xs text-jam-orange hover:text-jam-black flex items-center justify-center border-t border-gray-200 pt-2"
                  >
                    <Icons.Plus className="w-3 h-3 mr-1" /> Add Another
                  </button>
                </div>
              )}
              <button onClick={() => setShowAdditionsMenu(!showAdditionsMenu)} className="text-xs text-gray-400 hover:text-jam-orange flex items-center">
                <Icons.ChevronDown className="w-3 h-3 mr-1" /> View
              </button>
            </div>
          ) : (
            <button onClick={() => openAdHocModal(item.employeeId, 'ADDITIONS')} className="text-gray-400 hover:text-jam-orange text-sm flex items-center">
              <Icons.Plus className="w-3 h-3 mr-1" /> Add
            </button>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-center overflow-visible">
        <div className="flex flex-col items-center relative">
          {hasDeductions ? (
            <div className="flex flex-col items-center relative">
              <button onClick={() => setShowDeductionsMenu(!showDeductionsMenu)} className="text-red-600 font-bold text-sm mb-1 hover:text-red-700 cursor-pointer">
                -${item.deductions.toLocaleString()}
              </button>
              {showDeductionsMenu && (
                <div className="absolute top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-3 z-[100] min-w-[250px] left-1/2 transform -translate-x-1/2">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-gray-700">Deductions</span>
                    <button onClick={() => setShowDeductionsMenu(false)} className="text-gray-400 hover:text-gray-600">
                      <Icons.Close className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {item.deductionsBreakdown?.map((ded) => (
                      <div key={ded.id} className="flex justify-between items-center text-xs p-2 hover:bg-gray-50 rounded">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{ded.name}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-red-600 font-bold">${ded.amount.toLocaleString()}</span>
                          <button
                            onClick={() => {
                              removeAdHocItem(item.employeeId, ded.id);
                              if (item.deductionsBreakdown?.length === 1) setShowDeductionsMenu(false);
                            }}
                            className="text-red-500 hover:text-red-700"
                            title="Delete"
                          >
                            <Icons.Trash className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setShowDeductionsMenu(false);
                      openAdHocModal(item.employeeId, 'DEDUCTIONS');
                    }}
                    className="w-full mt-2 text-xs text-jam-orange hover:text-jam-black flex items-center justify-center border-t border-gray-200 pt-2"
                  >
                    <Icons.Plus className="w-3 h-3 mr-1" /> Add Another
                  </button>
                </div>
              )}
              <button onClick={() => setShowDeductionsMenu(!showDeductionsMenu)} className="text-xs text-gray-400 hover:text-jam-orange flex items-center">
                <Icons.ChevronDown className="w-3 h-3 mr-1" /> View
              </button>
            </div>
          ) : (
            <button onClick={() => openAdHocModal(item.employeeId, 'DEDUCTIONS')} className="text-gray-400 hover:text-jam-orange text-sm flex items-center">
              <Icons.Plus className="w-3 h-3 mr-1" /> Add
            </button>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-right relative">
        <div className="text-xs text-gray-500 space-y-0.5">
          <div className="flex justify-end space-x-2"><span>PAYE:</span> <span className="font-medium text-gray-700">{item.paye.toLocaleString()}</span></div>
          <div className="flex justify-end space-x-2"><span>NIS:</span> <span className="font-medium text-gray-700">{item.nis.toLocaleString()}</span></div>
          <div className="flex justify-end space-x-2"><span>NHT:</span> <span className="font-medium text-gray-700">{item.nht.toLocaleString()}</span></div>
          <div className="flex justify-end space-x-2"><span>Ed:</span> <span className="font-medium text-gray-700">{item.edTax.toLocaleString()}</span></div>
          <div className="mt-1 flex justify-end">
            <button onClick={() => openTaxModal(item)} className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-0.5 rounded flex items-center" title="Manually Override Taxes">
              <Icons.FileEdit className="w-3 h-3 mr-1" /> Edit Taxes
            </button>
          </div>
          {isManualTax && (
            <div className="absolute top-2 right-2">
              <span className="bg-red-100 text-red-600 text-[9px] font-bold px-1 rounded border border-red-200">MANUAL</span>
            </div>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-right">
        <span className="font-bold text-lg text-gray-900">${item.netPay.toLocaleString()}</span>
      </td>
      <td className="px-6 py-4 text-center">
        <button onClick={() => removeEmployeeFromRun(item.employeeId)} className="text-gray-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors" title="Remove from Pay Run">
          <Icons.Trash className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
};
