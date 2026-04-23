import React from 'react';

export const AppLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="flex flex-col items-center">
      <div className="w-12 h-12 border-4 border-jam-orange border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-gray-500 font-medium">Loading...</p>
    </div>
  </div>
);
