import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import { Employee } from '../types';
import { toast } from 'sonner';

interface EmployeeAccountSetupProps {
  employee: Employee;
  companyName: string;
  onComplete: (password: string) => void;
  onCancel: () => void;
}

export const EmployeeAccountSetup: React.FC<EmployeeAccountSetupProps> = ({
  employee,
  companyName,
  onComplete,
  onCancel
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validatePassword = (pwd: string): { valid: boolean; message: string } => {
    if (pwd.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    if (!/[A-Z]/.test(pwd)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!/[a-z]/.test(pwd)) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!/[0-9]/.test(pwd)) {
      return { valid: false, message: 'Password must contain at least one number' };
    }
    return { valid: true, message: 'Password is strong' };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    const validation = validatePassword(password);
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    setIsSubmitting(true);
    try {
      onComplete(password);
    } catch (error) {
      toast.error('Failed to set up account');
      setIsSubmitting(false);
    }
  };

  const passwordStrength = validatePassword(password);

  return (
    <div className="min-h-screen bg-gradient-to-br from-jam-orange via-yellow-400 to-jam-orange flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-jam-orange rounded-full mb-4">
            <Icons.User className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to {companyName}!</h1>
          <p className="text-gray-600">Set up your employee account</p>
        </div>

        {/* Employee Info */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-jam-orange rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-lg">
                  {employee.firstName.charAt(0)}{employee.lastName.charAt(0)}
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {employee.firstName} {employee.lastName}
              </p>
              <p className="text-sm text-gray-500 truncate">{employee.email}</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Create Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jam-orange focus:border-transparent"
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <Icons.EyeOff className="w-5 h-5" /> : <Icons.Eye className="w-5 h-5" />}
              </button>
            </div>
            {password && (
              <p className={`text-xs mt-1 ${passwordStrength.valid ? 'text-green-600' : 'text-red-600'}`}>
                {passwordStrength.message}
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jam-orange focus:border-transparent"
                placeholder="Confirm your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <Icons.EyeOff className="w-5 h-5" /> : <Icons.Eye className="w-5 h-5" />}
              </button>
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
            )}
          </div>

          {/* Password Requirements */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-xs font-medium text-blue-900 mb-2">Password Requirements:</p>
            <ul className="text-xs space-y-2">
              <li className="flex items-center">
                {password.length >= 8 ? (
                  <Icons.CheckCircle className="w-4 h-4 mr-2 text-green-600 flex-shrink-0" />
                ) : (
                  <div className="w-4 h-4 mr-2 rounded-full border-2 border-gray-400 flex-shrink-0" />
                )}
                <span className={password.length >= 8 ? 'text-green-700 font-medium' : 'text-gray-600'}>
                  At least 8 characters
                </span>
              </li>
              <li className="flex items-center">
                {/[A-Z]/.test(password) ? (
                  <Icons.CheckCircle className="w-4 h-4 mr-2 text-green-600 flex-shrink-0" />
                ) : (
                  <div className="w-4 h-4 mr-2 rounded-full border-2 border-gray-400 flex-shrink-0" />
                )}
                <span className={/[A-Z]/.test(password) ? 'text-green-700 font-medium' : 'text-gray-600'}>
                  One uppercase letter (A-Z)
                </span>
              </li>
              <li className="flex items-center">
                {/[a-z]/.test(password) ? (
                  <Icons.CheckCircle className="w-4 h-4 mr-2 text-green-600 flex-shrink-0" />
                ) : (
                  <div className="w-4 h-4 mr-2 rounded-full border-2 border-gray-400 flex-shrink-0" />
                )}
                <span className={/[a-z]/.test(password) ? 'text-green-700 font-medium' : 'text-gray-600'}>
                  One lowercase letter (a-z)
                </span>
              </li>
              <li className="flex items-center">
                {/[0-9]/.test(password) ? (
                  <Icons.CheckCircle className="w-4 h-4 mr-2 text-green-600 flex-shrink-0" />
                ) : (
                  <div className="w-4 h-4 mr-2 rounded-full border-2 border-gray-400 flex-shrink-0" />
                )}
                <span className={/[0-9]/.test(password) ? 'text-green-700 font-medium' : 'text-gray-600'}>
                  One number (0-9)
                </span>
              </li>
            </ul>
          </div>

          {/* Buttons */}
          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !password || !confirmPassword || password !== confirmPassword || !passwordStrength.valid}
              className="flex-1 px-6 py-3 bg-jam-orange text-white rounded-lg hover:bg-yellow-600 font-medium transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Setting up...' : 'Create Account'}
            </button>
          </div>
        </form>

        {/* Footer */}
        <p className="text-xs text-center text-gray-500 mt-6">
          By creating an account, you agree to complete your employee onboarding and provide accurate information.
        </p>
      </div>
    </div>
  );
};

