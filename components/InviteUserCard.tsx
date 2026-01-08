import React, { useState } from 'react';
import { inviteUserToAccount, searchUserByEmail, MemberRole } from '../services/inviteService';
import { toast } from 'sonner';

interface InviteUserCardProps {
  accountId: string;
  onInviteSent?: () => void;
}

export const InviteUserCard: React.FC<InviteUserCardProps> = ({ accountId, onInviteSent }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('manager');
  const [isSearching, setIsSearching] = useState(false);
  const [userFound, setUserFound] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleSearch = async () => {
    if (!email.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    setIsSearching(true);
    try {
      const { exists } = await searchUserByEmail(email);
      if (exists) {
        toast.success('User found!');
      } else {
        toast.info('User not on the platform yet. They will receive an email invite.');
      }
      // Always allow proceeding with the invite, regardless of whether they exist locally
      setUserFound(true); 
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Failed to search for user');
    } finally {
      setIsSearching(false);
    }
  };

  const handleInvite = async () => {
    if (!email.trim() || !userFound) {
      toast.error('Please search and verify the user first');
      return;
    }

    setIsSending(true);
    try {
      const result = await inviteUserToAccount({
        accountId,
        email: email.trim(),
        role,
        invitedBy: 'current-user', // Will be replaced with actual user ID
      });

      if (result.success) {
        toast.success('Invitation sent successfully!');
        setEmail('');
        setUserFound(false);
        setRole('manager');
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
        {userFound && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            ✓ User found and ready to invite
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
              <option value="manager">Manager - View payslips and reports</option>
              <option value="admin">Admin - Full access to all settings</option>
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
      </div>
    </div>
  );
};
