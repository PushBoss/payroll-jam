import React from 'react';
import { GlobalConfig } from '../core/types';

interface SupportWidgetProps {
  config?: GlobalConfig['supportWidget'];
}

export const SupportWidget: React.FC<SupportWidgetProps> = ({ config }) => {
  if (!config?.enabled || !config.whatsappUrl) return null;

  const positionClass = {
    'top-left': 'top-5 left-5',
    'top-right': 'top-5 right-5',
    'bottom-left': 'bottom-5 left-5',
    'bottom-right': 'bottom-5 right-5',
  }[config.position || 'bottom-right'];

  return (
    <>
      {config.customCss && <style>{config.customCss}</style>}
      <a
        href={config.whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`payroll-jam-support-widget fixed ${positionClass} z-[90] inline-flex items-center gap-2 rounded-full bg-green-500 px-4 py-3 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105 hover:bg-green-600 no-print`}
        aria-label="Contact support on WhatsApp"
      >
        <span className="text-lg leading-none">WA</span>
        <span>Support</span>
      </a>
    </>
  );
};
