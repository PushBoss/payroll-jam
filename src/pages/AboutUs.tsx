import React, { useEffect } from 'react';
import { Footer } from '../components/Footer';
import { Icons } from '../components/Icons';
import { PublicHeader } from '../components/PublicHeader';

interface AboutUsProps {
  onBack: () => void;
  onFeaturesClick?: () => void;
  onPricingClick?: () => void;
  onAboutClick?: () => void;
  onContactClick?: () => void;
  onLogin?: () => void;
  onSignup?: () => void;
  onPrivacyClick?: () => void;
  onTermsClick?: () => void;
}

const MAP_URL = 'https://maps.app.goo.gl/GLffCTeGnzoB6t2g9';

export const AboutUs: React.FC<AboutUsProps> = ({
  onBack,
  onFeaturesClick,
  onPricingClick,
  onAboutClick,
  onContactClick,
  onLogin,
  onSignup,
  onPrivacyClick,
  onTermsClick,
}) => {
  useEffect(() => {
    document.title = 'About Us | Payroll-Jam';
  }, []);

  const values = [
    {
      title: 'Built for Jamaica',
      text: 'Payroll-Jam is designed around Jamaican statutory payroll, local workflows, and the realities of growing teams here at home.',
      icon: Icons.Building,
    },
    {
      title: 'Compliance first',
      text: 'We help employers stay organized around PAYE, NIS, NHT, Education Tax, payslips, reports, and employee records.',
      icon: Icons.ShieldCheck,
    },
    {
      title: 'Practical support',
      text: 'Our goal is to make payroll less intimidating, with software and support that meet businesses where they are.',
      icon: Icons.Users,
    },
  ];

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <PublicHeader
        currentPage="about-us"
        onHomeClick={onBack}
        onFeaturesClick={onFeaturesClick}
        onPricingClick={onPricingClick}
        onAboutClick={onAboutClick || (() => {})}
        onContactClick={onContactClick}
        onLogin={onLogin}
        onSignup={onSignup}
      />

      <section className="bg-gray-50 pt-36 pb-16">
        <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-sm font-bold uppercase tracking-wide text-jam-orange">About Payroll-Jam</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl">
            Payroll software made for Jamaican businesses
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-gray-600">
            We are building a modern payroll platform that helps Jamaican employers run payroll, stay compliant, and support their teams with less manual work.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:px-8 lg:items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Why we exist</h2>
            <p className="mt-5 text-gray-600 leading-7">
              Payroll in Jamaica should not depend on scattered spreadsheets, repeated calculations, and last-minute compliance stress. Payroll-Jam brings payroll, employee records, reports, and operational tools into one focused system.
            </p>
            <p className="mt-4 text-gray-600 leading-7">
              Our work is grounded in a simple promise: help businesses save time while treating payroll accuracy, privacy, and local compliance as core product responsibilities.
            </p>
          </div>

          <div className="grid gap-4">
            {values.map(({ title, text, icon: Icon }) => (
              <div key={title} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-orange-50 p-3 text-jam-orange">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-gray-600">{text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-gray-200 bg-gray-50 py-16">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          <div className="lg:col-span-2">
            <h2 className="text-3xl font-bold text-gray-900">Where to find us</h2>
            <p className="mt-4 max-w-2xl text-gray-600 leading-7">
              We are based in Kingston, close to the University of the West Indies, Mona. Reach out if you want to discuss onboarding, Enterprise setup, or payroll support.
            </p>
          </div>
          <address className="rounded-xl border border-gray-200 bg-white p-6 not-italic shadow-sm">
            <p className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">Address</p>
            <a href={MAP_URL} target="_blank" rel="noopener noreferrer" className="block font-medium text-gray-900 hover:text-jam-orange">
              Building A, Aqueduct Flats
            </a>
            <a href={MAP_URL} target="_blank" rel="noopener noreferrer" className="mt-1 block text-gray-700 hover:text-jam-orange">
              University of the West Indies, Mona
            </a>
            <a href={MAP_URL} target="_blank" rel="noopener noreferrer" className="mt-1 block text-gray-700 hover:text-jam-orange">
              Kingston 7, Jamaica
            </a>
          </address>
        </div>
      </section>

      <section className="py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900">Ready to talk payroll?</h2>
          <p className="mt-4 text-gray-600">
            We can help you choose the right plan, set up your company, or discuss a custom Enterprise rollout.
          </p>
          <button
            onClick={onContactClick}
            className="mt-8 rounded-full bg-jam-black px-8 py-3 font-bold text-white shadow-lg transition-all hover:bg-gray-800"
          >
            Contact Us
          </button>
        </div>
      </section>

      <Footer
        onFeaturesClick={onFeaturesClick}
        onPricingClick={onPricingClick}
        onAboutClick={onAboutClick}
        onPrivacyClick={onPrivacyClick}
        onTermsClick={onTermsClick}
      />
    </div>
  );
};
