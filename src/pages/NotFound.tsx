import React from 'react';
import { Icons } from '../components/Icons';

interface NotFoundProps {
  onGoHome: () => void;
}

export const NotFound: React.FC<NotFoundProps> = ({ onGoHome }) => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl text-center">
        <div className="mb-8">
          <h1 className="text-9xl font-extrabold text-jam-black">404</h1>
          <div className="mt-4">
            <h2 className="text-3xl font-bold text-gray-900">Page Not Found</h2>
            <p className="mt-2 text-lg text-gray-600">
              Sorry, we couldn't find the page you're looking for.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            onClick={onGoHome}
            className="inline-flex items-center px-6 py-3 rounded-lg bg-jam-black text-white font-semibold hover:bg-gray-800 transition-all focus:outline-none focus:ring-2 focus:ring-jam-orange focus:ring-offset-2"
          >
            <Icons.Dashboard className="w-5 h-5 mr-2" />
            Go to Home
          </button>
          
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center px-6 py-3 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-all"
          >
            <Icons.Back className="w-5 h-5 mr-2" />
            Go Back
          </button>
        </div>

        <div className="mt-12 text-sm text-gray-500">
          <p>If you believe this is an error, please contact support.</p>
        </div>
      </div>
    </div>
  );
};
