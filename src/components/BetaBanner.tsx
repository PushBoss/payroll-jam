import React from 'react';

export const BetaBanner: React.FC = () => {
  return (
    <div className="bg-blue-600 text-white">
      <div className="mx-auto flex h-10 max-w-7xl items-center justify-between px-4 text-sm sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.2em]">
            Beta
          </span>
          <span className="text-xs font-medium sm:text-sm">
            You are using the Payroll-Jam beta experience.
          </span>
        </div>
      </div>
    </div>
  );
};
