import React from 'react';
import { Icons } from '../components/Icons';

interface TermsOfServiceProps {
  onBack: () => void;
}

export const TermsOfService: React.FC<TermsOfServiceProps> = ({ onBack }) => {
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
          <h1 className="text-3xl font-bold">Terms of Service</h1>
          <p className="text-gray-300 mt-2">Last updated: December 9, 2025</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8 space-y-8">
          
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              By accessing and using Payroll Jam ("the Service"), you accept and agree to be bound by the terms and 
              provision of this agreement. If you do not agree to these terms, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Description of Service</h2>
            <p className="text-gray-700 leading-relaxed">
              Payroll Jam provides cloud-based payroll management software for businesses in Jamaica. The Service 
              includes features for employee management, payroll processing, tax calculations (NIS, NHT, PAYE, 
              Education Tax), leave management, and reporting.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. User Accounts</h2>
            <div className="text-gray-700 leading-relaxed space-y-4">
              <p><strong>3.1 Account Creation:</strong> You must provide accurate and complete information when creating an account.</p>
              <p><strong>3.2 Account Security:</strong> You are responsible for maintaining the confidentiality of your account credentials.</p>
              <p><strong>3.3 Account Responsibility:</strong> You are responsible for all activities that occur under your account.</p>
              <p><strong>3.4 Account Termination:</strong> We reserve the right to terminate accounts that violate these terms.</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Subscription and Payment</h2>
            <div className="text-gray-700 leading-relaxed space-y-4">
              <p><strong>4.1 Subscription Plans:</strong> We offer various subscription plans (Free, Starter, Pro, Enterprise, Reseller).</p>
              <p><strong>4.2 Payment Terms:</strong> Subscriptions are billed monthly or annually in advance. Payment is due immediately upon subscription.</p>
              <p><strong>4.3 Payment Methods:</strong> We accept credit cards and direct bank deposits.</p>
              <p><strong>4.4 Refunds:</strong> Refunds are provided on a case-by-case basis within 30 days of initial purchase.</p>
              <p><strong>4.5 Price Changes:</strong> We reserve the right to change our prices with 30 days notice.</p>
              <p><strong>4.6 Failed Payments:</strong> If payment fails, your account may be suspended until payment is received.</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. User Responsibilities</h2>
            <p className="text-gray-700 leading-relaxed mb-4">You agree to:</p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Provide accurate employee and payroll information</li>
              <li>Comply with all applicable employment and tax laws in Jamaica</li>
              <li>Verify all payroll calculations before processing payments</li>
              <li>Keep your software and browser up to date</li>
              <li>Not share your account with unauthorized users</li>
              <li>Not use the Service for any illegal purposes</li>
              <li>Not attempt to reverse engineer or hack the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Data and Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              Your use of the Service is also governed by our Privacy Policy. We collect, use, and protect your data 
              as described in the Privacy Policy. You retain ownership of all data you input into the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Service Availability</h2>
            <p className="text-gray-700 leading-relaxed">
              We strive to provide 99.9% uptime but cannot guarantee uninterrupted access to the Service. We are not 
              liable for any downtime, service interruptions, or data loss. We recommend maintaining backup records of 
              critical payroll data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Limitation of Liability</h2>
            <p className="text-gray-700 leading-relaxed">
              Payroll Jam provides software tools to assist with payroll management. However, you are ultimately 
              responsible for the accuracy of your payroll, compliance with tax laws, and timely payment to employees 
              and tax authorities. We are not liable for any errors, penalties, or damages resulting from your use of 
              the Service. Our total liability shall not exceed the amount you paid for the Service in the past 12 months.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Intellectual Property</h2>
            <p className="text-gray-700 leading-relaxed">
              All content, features, and functionality of the Service (including but not limited to software, text, 
              graphics, logos, and images) are owned by Payroll Jam and are protected by copyright, trademark, and 
              other intellectual property laws.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Termination</h2>
            <p className="text-gray-700 leading-relaxed">
              You may cancel your subscription at any time from your account settings. Upon cancellation, you will 
              continue to have access until the end of your current billing period. We may terminate or suspend your 
              account immediately for violations of these terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Governing Law</h2>
            <p className="text-gray-700 leading-relaxed">
              These terms shall be governed by and construed in accordance with the laws of Jamaica. Any disputes 
              arising under these terms shall be subject to the exclusive jurisdiction of the courts of Jamaica.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Changes to Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to modify these terms at any time. We will notify users of significant changes via 
              email. Continued use of the Service after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Contact Information</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have questions about these Terms of Service, please contact us:
            </p>
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-700"><strong>Email:</strong> support@payrolljam.com</p>
              <p className="text-gray-700 mt-2"><strong>Address:</strong> Kingston, Jamaica</p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};
