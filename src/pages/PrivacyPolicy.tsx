import React from 'react';
import { Icons } from '../components/Icons';

interface PrivacyPolicyProps {
  onBack: () => void;
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-jam-black text-white">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <button 
            onClick={onBack}
            className="flex items-center text-white hover:text-jam-orange transition-colors mb-4"
          >
            <Icons.ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="text-gray-300 mt-2">Last updated: December 9, 2025</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8 space-y-8">
          
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Introduction</h2>
            <p className="text-gray-700 leading-relaxed">
              Welcome to Payroll Jam. We respect your privacy and are committed to protecting your personal data. 
              This privacy policy will inform you about how we look after your personal data when you visit our 
              website and use our services, and tell you about your privacy rights and how the law protects you.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Information We Collect</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We collect and process the following types of information:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li><strong>Identity Data:</strong> First name, last name, username, or similar identifier</li>
              <li><strong>Contact Data:</strong> Email address, telephone numbers, physical address</li>
              <li><strong>Financial Data:</strong> Bank account details, payment card details</li>
              <li><strong>Transaction Data:</strong> Details about payments to and from you</li>
              <li><strong>Technical Data:</strong> IP address, browser type, time zone setting, and other technology on devices used to access our services</li>
              <li><strong>Usage Data:</strong> Information about how you use our website and services</li>
              <li><strong>Employee Data:</strong> Information about your employees including names, addresses, tax information, and payroll details</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. How We Use Your Information</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We use your personal data for the following purposes:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>To provide and maintain our payroll services</li>
              <li>To process payments and prevent fraud</li>
              <li>To comply with legal and regulatory requirements</li>
              <li>To send you service-related communications</li>
              <li>To improve our services and develop new features</li>
              <li>To provide customer support</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Data Security</h2>
            <p className="text-gray-700 leading-relaxed">
              We have implemented appropriate security measures to prevent your personal data from being accidentally 
              lost, used, accessed in an unauthorized way, altered, or disclosed. We use industry-standard encryption 
              (SSL/TLS) to protect data in transit and at rest. Access to your personal data is limited to employees, 
              agents, contractors, and other third parties who have a business need to know.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Data Retention</h2>
            <p className="text-gray-700 leading-relaxed">
              We will only retain your personal data for as long as necessary to fulfill the purposes we collected it for, 
              including for the purposes of satisfying any legal, accounting, or reporting requirements. For payroll data, 
              we typically retain records for 7 years in accordance with Jamaican tax law requirements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Your Legal Rights</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Under certain circumstances, you have rights under data protection laws in relation to your personal data, including the right to:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Request access to your personal data</li>
              <li>Request correction of your personal data</li>
              <li>Request erasure of your personal data</li>
              <li>Object to processing of your personal data</li>
              <li>Request restriction of processing your personal data</li>
              <li>Request transfer of your personal data</li>
              <li>Withdraw consent</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Third-Party Services</h2>
            <p className="text-gray-700 leading-relaxed">
              We may share your data with trusted third-party service providers who assist us in operating our website, 
              conducting our business, or serving our users. These parties include payment processors, cloud hosting 
              providers, and email service providers. All third parties are required to respect the security of your 
              personal data and to treat it in accordance with the law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. International Transfers</h2>
            <p className="text-gray-700 leading-relaxed">
              Your data may be transferred to, and maintained on, computers located outside of Jamaica where data 
              protection laws may differ. We ensure that appropriate safeguards are in place to protect your data 
              in accordance with this privacy policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Changes to This Policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this privacy policy from time to time. We will notify you of any changes by posting the 
              new privacy policy on this page and updating the "Last updated" date at the top of this policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have any questions about this privacy policy or our privacy practices, please contact us at:
            </p>
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-700"><strong>Email:</strong> privacy@payrolljam.com</p>
              <p className="text-gray-700 mt-2"><strong>Address:</strong> Kingston, Jamaica</p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};
