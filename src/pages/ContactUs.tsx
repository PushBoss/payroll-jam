import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { Icons } from '../components/Icons';
import { Footer } from '../components/Footer';
import { sendContactUsSubmission } from '../services/supportService';

interface ContactUsProps {
  onBack: () => void;
  onLogin: () => void;
  onSignup: () => void;
  onPricingClick: () => void;
  onFeaturesClick: () => void;
  onFaqClick: () => void;
  onPrivacyClick?: () => void;
  onTermsClick?: () => void;
}

export const ContactUs: React.FC<ContactUsProps> = ({
  onBack,
  onLogin,
  onSignup,
  onPricingClick,
  onFeaturesClick,
  onFaqClick,
  onPrivacyClick,
  onTermsClick
}) => {
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

  useEffect(() => {
    document.title = 'Contact Us | Payroll-Jam';

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Contact Payroll-Jam support. Send us a message and we will get back to you as soon as possible.');
    }

    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', window.location.href);
  }, []);

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
    <div className="min-h-screen bg-white font-sans text-slate-900">
      {/* Navigation (match Features page) */}
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <button
              onClick={onBack}
              className="flex items-center text-2xl font-extrabold text-jam-black tracking-tight hover:opacity-80 transition-opacity"
            >
              Payroll<span className="text-jam-orange">-Jam</span>
            </button>

            <div className="hidden md:flex items-center space-x-8">
              <button onClick={onFeaturesClick} className="text-gray-600 hover:text-gray-900 font-medium">Features</button>
              <button onClick={onPricingClick} className="text-gray-600 hover:text-gray-900 font-medium">Pricing</button>
              <button onClick={onFaqClick} className="text-gray-600 hover:text-gray-900 font-medium">FAQ</button>
              <span className="text-jam-orange font-bold">Contact</span>
            </div>

            <div className="flex items-center space-x-4">
              {!user ? (
                <>
                  <button
                    onClick={onLogin}
                    className="text-gray-900 font-medium hover:text-jam-orange transition-colors"
                  >
                    Log In
                  </button>
                  <button
                    onClick={onSignup}
                    className="bg-jam-black text-white px-6 py-2.5 rounded-full font-semibold hover:bg-gray-800 transition-all shadow-lg"
                  >
                    Sign Up Free
                  </button>
                </>
              ) : (
                <button
                  onClick={onBack}
                  className="bg-jam-black text-white px-6 py-2.5 rounded-full font-semibold hover:bg-gray-800 transition-all shadow-lg"
                >
                  Back to App
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero (match Features page) */}
      <div className="pt-32 pb-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-jam-orange/10 text-jam-orange text-sm font-bold mb-5 border border-jam-orange/20">
            <Icons.Mail className="w-4 h-4 mr-2" />
            Support
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6">
            Contact <span className="text-jam-orange">Payroll-Jam</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Tell us what you need help with and our team will get back to you.
          </p>
        </div>
      </div>

      {/* Content */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900">Tips for faster support</h2>
                <p className="text-sm text-gray-600 mt-2">Including details helps us resolve issues quicker.</p>
                <ul className="mt-5 space-y-4">
                  {[
                    'What you were trying to do and what happened',
                    'Any error message text you saw',
                    'The page you were on when it occurred'
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start">
                      <Icons.CheckCircle className="w-5 h-5 text-jam-orange mt-0.5 mr-3 flex-shrink-0" />
                      <span className="text-gray-700">{item}</span>
                    </li>
                  ))}
                </ul>

                {user?.email && (
                  <div className="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-200">
                    <p className="text-xs font-bold text-gray-500 uppercase">Signed in as</p>
                    <p className="text-sm font-semibold text-gray-900 mt-1 break-words">{user.email}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
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
                      className="w-full min-h-[160px] rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-jam-orange focus:outline-none focus:ring-1 focus:ring-jam-orange"
                      placeholder="Describe the issue and include any helpful details."
                      required
                    />
                  </div>

                  <div className="pt-2 flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={!canSubmit || isSending}
                      className="px-6 py-3 bg-jam-black text-white font-semibold rounded-full hover:bg-gray-800 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSending ? 'Sending…' : 'Send Message'}
                    </button>
                    <span className="text-sm text-gray-500">We typically respond within 1 business day.</span>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer
        onFeaturesClick={onFeaturesClick}
        onPricingClick={onPricingClick}
        onFaqClick={onFaqClick}
        onPrivacyClick={onPrivacyClick}
        onTermsClick={onTermsClick}
      />
    </div>
  );
};
