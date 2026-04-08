import React from 'react';
import { Icons } from '../../../components/Icons';

export const PayRunProgressBar: React.FC<{ currentStep: 'SETUP' | 'DRAFT' | 'FINALIZE' }> = ({ currentStep }) => {
  const steps = [
    { id: 'SETUP', label: 'Select Period', icon: Icons.Calendar },
    { id: 'DRAFT', label: 'Enter Details', icon: Icons.FileEdit },
    { id: 'FINALIZE', label: 'Finalize', icon: Icons.Check }
  ] as const;

  const currentIndex = steps.findIndex(step => step.id === currentStep);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          const isActive = index === currentIndex;
          const isCompleted = index < currentIndex;

          return (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                    isActive
                      ? 'bg-jam-orange border-jam-orange text-jam-black'
                      : isCompleted
                        ? 'bg-green-600 border-green-600 text-white'
                        : 'bg-gray-100 border-gray-300 text-gray-400'
                  }`}
                >
                  {isCompleted ? <Icons.Check className="w-6 h-6" /> : <StepIcon className="w-6 h-6" />}
                </div>
                <p
                  className={`mt-2 text-sm font-medium ${
                    isActive ? 'text-jam-orange' : isCompleted ? 'text-green-600' : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </p>
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-4 mb-8 transition-all ${index < currentIndex ? 'bg-green-600' : 'bg-gray-300'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
