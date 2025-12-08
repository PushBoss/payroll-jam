
import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import { DocumentTemplate, TemplateCategory, DOCUMENT_PLACEHOLDERS, Employee, CompanySettings } from '../types';

interface DocumentsProps {
  templates: DocumentTemplate[];
  employees: Employee[];
  companyData: CompanySettings;
  onUpdateTemplates: (templates: DocumentTemplate[]) => void;
}

export const Documents: React.FC<DocumentsProps> = ({ templates, employees, companyData, onUpdateTemplates }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'generate'>('list');
  const [currentTemplate, setCurrentTemplate] = useState<DocumentTemplate | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Array<{id: string, employeeName: string, documentType: string, requestDate: string, status: 'PENDING' | 'APPROVED' | 'REJECTED'}>>([
    { id: 'REQ-001', employeeName: 'John Doe', documentType: 'Job Letter', requestDate: '2025-01-15', status: 'PENDING' },
    { id: 'REQ-002', employeeName: 'Jane Smith', documentType: 'Salary Certificate', requestDate: '2025-01-14', status: 'PENDING' }
  ]);
  
  // Generation State
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  
  // Editor State
  const [editorName, setEditorName] = useState('');
  const [editorCategory, setEditorCategory] = useState<TemplateCategory>(TemplateCategory.LETTER);
  const [editorContent, setEditorContent] = useState('');

  const handleApproveRequest = (requestId: string) => {
    setPendingRequests(prev => prev.map(req => 
      req.id === requestId ? { ...req, status: 'APPROVED' as const } : req
    ));
    alert('Document request approved. Employee will be notified.');
  };

  const handleRejectRequest = (requestId: string) => {
    const reason = prompt('Rejection reason (optional):');
    setPendingRequests(prev => prev.map(req => 
      req.id === requestId ? { ...req, status: 'REJECTED' as const } : req
    ));
    alert('Document request rejected.');
  };

  const handleStartCreate = () => {
    setCurrentTemplate(null);
    setEditorName('New Template');
    setEditorCategory(TemplateCategory.LETTER);
    setEditorContent('Dear {{firstName}},\n\nWrite your content here...');
    setActiveTab('create');
  };

  const handleEdit = (t: DocumentTemplate) => {
    setCurrentTemplate(t);
    setEditorName(t.name);
    setEditorCategory(t.category);
    setEditorContent(t.content);
    setActiveTab('create');
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this template?')) {
      const updated = templates.filter(t => t.id !== id);
      onUpdateTemplates(updated);
    }
  };

  const insertPlaceholder = (ph: string) => {
    setEditorContent(prev => prev + ` ${ph} `);
  };

  const saveTemplate = () => {
    if (!editorName.trim() || !editorContent.trim()) return;

    const newTemplate: DocumentTemplate = {
      id: currentTemplate?.id || `DOC-${Math.floor(Math.random() * 10000)}`,
      name: editorName,
      category: editorCategory,
      content: editorContent,
      lastModified: new Date().toISOString().split('T')[0]
    };

    let updated;
    if (currentTemplate) {
      updated = templates.map(t => t.id === currentTemplate.id ? newTemplate : t);
    } else {
      updated = [...templates, newTemplate];
    }
    onUpdateTemplates(updated);
    setActiveTab('list');
  };

  const generateDocument = () => {
    const template = templates.find(t => t.id === selectedTemplateId);
    const emp = employees.find(e => e.id === selectedEmpId);
    
    if (!template || !emp) return;

    let content = template.content;

    // Replace placeholders
    const replacements: Record<string, string> = {
      '{{firstName}}': emp.firstName,
      '{{lastName}}': emp.lastName,
      '{{trn}}': emp.trn,
      '{{grossSalary}}': `$${emp.grossSalary.toLocaleString()}`,
      '{{role}}': emp.role,
      '{{hireDate}}': emp.hireDate,
      '{{companyName}}': companyData.name,
      '{{currentDate}}': new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      '{{address}}': '123 Street, Kingston' // Mock address as it's not fully in Employee type yet
    };

    Object.keys(replacements).forEach(key => {
      const regex = new RegExp(key, 'g');
      content = content.replace(regex, replacements[key]);
    });

    setGeneratedContent(content);
  };

  const downloadDocument = () => {
    const element = document.createElement('a');
    const file = new Blob([generatedContent], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `document-${Date.now()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const printDocument = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${companyData.name} Document</title>
            <style>
              body { font-family: 'Times New Roman', serif; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; }
              .header { text-align: center; margin-bottom: 40px; border-bottom: 1px solid #ccc; padding-bottom: 20px; }
              .footer { margin-top: 60px; font-size: 12px; color: #666; text-align: center; }
              h1 { font-size: 18px; text-transform: uppercase; }
              p { margin-bottom: 16px; white-space: pre-wrap; }
              @media print {
                body { padding: 0; margin: 2cm; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${companyData.name}</h1>
              <p>${companyData.address} | ${companyData.phone}</p>
            </div>
            <div>
              ${generatedContent.split('\n').map(line => `<p>${line}</p>`).join('')}
            </div>
            <div class="footer">
              Generated by Payroll-Jam on ${new Date().toLocaleDateString()}
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  if (activeTab === 'create') {
    return (
      <div className="h-[calc(100vh-8rem)] flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <div>
            <input 
              type="text" 
              value={editorName}
              onChange={(e) => setEditorName(e.target.value)}
              className="bg-transparent font-bold text-lg focus:outline-none border-b border-dashed border-gray-400 focus:border-jam-orange"
              placeholder="Template Name"
            />
            <div className="flex items-center mt-1 space-x-2">
              <select 
                value={editorCategory}
                onChange={(e) => setEditorCategory(e.target.value as TemplateCategory)}
                className="text-xs bg-white border border-gray-300 rounded px-2 py-1"
              >
                {Object.values(TemplateCategory).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex space-x-2">
            <button onClick={() => setActiveTab('list')} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">Cancel</button>
            <button onClick={saveTemplate} className="px-4 py-2 text-sm bg-jam-black text-white rounded-lg hover:bg-gray-800 flex items-center">
              <Icons.Save className="w-4 h-4 mr-2" /> Save Template
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Editor Area */}
          <div className="flex-1 p-6 overflow-y-auto bg-gray-50">
            <div className="max-w-3xl mx-auto bg-white shadow-md min-h-[800px] p-12 border border-gray-200 relative">
               <textarea 
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                className="w-full h-full min-h-[700px] resize-none focus:outline-none font-serif text-lg leading-relaxed"
                placeholder="Start typing your document template here..."
               />
            </div>
          </div>

          {/* Sidebar - Placeholders */}
          <div className="w-64 bg-white border-l border-gray-200 p-4 overflow-y-auto">
             <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Insert Variables</h4>
             <div className="space-y-2">
               {DOCUMENT_PLACEHOLDERS.map(ph => (
                 <button 
                  key={ph.key}
                  onClick={() => insertPlaceholder(ph.key)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-jam-orange rounded-md flex justify-between group transition-colors"
                 >
                   <span>{ph.label}</span>
                   <Icons.Plus className="w-4 h-4 opacity-0 group-hover:opacity-100" />
                 </button>
               ))}
             </div>
             <div className="mt-8 p-4 bg-blue-50 rounded-lg text-xs text-blue-700">
               <Icons.AI className="w-4 h-4 mb-2" />
               Tip: Use standard text for parts that don't change. Variables will be swapped automatically during generation.
             </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'generate') {
    return (
      <div className="h-[calc(100vh-8rem)] flex bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
        {/* Configuration Sidebar */}
        <div className="w-1/3 border-r border-gray-200 p-6 flex flex-col">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Document Settings</h3>
          
          <div className="space-y-6 flex-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">1. Select Template</label>
              <select 
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-jam-orange focus:border-jam-orange"
                value={selectedTemplateId}
                onChange={(e) => { setSelectedTemplateId(e.target.value); setGeneratedContent(''); }}
              >
                <option value="">-- Choose Template --</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">2. Select Employee</label>
              <select 
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-jam-orange focus:border-jam-orange"
                value={selectedEmpId}
                onChange={(e) => { setSelectedEmpId(e.target.value); setGeneratedContent(''); }}
              >
                <option value="">-- Choose Employee --</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                ))}
              </select>
            </div>

            <button 
              onClick={generateDocument}
              disabled={!selectedEmpId || !selectedTemplateId}
              className="w-full py-3 bg-jam-black text-white font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate Preview
            </button>
          </div>

           <button 
              onClick={() => setActiveTab('list')} 
              className="mt-4 text-sm text-gray-500 hover:text-gray-900"
            >
              &larr; Back to Templates
            </button>
        </div>

        {/* Preview Area */}
        <div className="flex-1 bg-gray-100 p-8 overflow-y-auto flex flex-col items-center">
           {generatedContent ? (
             <>
                <div className="w-full max-w-[21cm] bg-white shadow-lg min-h-[29.7cm] p-[2.5cm] text-gray-900 font-serif leading-relaxed whitespace-pre-wrap">
                   <div className="text-center border-b border-gray-300 pb-6 mb-8">
                      <h1 className="text-xl font-bold uppercase tracking-wide">{companyData.name}</h1>
                      <p className="text-sm text-gray-500 mt-1">{companyData.address}</p>
                   </div>
                   {generatedContent}
                </div>
                <div className="fixed bottom-8 right-8 flex space-x-3">
                   <button 
                    onClick={() => setGeneratedContent('')}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-full shadow hover:bg-gray-50"
                   >
                     Discard
                   </button>
                   <button 
                    onClick={downloadDocument}
                    className="px-6 py-2 bg-green-600 text-white font-bold rounded-full shadow-lg hover:bg-green-700 flex items-center"
                   >
                     <Icons.Download className="w-4 h-4 mr-2" />
                     Download TXT
                   </button>
                   <button 
                    onClick={printDocument}
                    className="px-6 py-2 bg-jam-orange text-jam-black font-bold rounded-full shadow-lg hover:bg-yellow-500 flex items-center"
                   >
                     <Icons.Printer className="w-4 h-4 mr-2" />
                     Print / PDF
                   </button>
                </div>
             </>
           ) : (
             <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Icons.Document className="w-16 h-16 mb-4 opacity-20" />
                <p>Select a template and employee to preview document.</p>
             </div>
           )}
        </div>
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Document Center</h2>
          <p className="text-gray-500 mt-1">Manage legal templates and generate employee documents.</p>
        </div>
        <div className="mt-4 md:mt-0 flex space-x-3">
           <button 
            onClick={() => setActiveTab('generate')}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center shadow-sm"
          >
            <Icons.Zap className="w-4 h-4 mr-2 text-jam-orange" />
            Generate Document
          </button>
          <button 
            onClick={handleStartCreate}
            className="bg-jam-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 flex items-center shadow-lg"
          >
            <Icons.Plus className="w-4 h-4 mr-2" />
            New Template
          </button>
        </div>
      </div>

      {/* Pending Requests Section */}
      {pendingRequests.some(r => r.status === 'PENDING') && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Icons.Alert className="w-5 h-5 text-yellow-600 mr-2" />
            <h3 className="font-bold text-gray-900">Pending Document Requests</h3>
            <span className="ml-2 bg-yellow-200 text-yellow-800 text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingRequests.filter(r => r.status === 'PENDING').length}
            </span>
          </div>
          <div className="space-y-3">
            {pendingRequests.filter(r => r.status === 'PENDING').map(req => (
              <div key={req.id} className="bg-white p-4 rounded-lg flex items-center justify-between shadow-sm">
                <div className="flex items-center">
                  <Icons.Document className="w-5 h-5 text-gray-400 mr-3" />
                  <div>
                    <p className="font-medium text-gray-900">{req.employeeName}</p>
                    <p className="text-sm text-gray-500">{req.documentType} • Requested {req.requestDate}</p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleApproveRequest(req.id)}
                    className="px-3 py-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 text-sm font-medium flex items-center"
                  >
                    <Icons.CheckMark className="w-4 h-4 mr-1" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleRejectRequest(req.id)}
                    className="px-3 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-medium"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {templates.map(template => (
           <div key={template.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow group relative">
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                 <button onClick={() => handleEdit(template)} className="p-1.5 bg-gray-100 rounded-md hover:bg-gray-200 text-gray-600">
                   <Icons.FileEdit className="w-4 h-4" />
                 </button>
                  <button onClick={() => handleDelete(template.id)} className="p-1.5 bg-red-50 rounded-md hover:bg-red-100 text-red-500">
                   <Icons.Trash className="w-4 h-4" />
                 </button>
              </div>
              <div className="flex items-center mb-4">
                 <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                   <Icons.Document className="w-6 h-6" />
                 </div>
                 <div className="ml-3">
                    <h4 className="font-bold text-gray-900 truncate max-w-[150px]">{template.name}</h4>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 mt-1">
                      {template.category}
                    </span>
                 </div>
              </div>
              <p className="text-xs text-gray-500 line-clamp-3 h-12 mb-4 font-serif leading-relaxed bg-gray-50 p-2 rounded">
                {template.content}
              </p>
              <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                 <span className="text-xs text-gray-400">Edited: {template.lastModified}</span>
                 <button 
                  onClick={() => { handleEdit(template); }}
                  className="text-sm text-jam-orange font-semibold hover:text-yellow-600"
                 >
                   Edit
                 </button>
              </div>
           </div>
         ))}
         
         <button 
          onClick={handleStartCreate}
          className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-jam-orange hover:text-jam-orange hover:bg-orange-50 transition-all"
         >
            <Icons.Plus className="w-8 h-8 mb-2" />
            <span className="font-medium">Create Blank Template</span>
         </button>
      </div>
    </div>
  );
};