import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { Icons } from '../components/Icons';
import { sendContactUsSubmission } from '../services/supportService';

interface ContactUsProps {
  onBack?: () => void;
}

export const ContactUs: React.FC<ContactUsProps> = ({ onBack }) => {
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName((prev) => prev || user.name || '');
    setEmail((prev) => prev || user.email || '');
  }, [user]);

  const canSubmit = useMemo(() => {
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();
    return trimmedEmail.length > 3 && trimmedMessage.length > 3;
  }, [email, message]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isSending) return;

    setIsSending(true);
    try {
      const result = await sendContactUsSubmission({
        name: name.trim() || 'Anonymous',
        email: email.trim(),
        subject: subject.trim() || 'Support Request',
        message: message.trim(),
        currentUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.name,
              role: String(user.role),
              companyId: (user as any).companyId
            }
          : null
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to send message');
      }

      toast.success('Message sent. Support will reach out soon.');
      setSubject('');
      setMessage('');
    } catch (err: any) {
      console.error('Contact Us submission failed:', err);
      toast.error(err?.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 sm:px-8 sm:py-6 bg-gray-50 border-b border-gray-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-jam-orange bg-opacity-20 text-jam-orange flex items-center justify-center flex-shrink-0">
                <Icons.Mail className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Contact Us</h1>
                <p className="text-sm text-gray-600 mt-1">Send a message to the Payroll-Jam support team.</p>
              </div>
            </div>

            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                ← Back
              </button>
            )}
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white border border-gray-200 rounded-2xl p-6">
                <h2 className="text-sm font-bold text-gray-900">Tips for faster support</h2>
                <ul className="mt-3 space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                    <span>Tell us what you were trying to do and what happened.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                    <span>Include any error message text (if available).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                    <span>Share the page you were on when it occurred.</span>
                  </li>
                </ul>

                {user?.email && (
                  <div className="mt-5 p-4 rounded-xl bg-gray-50 border border-gray-200">
                    <p className="text-xs font-bold text-gray-500 uppercase">Signed in as</p>
                    <p className="text-sm font-semibold text-gray-900 mt-1 break-words">{user.email}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white border border-gray-200 rounded-2xl p-6">
                <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-jam-orange focus:outline-none focus:ring-1 focus:ring-jam-orange"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-jam-orange focus:outline-none focus:ring-1 focus:ring-jam-orange"
                placeholder="you@company.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-jam-orange focus:outline-none focus:ring-1 focus:ring-jam-orange"
              placeholder="How can we help?"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full min-h-[140px] rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-jam-orange focus:outline-none focus:ring-1 focus:ring-jam-orange"
              placeholder="Describe the issue and include any helpful details."
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={!canSubmit || isSending}
              className="w-full sm:w-auto px-6 py-3 bg-jam-orange text-jam-black font-bold rounded-lg hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? 'Sending…' : 'Send Message'}
            </button>
          </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
