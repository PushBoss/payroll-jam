import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icons } from './Icons';
import { User, CompanySettings } from '../core/types';
import { sendContactUsSubmission } from '../services/supportService';

interface ContactSupportModalProps {
  user: User;
  companyData?: CompanySettings;
  onClose: () => void;
}

export const ContactSupportModal: React.FC<ContactSupportModalProps> = ({ user, companyData, onClose }) => {
  const [enquiryType, setEnquiryType] = useState('Technical Support');
  const [subject, setSubject] = useState('Employee portal support');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'Urgent'>('Low');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const isValid = useMemo(() => message.trim().length >= 5 && subject.trim().length >= 3, [message, subject]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || isSending) return;

    setIsSending(true);
    try {
      const result = await sendContactUsSubmission({
        name: user.name,
        email: user.email,
        company: companyData?.name || '',
        phone: companyData?.phone || '',
        enquiry_type: enquiryType,
        subject,
        priority,
        message,
        currentUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: String(user.role),
          companyId: user.companyId,
        },
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to submit support request.');
      }

      toast.success('Support request submitted.');
      onClose();
    } catch (error: any) {
      console.error('Support request failed:', error);
      toast.error(error?.message || 'Failed to submit support request.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 bg-gray-50 p-5">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Contact Support</h3>
            <p className="mt-1 text-sm text-gray-500">Send a support request without leaving the employee portal.</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <Icons.Close className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Type</label>
              <select
                value={enquiryType}
                onChange={(event) => setEnquiryType(event.target.value)}
                className="w-full rounded-lg border border-gray-300 p-2 text-sm"
              >
                <option>Technical Support</option>
                <option>Billing</option>
                <option>Onboarding</option>
                <option>General</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Priority</label>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as typeof priority)}
                className="w-full rounded-lg border border-gray-300 p-2 text-sm"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Subject</label>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="w-full rounded-lg border border-gray-300 p-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Message</label>
            <textarea
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell us what happened and what you were trying to do."
              className="w-full rounded-lg border border-gray-300 p-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || isSending}
              className="rounded-lg bg-jam-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSending ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
