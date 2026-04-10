import React, { useState, useRef } from 'react';
import { User } from '../core/types';
import { Icons } from '../components/Icons';
import { toast } from 'sonner';
import { supabaseService } from '../services/supabaseService';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';

interface ProfileProps {
  user: User;
  onUpdate: (user: User) => void;
}

export const Profile: React.FC<ProfileProps> = ({ user, onUpdate }) => {
  const { logout } = useAuth();
  const [formData, setFormData] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpdatePassword = async () => {
    if (newPassword.trim().length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      if (!supabase) {
        throw new Error('Supabase not initialized');
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword.trim()
      });

      if (error) throw error;

      toast.success('Password updated successfully');
      setNewPassword('');
    } catch (error: any) {
      console.error('Password update failed:', error);
      toast.error(error.message || 'Failed to update password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    setUploadingImage(true);

    try {
      if (!supabase) {
        throw new Error('Supabase not initialized');
      }

      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = fileName; // No need for nested 'avatars/' folder inside 'avatars' bucket

      console.log('🚀 Uploading image:', {
        bucket: 'avatars',
        path: filePath,
        size: file.size,
        type: file.type
      });

      // Upload to Supabase Storage
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type // explicitly set content type
        });

      if (uploadError) {
        console.error('❌ Supabase Storage upload error:', uploadError);
        throw uploadError;
      }

      console.log('✅ Upload successful:', uploadData);

      // Get public URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl;
      setAvatarUrl(publicUrl);

      // Update user profile in database
      const updatedUser = { ...user, avatarUrl: publicUrl };
      await supabaseService.saveUser(updatedUser);
      onUpdate(updatedUser);

      toast.success('Profile photo updated successfully!');
    } catch (error: any) {
      console.error('Error uploading image:', error);
      toast.error(error.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    if (!avatarUrl) return;

    try {
      setUploadingImage(true);

      // Update user profile to remove avatar
      const updatedUser = { ...user, avatarUrl: undefined };
      await supabaseService.saveUser(updatedUser);
      onUpdate(updatedUser);

      setAvatarUrl('');
      toast.success('Profile photo removed');
    } catch (error: any) {
      console.error('Error removing image:', error);
      toast.error('Failed to remove image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        toast.error('Name is required');
        setIsLoading(false);
        return;
      }

      if (!formData.email.trim()) {
        toast.error('Email is required');
        setIsLoading(false);
        return;
      }

      // Update user profile
      const updatedUser: User = {
        ...user,
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || undefined,
      };

      await supabaseService.saveUser(updatedUser);

      // Reload user from Supabase to confirm save
      const savedUser = await supabaseService.getUserByEmail(updatedUser.email);
      if (savedUser) {
        onUpdate(savedUser);
        toast.success('Profile updated successfully!');
      } else {
        onUpdate(updatedUser);
        toast.success('Profile updated locally!');
      }
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = () => {
    return formData.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'U';
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Please type "DELETE" to confirm');
      return;
    }

    setIsDeleting(true);
    try {
      const success = await supabaseService.deleteAccount(
        user.id,
        user.role,
        user.companyId
      );

      if (success) {
        toast.success('Account deleted successfully');

        // Clear local storage
        if (typeof window !== 'undefined') {
          localStorage.clear();
        }

        // Logout and redirect
        await logout();

        // Redirect to home page
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
      } else {
        toast.error('Failed to delete account. Please contact support.');
        setIsDeleting(false);
      }
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast.error(error.message || 'Failed to delete account');
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
        <p className="text-gray-600 mt-1">Manage your personal information and profile photo</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {/* Profile Photo Section */}
        <div className="mb-8 pb-8 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Photo</h2>
          <div className="flex items-center space-x-6">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={formData.name}
                  className="w-24 h-24 rounded-full object-cover border-2 border-gray-200"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-jam-yellow text-jam-black flex items-center justify-center font-bold text-2xl border-2 border-gray-200">
                  {getInitials()}
                </div>
              )}
              {uploadingImage && (
                <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                  <Icons.Refresh className="w-8 h-8 text-white animate-spin" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="px-4 py-2 bg-jam-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <Icons.Upload className="w-4 h-4 mr-2" />
                  Upload Photo
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    disabled={uploadingImage}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                JPG, PNG or GIF. Max size 2MB.
              </p>
            </div>
          </div>
        </div>

        {/* Profile Information Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Personal Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jam-orange focus:border-jam-orange"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jam-orange focus:border-jam-orange"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(876) 123-4567"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jam-orange focus:border-jam-orange"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role
              </label>
              <input
                type="text"
                value={user.role}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-jam-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isLoading ? (
                <>
                  <Icons.Refresh className="w-5 h-5 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Icons.Save className="w-5 h-5 mr-2" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>

        {/* Password Section */}
        <div className="mt-8 pt-8 border-t border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Password</h2>
          <p className="text-sm text-gray-600 mb-4">Set a new password for your account.</p>

          <div className="max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Password
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-jam-orange focus:border-jam-orange pr-12"
                placeholder="••••••••"
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
              >
                {showNewPassword ? (
                  <Icons.EyeOff className="w-5 h-5" />
                ) : (
                  <Icons.Eye className="w-5 h-5" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Minimum 6 characters.</p>

            <div className="mt-4">
              <button
                type="button"
                onClick={handleUpdatePassword}
                disabled={isUpdatingPassword || newPassword.trim().length < 6}
                className="px-6 py-2 bg-jam-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {isUpdatingPassword ? (
                  <>
                    <Icons.Refresh className="w-5 h-5 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Icons.Save className="w-5 h-5 mr-2" />
                    Update Password
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Delete Account Section */}
        <div className="mt-8 pt-8 border-t border-red-200">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Danger Zone</h2>
          <p className="text-sm text-gray-600 mb-4">
            Once you delete your account, there is no going back. Please be certain.
          </p>

          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center"
            >
              <Icons.Trash className="w-4 h-4 mr-2" />
              Delete Account
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-red-900 mb-2">
                  This action cannot be undone. This will permanently delete:
                </p>
                <ul className="text-sm text-red-700 list-disc list-inside space-y-1 ml-2">
                  <li>Your account and profile</li>
                  {user.role === 'OWNER' && (
                    <>
                      <li>Your company and all company data</li>
                      <li>All employees and their records</li>
                      <li>All payroll history and pay runs</li>
                      <li>All subscriptions and payment history</li>
                    </>
                  )}
                  <li>All other associated data</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-red-900 mb-2">
                  Type <span className="font-mono font-bold">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-4 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || deleteConfirmText !== 'DELETE'}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isDeleting ? (
                    <>
                      <Icons.Refresh className="w-4 h-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Icons.Trash className="w-4 h-4 mr-2" />
                      Yes, Delete My Account
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                  disabled={isDeleting}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
