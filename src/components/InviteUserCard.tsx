import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Icons } from './Icons';
import { inviteUserToAccount, searchUserByEmail, MemberRole } from '../features/employees/inviteService';
import { toast } from 'sonner';

interface InviteUserCardProps {
  accountId: string;
  onInviteSent?: () => void;
}

export const InviteUserCard: React.FC<InviteUserCardProps> = ({ accountId, onInviteSent }) => {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('admin');
  const [isSearching, setIsSearching] = useState(false);
  const [userFound, setUserFound] = useState(false);
  const [searchResult, setSearchResult] = useState<{ exists: boolean; isReseller: boolean } | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleSearch = async () => {
    if (!email.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    setIsSearching(true);
    setSearchResult(null);
    try {
      const { exists, role } = await searchUserByEmail(email);
      const isReseller = role === 'RESELLER' || role === 'SUPER_ADMIN';

      setSearchResult({ exists, isReseller });

      if (exists) {
        if (isReseller) {
          toast.success('User found (Reseller)! Ready to invite.');
        } else {
          toast.warning('User found! They manage another company and must upgrade to a Reseller plan to accept this invitation.');
        }
      } else {
        toast.info('User not on the platform yet. They will receive an email to sign up and manage your company.');
      }

      setUserFound(true);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Failed to search for user');
      setUserFound(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleInvite = async () => {
    if (!email.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    if (!user?.id) {
      toast.error('You must be logged in to send invitations');
      return;
    }

    setIsSending(true);
    try {
      const result = await inviteUserToAccount({
        accountId,
        email: email.trim(),
        role,
        invitedBy: user.id,
      });

      if (result.success) {
        if (result.requiresUpgrade) {
          toast.warning('Invitation sent! Note: This user manages another company and will need to upgrade to the Reseller plan to accept.', {
            duration: 6000
          });
        } else {
          toast.success('Invitation sent successfully!');
        }
        setEmail('');
        setUserFound(false);
        setRole('admin');
        if (onInviteSent) {
          onInviteSent();
        }
      } else {
        toast.error(result.error || 'Failed to send invitation');
      }
    } catch (error) {
      console.error('Invite error:', error);
      toast.error('Failed to send invitation');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Invite Team Member</h3>

      <div className="space-y-4">
        {/* Email Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="user@example.com"
              disabled={isSearching || isSending}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-jam-orange disabled:bg-gray-100"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching || isSending || !email.trim()}
              className="px-4 py-2 bg-jam-black text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-400 font-medium"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* User Found Status */}
        {userFound && searchResult && (
          <div className={`p-4 rounded-xl text-sm border transition-all animate-fade-in ${!searchResult.exists
            ? 'bg-blue-50 border-blue-100 text-blue-700'
            : searchResult.isReseller
              ? 'bg-green-50 border-green-100 text-green-700'
              : 'bg-amber-50 border-amber-100 text-amber-700'
            }`}>
            {!searchResult.exists && (
              <div className="flex items-start">
                <Icons.Mail className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold">New User Alias</p>
                  <p className="opacity-90">User not on the platform. They will be invited to signup and can manage your company as an alias.</p>
                </div>
              </div>
            )}
            {searchResult.exists && searchResult.isReseller && (
              <div className="flex items-start">
                <Icons.CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold">Licensed Reseller Found</p>
                  <p className="opacity-90">This user is a Reseller partner and is ready to be invited to manage your account.</p>
                </div>
              </div>
            )}
            {searchResult.exists && !searchResult.isReseller && (
              <div className="flex items-start">
                <Icons.Alert className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold">Upgrade Required</p>
                  <p className="opacity-90">This user has an existing account but is not a Reseller. They will need to upgrade their plan to manage multiple companies.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Role Selection */}
        {userFound && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
              disabled={isSending}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-jam-orange disabled:bg-gray-100"
            >
              <option value="admin">Admin - Full access to all settings</option>
              <option value="manager">Manager - View payslips and reports</option>
            </select>
          </div>
        )}

        {/* Invite Button */}
        {userFound && (
          <button
            onClick={handleInvite}
            disabled={isSending}
            className="w-full px-4 py-2 bg-jam-orange text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-400 font-medium"
          >
            {isSending ? 'Sending Invitation...' : 'Send Invitation'}
          </button>
        )}

        {/* Direct Invite Button (skip search for faster flow) */}
        {!userFound && email.trim() && (
          <button
            onClick={handleInvite}
            disabled={isSending}
            className="w-full px-4 py-2 bg-jam-orange text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-400 font-medium"
          >
            {isSending ? 'Sending Invitation...' : 'Send Invitation'}
          </button>
        )}
      </div>
    </div>
  );
};
