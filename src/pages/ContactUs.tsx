import React, { useEffect, useMemo, useState, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { Icons } from '../components/Icons';
import { Footer } from '../components/Footer';
import { PublicHeader } from '../components/PublicHeader';
import { sendContactUsSubmission } from '../services/supportService';
import { getSupportAIResponse } from '../services/aiService';
import { ChatMessage } from '../core/types';

interface ContactUsProps {
  onBack: () => void;
  onLogin: () => void;
  onSignup: () => void;
  onPricingClick: () => void;
  onFeaturesClick: () => void;
  onFaqClick: () => void;
  onContactClick?: () => void;
  onPrivacyClick?: () => void;
  onTermsClick?: () => void;
}

const ENQUIRY_TYPES = [
  { id: 'Technical Support', label: 'Technical Support', icon: 'Settings' },
  { id: 'Billing', label: 'Billing', icon: 'CreditCard' },
  { id: 'Sales & Plans', label: 'Sales & Plans', icon: 'Zap' },
  { id: 'Onboarding', label: 'Onboarding', icon: 'UserCheck' },
  { id: 'General', label: 'General', icon: 'Mail' }
] as const;

type EnquiryType = typeof ENQUIRY_TYPES[number]['id'];

const SUBJECTS_MAP: Record<EnquiryType, string[]> = {
  'Technical Support': [
    'Cannot upload documents',
    'Login or access issues',
    'Payroll calculation errors',
    'Integration not working',
    'Other technical issue'
  ],
  'Billing': [
    'Charge I don\'t recognise',
    'Request a refund',
    'Update payment method',
    'Cancel my subscription',
    'Invoice or receipt request'
  ],
  'Sales & Plans': [
    'Upgrade my plan',
    'Compare plans',
    'Request a demo',
    'Volume or enterprise pricing',
    'Other sales enquiry'
  ],
  'Onboarding': [
    'Account setup help',
    'Employee onboarding issue',
    'ID verification problem',
    'Importing data',
    'Other onboarding question'
  ],
  'General': [
    'Product feedback',
    'Partnership enquiry',
    'Press or media',
    'Other'
  ]
};

const CONTEXT_HINTS: Record<EnquiryType, string> = {
  'Technical Support': 'Share the page you were on, any error messages you saw, and steps to reproduce the issue.',
  'Billing': 'Include your account email and a description of the charge or invoice in question.',
  'Sales & Plans': 'Let us know your company size and what features you\'re interested in — we\'ll get back to you quickly.',
  'Onboarding': 'Tell us where you\'re stuck in the setup process so we can guide you step by step.',
  'General': 'We welcome any feedback, partnership enquiries, or questions not covered above.'
};

const PRIORITIES = [
  { id: 'Low', label: 'Low', color: 'border-slate-200 text-slate-700 bg-slate-50 active:bg-slate-100 hover:border-slate-300' },
  { id: 'Medium', label: 'Medium', color: 'border-amber-200 text-amber-800 bg-amber-50 active:bg-amber-100 hover:border-amber-300' },
  { id: 'Urgent', label: 'Urgent', color: 'border-rose-200 text-rose-800 bg-rose-50/70 active:bg-rose-100 hover:border-rose-300' }
] as const;

export const ContactUs: React.FC<ContactUsProps> = ({
  onBack,
  onLogin,
  onSignup,
  onPricingClick,
  onFeaturesClick,
  onFaqClick,
  onContactClick,
  onPrivacyClick,
  onTermsClick
}) => {
  const { user } = useAuth();

  // Mode: Form vs AI Assistant (AI Assistant commented out for now)
  const activeMode = 'form';

  // --- Form Mode State ---
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [enquiryType, setEnquiryType] = useState<EnquiryType>('Technical Support');
  const [subject, setSubject] = useState(SUBJECTS_MAP['Technical Support'][0]);
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'Urgent'>('Low');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  // --- AI Assistant State ---
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: `Hello! I'm the Payroll-Jam Support Intake Assistant. 👋\n\nI can help you build and submit your support ticket in just a few quick questions.\n\nCould you please start by telling me your **Full Name**, **Work Email**, and **Company Name**? (If you have a phone number, feel free to include it too!)`,
      timestamp: Date.now()
    }
  ]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSubmissionCompleted, setAiSubmissionCompleted] = useState(false);
  const [submittedData, setSubmittedData] = useState<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fill in logged-in user details if available
  useEffect(() => {
    if (!user) return;
    setName((prev) => prev || user.name || '');
    setEmail((prev) => prev || user.email || '');
  }, [user]);

  // Set page meta details
  useEffect(() => {
    document.title = 'Contact Support | Payroll-Jam';

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        'content',
        'Contact Payroll-Jam support. Fill out our structured form or chat with our AI Support Intake Assistant to submit your enquiry.'
      );
    }

    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', window.location.href);
  }, []);

  // Update subject default option when enquiry type changes
  useEffect(() => {
    setSubject(SUBJECTS_MAP[enquiryType][0]);
  }, [enquiryType]);

  // Scroll chat window to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isAiLoading]);

  // Validation
  const isFormValid = useMemo(() => {
    return (
      name.trim().length > 1 &&
      email.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) !== null &&
      company.trim().length > 1 &&
      phone.trim().length > 4 &&
      message.trim().length > 4
    );
  }, [name, email, company, phone, message]);

  // Submit via traditional form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSending) return;

    setIsSending(true);
    try {
      const result = await sendContactUsSubmission({
        name: name.trim(),
        email: email.trim(),
        company: company.trim(),
        phone: phone.trim() || undefined,
        enquiry_type: enquiryType,
        subject: subject,
        priority: priority,
        message: message.trim(),
        currentUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.name,
              role: String(user.role),
              companyId: user.companyId
            }
          : null
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to submit form');
      }

      toast.success('Your support ticket has been submitted. Our team will contact you soon.');
      // Reset form
      setMessage('');
      setShowSummary(false);
    } catch (err: any) {
      console.error('Contact Form submission failed:', err);
      toast.error(err.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  // Submit via AI Chat Assistant parsed payload
  const handleAiIntakeSubmit = async (data: any) => {
    setIsAiLoading(true);
    try {
      const result = await sendContactUsSubmission({
        name: data.name || 'AI Assistant Client',
        email: data.email || 'unknown@email.com',
        company: data.company || 'Unknown Company',
        phone: data.phone || undefined,
        enquiry_type: data.enquiry_type || 'General',
        subject: data.subject || 'AI Intake Support',
        priority: data.priority || 'Low',
        message: data.message || 'Submitted via AI Support Intake Assistant',
        currentUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.name,
              role: String(user.role),
              companyId: user.companyId
            }
          : null
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to submit AI ticket');
      }

      setAiSubmissionCompleted(true);
      setSubmittedData(data);
      toast.success('Ticket submitted successfully via AI assistant!');
    } catch (err: any) {
      console.error('AI ticket submission failed:', err);
      toast.error('AI submission failed. Please copy details or fill out the Form directly.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Chat message sending
  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || isAiLoading || aiSubmissionCompleted) return;

    const userMsg: ChatMessage = {
      role: 'user',
      text: chatInput.trim(),
      timestamp: Date.now()
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsAiLoading(true);

    try {
      const responseText = await getSupportAIResponse(userMsg.text, [...chatMessages, userMsg]);

      // Check if response contains a SUBMIT_DATA command
      const submitMarker = 'SUBMIT_DATA:';
      const markerIndex = responseText.indexOf(submitMarker);

      if (markerIndex !== -1) {
        const jsonStr = responseText.substring(markerIndex + submitMarker.length).trim();
        const cleanResponseText = responseText.substring(0, markerIndex).trim();

        const modelMsg: ChatMessage = {
          role: 'model',
          text: cleanResponseText || 'Got it! I am processing your support request now...',
          timestamp: Date.now()
        };
        setChatMessages((prev) => [...prev, modelMsg]);

        try {
          const parsedData = JSON.parse(jsonStr);
          await handleAiIntakeSubmit(parsedData);
        } catch (jsonErr) {
          console.error('Failed to parse AI SUBMIT_DATA JSON:', jsonErr);
          const errorMsg: ChatMessage = {
            role: 'model',
            text: 'I gathered all your details, but there was an error structuring the form payload. Let me try compiling it again.',
            timestamp: Date.now()
          };
          setChatMessages((prev) => [...prev, errorMsg]);
          setIsAiLoading(false);
        }
      } else {
        const modelMsg: ChatMessage = {
          role: 'model',
          text: responseText,
          timestamp: Date.now()
        };
        setChatMessages((prev) => [...prev, modelMsg]);
        setIsAiLoading(false);
      }
    } catch (err) {
      console.error('Chat error:', err);
      const errorMsg: ChatMessage = {
        role: 'model',
        text: 'Sorry, I hit a network glitch trying to parse your request. Please try again or switch to the Form tab.',
        timestamp: Date.now()
      };
      setChatMessages((prev) => [...prev, errorMsg]);
      setIsAiLoading(false);
    }
  };

  const getEnquiryIcon = (iconName: string) => {
    switch (iconName) {
      case 'Settings': return <Icons.Settings className="w-5 h-5" />;
      case 'CreditCard': return <Icons.CreditCard className="w-5 h-5" />;
      case 'Zap': return <Icons.Zap className="w-5 h-5" />;
      case 'UserCheck': return <Icons.UserCheck className="w-5 h-5" />;
      case 'Mail': return <Icons.Mail className="w-5 h-5" />;
      default: return <Icons.Mail className="w-5 h-5" />;
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 flex flex-col justify-between">
      <div>
        <PublicHeader
          currentPage="contact-us"
          onHomeClick={onBack}
          onFeaturesClick={onFeaturesClick}
          onPricingClick={onPricingClick}
          onFaqClick={onFaqClick}
          onContactClick={onContactClick || (() => {})}
          onLogin={user ? undefined : onLogin}
          onSignup={user ? undefined : onSignup}
          onAppBack={user ? onBack : undefined}
        />

        {/* Hero Section */}
        <div className="pt-40 pb-16 bg-gray-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6">
              Get in Touch with <br/>
              <span className="text-jam-orange">Payroll-Jam Support</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Whether you need technical support, billing help, onboarding guidelines, or have product feedback, our team has you covered.
            </p>
          </div>
        </div>

        {/* Main Content Container */}
        <div className="py-16 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Custom Dual Mode Toggle - Commented out for now
          <div className="flex justify-center mb-6">
            <div className="inline-flex p-1 bg-white rounded-full shadow-lg border border-slate-200 backdrop-blur-md">
              <button
                onClick={() => setActiveMode('form')}
                className={`flex items-center space-x-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ${
                  activeMode === 'form'
                    ? 'bg-[#1A1F2E] text-white shadow-md'
                    : 'text-slate-600 hover:text-[#1A1F2E] hover:bg-slate-50'
                }`}
              >
                <Icons.File className="w-4 h-4" />
                <span>Structured Form</span>
              </button>
              <button
                onClick={() => setActiveMode('ai')}
                className={`flex items-center space-x-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ${
                  activeMode === 'ai'
                    ? 'bg-[#1A1F2E] text-white shadow-md'
                    : 'text-slate-600 hover:text-[#1A1F2E] hover:bg-slate-50'
                }`}
              >
                <Icons.AI className="w-4 h-4 text-[#F5A623]" />
                <span>AI Chat Assistant</span>
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-[#F5A623]/15 text-[#F5A623] border border-[#F5A623]/25 rounded-md font-bold uppercase tracking-wider">
                  Beta
                </span>
              </button>
            </div>
          </div>
          */}

          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
            {activeMode === 'form' ? (
              /* ==================== FORM BUILDER MODE ==================== */
              <div className="p-6 md:p-10">
                {showSummary ? (
                  /* Form Summary Step */
                  <div className="space-y-6 animate-fade-in">
                    <div className="border-b border-slate-100 pb-5">
                      <h2 className="text-2xl font-bold text-[#1A1F2E] flex items-center">
                        <Icons.CheckCircle className="w-6 h-6 text-[#F5A623] mr-3" />
                        Verify Your Details
                      </h2>
                      <p className="text-sm text-slate-500 mt-1">
                        Please review the summary below before sending your support ticket.
                      </p>
                    </div>

                    <div className="bg-slate-50 rounded-2xl border border-slate-100 p-6 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Full Name</span>
                          <span className="text-slate-800 font-medium text-base">{name}</span>
                        </div>
                        <div>
                          <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Work Email</span>
                          <span className="text-slate-800 font-medium text-base">{email}</span>
                        </div>
                        <div>
                          <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Company</span>
                          <span className="text-slate-800 font-medium text-base">{company}</span>
                        </div>
                        <div>
                          <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Phone Number</span>
                          <span className="text-slate-800 font-medium text-base">{phone || 'Not provided'}</span>
                        </div>
                        <div>
                          <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Enquiry Type</span>
                          <span className="text-slate-800 font-medium text-base inline-flex items-center space-x-1.5 mt-0.5">
                            <span className="p-1 bg-[#1A1F2E]/10 rounded-md text-[#1A1F2E]">
                              {getEnquiryIcon(ENQUIRY_TYPES.find(t => t.id === enquiryType)?.icon || 'Mail')}
                            </span>
                            <span>{enquiryType}</span>
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Subject</span>
                          <span className="text-slate-800 font-medium text-base">{subject}</span>
                        </div>
                        <div>
                          <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Priority Level</span>
                          <span className={`inline-flex items-center mt-1 px-3 py-1 rounded-full text-xs font-bold ${
                            priority === 'Low' ? 'bg-slate-100 text-slate-700' :
                            priority === 'Medium' ? 'bg-amber-100 text-amber-800' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {priority}
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-slate-200 pt-4 mt-2">
                        <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Message Description</span>
                        <div className="bg-white border border-slate-200 rounded-xl p-4 text-slate-700 whitespace-pre-wrap text-sm leading-relaxed max-h-[200px] overflow-y-auto">
                          {message}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4">
                      <button
                        type="button"
                        onClick={() => setShowSummary(false)}
                        className="px-6 py-3 border border-slate-300 text-slate-700 font-semibold rounded-full hover:bg-slate-50 transition-all flex items-center space-x-2"
                      >
                        <Icons.ChevronLeft className="w-4 h-4" />
                        <span>Go Back & Edit</span>
                      </button>

                      <div className="flex items-center space-x-4">
                        <span className="hidden md:inline text-xs text-slate-400 font-medium">We typically respond within 1 business day</span>
                        <button
                          type="button"
                          onClick={handleFormSubmit}
                          disabled={isSending}
                          className="px-8 py-3.5 bg-[#1A1F2E] text-white font-semibold rounded-full hover:bg-[#252C3F] transition-all shadow-lg flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSending ? (
                            <>
                              <Icons.Spinner className="w-4 h-4 animate-spin text-[#F5A623]" />
                              <span>Sending Ticket...</span>
                            </>
                          ) : (
                            <>
                              <span>Confirm & Submit</span>
                              <Icons.ArrowRight className="w-4 h-4 text-[#F5A623]" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Form Input Steps */
                  <form onSubmit={(e) => { e.preventDefault(); if (isFormValid) setShowSummary(true); }} className="space-y-8">
                    {/* Section 1: Contact Info */}
                    <div>
                      <h3 className="text-lg font-bold text-[#1A1F2E] mb-4 flex items-center">
                        <span className="w-6 h-6 rounded-full bg-[#1A1F2E]/10 text-[#1A1F2E] flex items-center justify-center text-xs font-bold mr-2">1</span>
                        Contact Information
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name <span className="text-rose-500">*</span></label>
                          <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-800 placeholder-slate-400 focus:border-[#F5A623] focus:outline-none focus:ring-1 focus:ring-[#F5A623] transition-all bg-slate-50 focus:bg-white"
                            placeholder="Your full name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">Work Email <span className="text-rose-500">*</span></label>
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-800 placeholder-slate-400 focus:border-[#F5A623] focus:outline-none focus:ring-1 focus:ring-[#F5A623] transition-all bg-slate-50 focus:bg-white"
                            placeholder="you@company.com"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">Company Name <span className="text-rose-500">*</span></label>
                          <input
                            type="text"
                            required
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-800 placeholder-slate-400 focus:border-[#F5A623] focus:outline-none focus:ring-1 focus:ring-[#F5A623] transition-all bg-slate-50 focus:bg-white"
                            placeholder="Your company name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">Phone Number <span className="text-rose-500">*</span></label>
                          <input
                            type="tel"
                            required
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-800 placeholder-slate-400 focus:border-[#F5A623] focus:outline-none focus:ring-1 focus:ring-[#F5A623] transition-all bg-slate-50 focus:bg-white"
                            placeholder="e.g. +1 876-123-4567"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Enquiry Type Selector */}
                    <div>
                      <h3 className="text-lg font-bold text-[#1A1F2E] mb-4 flex items-center">
                        <span className="w-6 h-6 rounded-full bg-[#1A1F2E]/10 text-[#1A1F2E] flex items-center justify-center text-xs font-bold mr-2">2</span>
                        Select Enquiry Type
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {ENQUIRY_TYPES.map((type) => {
                          const isSelected = enquiryType === type.id;
                          return (
                            <button
                              key={type.id}
                              type="button"
                              onClick={() => setEnquiryType(type.id)}
                              className={`flex flex-col items-center justify-center p-4 rounded-2xl border text-center transition-all ${
                                isSelected
                                  ? 'border-[#F5A623] bg-[#1A1F2E] text-white shadow-md'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <span className={`p-2 rounded-xl mb-2 ${isSelected ? 'bg-white/10 text-[#F5A623]' : 'bg-slate-100 text-slate-600'}`}>
                                {getEnquiryIcon(type.icon)}
                              </span>
                              <span className="text-xs font-bold leading-tight">{type.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Helper Context Hint below selector */}
                      <div className="mt-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500 flex items-start animate-fade-in">
                        <Icons.Alert className="w-4 h-4 text-[#F5A623] mr-2.5 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="font-bold text-[#1A1F2E] block uppercase tracking-wider text-[10px] mb-0.5">Recommended Context</span>
                          {CONTEXT_HINTS[enquiryType]}
                        </div>
                      </div>
                    </div>

                    {/* Section 3 & 4: Subject and Priority in a grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Section 3: Dynamic Subject Dropdown */}
                      <div>
                        <h3 className="text-lg font-bold text-[#1A1F2E] mb-3.5 flex items-center">
                          <span className="w-6 h-6 rounded-full bg-[#1A1F2E]/10 text-[#1A1F2E] flex items-center justify-center text-xs font-bold mr-2">3</span>
                          Select Subject
                        </h3>
                        <div className="relative">
                          <select
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-800 appearance-none bg-slate-50 hover:border-slate-300 focus:border-[#F5A623] focus:outline-none focus:ring-1 focus:ring-[#F5A623] cursor-pointer transition-all pr-10"
                          >
                            {SUBJECTS_MAP[enquiryType].map((subOpt) => (
                              <option key={subOpt} value={subOpt}>
                                {subOpt}
                              </option>
                            ))}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            <Icons.ChevronDown className="w-4 h-4" />
                          </div>
                        </div>
                      </div>

                      {/* Section 4: Priority selector */}
                      <div>
                        <h3 className="text-lg font-bold text-[#1A1F2E] mb-3.5 flex items-center">
                          <span className="w-6 h-6 rounded-full bg-[#1A1F2E]/10 text-[#1A1F2E] flex items-center justify-center text-xs font-bold mr-2">4</span>
                          Select Priority
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                          {PRIORITIES.map((item) => {
                            const isSelected = priority === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setPriority(item.id)}
                                className={`py-3 px-4 border rounded-xl font-bold text-sm text-center transition-all ${
                                  isSelected
                                    ? item.id === 'Low'
                                      ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                                      : item.id === 'Medium'
                                      ? 'border-[#F5A623] bg-[#F5A623] text-white shadow-sm'
                                      : 'border-rose-500 bg-rose-500 text-white shadow-sm'
                                    : item.color
                                }`}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Section 5: Message Description */}
                    <div>
                      <h3 className="text-lg font-bold text-[#1A1F2E] mb-3 flex items-center">
                        <span className="w-6 h-6 rounded-full bg-[#1A1F2E]/10 text-[#1A1F2E] flex items-center justify-center text-xs font-bold mr-2">5</span>
                        Describe Your Issue <span className="text-rose-500">*</span>
                      </h3>
                      <textarea
                        required
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        className="w-full min-h-[150px] rounded-2xl border border-slate-200 px-4 py-3.5 text-slate-800 placeholder-slate-400 focus:border-[#F5A623] focus:outline-none focus:ring-1 focus:ring-[#F5A623] transition-all bg-slate-50 focus:bg-white text-sm leading-relaxed"
                        placeholder={`Please provide context. Tip: ${CONTEXT_HINTS[enquiryType]}`}
                      />
                    </div>

                    {/* Footer Actions */}
                    <div className="border-t border-slate-100 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="flex items-center space-x-2 text-slate-500 text-sm">
                        <Icons.Clock className="w-4 h-4 text-slate-400" />
                        <span>We typically respond within 1 business day.</span>
                      </div>
                      <button
                        type="submit"
                        disabled={!isFormValid}
                        className="w-full md:w-auto px-8 py-3.5 bg-[#1A1F2E] hover:bg-[#252C3F] text-white font-semibold rounded-full shadow-lg transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#1A1F2E]"
                      >
                        <span>Review Submission</span>
                        <Icons.Next className="w-4 h-4 text-[#F5A623]" />
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              /* ==================== AI CHAT ASSISTANT MODE ==================== */
              <div className="flex flex-col h-[650px] bg-slate-50 rounded-3xl overflow-hidden">
                {/* Chat Header */}
                <div className="p-4 bg-[#1A1F2E] border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-[#F5A623]/10 border border-[#F5A623]/30 rounded-xl flex items-center justify-center text-[#F5A623]">
                      <Icons.AI className="w-6 h-6 animate-pulse" />
                    </div>
                    <div className="ml-3">
                      <h4 className="font-bold text-white text-sm">Support Intake Chatbot</h4>
                      <p className="text-xs text-slate-400">Interactive Ticket Creator</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                    <span className="text-xs text-slate-300 font-semibold uppercase tracking-wider">Online</span>
                  </div>
                </div>

                {/* Message Log */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                  {chatMessages.map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                        <div className={`flex items-start max-w-[85%] ${isUser ? 'flex-row-reverse' : ''}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                            isUser ? 'bg-slate-300 text-slate-700 ml-2' : 'bg-[#1A1F2E] text-[#F5A623] mr-2 border border-[#F5A623]/20'
                          }`}>
                            {isUser ? <Icons.User className="w-4 h-4" /> : <Icons.AI className="w-4 h-4" />}
                          </div>
                          <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                            isUser
                              ? 'bg-[#1A1F2E] text-white rounded-tr-none'
                              : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none shadow-sm'
                          }`}>
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing Indicator */}
                  {isAiLoading && !aiSubmissionCompleted && (
                    <div className="flex justify-start">
                      <div className="flex items-center bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm space-x-1.5">
                        <span className="w-2 h-2 bg-[#1A1F2E]/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-[#1A1F2E]/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-[#1A1F2E]/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}

                  {/* Submission Success Box inside chat log */}
                  {aiSubmissionCompleted && submittedData && (
                    <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-2xl shadow-sm text-center space-y-3 animate-fade-in max-w-lg mx-auto">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600">
                        <Icons.Check className="w-6 h-6" />
                      </div>
                      <h4 className="font-extrabold text-emerald-950 text-base">Intake Form Submitted!</h4>
                      <p className="text-xs text-emerald-800 leading-normal">
                        Your support ticket was processed. A confirmation has been logged.
                      </p>
                      <div className="bg-white border border-emerald-200/50 rounded-xl p-3.5 text-left text-xs space-y-1.5 text-slate-700">
                        <div><strong>Ticket Holder:</strong> {submittedData.name}</div>
                        <div><strong>Enquiry:</strong> {submittedData.enquiry_type} ({submittedData.subject})</div>
                        <div><strong>Priority:</strong> {submittedData.priority}</div>
                        <div><strong>Email:</strong> {submittedData.email}</div>
                        <div><strong>Company:</strong> {submittedData.company}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAiSubmissionCompleted(false);
                          setSubmittedData(null);
                          setChatMessages([
                            {
                              role: 'model',
                              text: `Hello! I can help you draft another ticket. Let me know your Name, Email, and Company to start.`,
                              timestamp: Date.now()
                            }
                          ]);
                        }}
                        className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline block mx-auto"
                      >
                        Create another ticket
                      </button>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input Area */}
                <div className="p-4 bg-white border-t border-slate-200 flex flex-col">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()}
                      disabled={isAiLoading || aiSubmissionCompleted}
                      placeholder={
                        aiSubmissionCompleted
                          ? "Ticket submitted! Chat is locked."
                          : "Describe your issue or answer JamBot's questions..."
                      }
                      className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] focus:border-[#F5A623] transition-all bg-slate-50 focus:bg-white disabled:opacity-60"
                    />
                    <button
                      onClick={handleSendChatMessage}
                      disabled={isAiLoading || aiSubmissionCompleted || !chatInput.trim()}
                      className="bg-[#1A1F2E] hover:bg-[#252C3F] text-white px-5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      <Icons.Send className="w-5 h-5 text-[#F5A623]" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
                    <span>We typically respond within 1 business day.</span>
                    <span>AI Assistant will gather and build form.</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
