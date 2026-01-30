import React, { useState, useEffect } from 'react';
import { getAccountMembers, removeMemberFromAccount, resendInvitation, AccountMember } from '../services/inviteService';
import { toast } from 'sonner';

interface AccountMembersCardProps {
  accountId: string;
  isAdmin: boolean;
  refreshTrigger?: number;
}

export const AccountMembersCard: React.FC<AccountMembersCardProps> = ({
  accountId,
  isAdmin,
  refreshTrigger = 0,
}) => {
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  useEffect(() => {
    const fetchMembers = async () => {
      setLoading(true);
      try {
        const memberData = await getAccountMembers(accountId);
        setMembers(memberData);
      } catch (error) {
        console.error('Error fetching members:', error);
        toast.error('Failed to load team members');
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, [accountId, refreshTrigger]);

  const handleResendInvite = async (memberId: string) => {
    setResending(memberId);
    try {
      const result = await resendInvitation(memberId);
      if (result.success) {
        toast.success('Invitation resent successfully');
      } else {
        toast.error(result.error || 'Failed to resend invitation');
      }
    } catch (error) {
      console.error('Error resending invite:', error);
      toast.error('Failed to resend invitation');
    } finally {
      setResending(null);
    }
  };

  const handleRemoveMember = async (memberId: string, email: string, status?: string) => {
    const action = status === 'pending' ? 'Cancel invitation for' : 'Remove';
    if (!confirm(`${action} ${email}?`)) {
      return;
    }

    setRemoving(memberId);
    try {
      const result = await removeMemberFromAccount(accountId, memberId);
      if (result.success) {
        setMembers(members.filter((m) => m.id !== memberId));
        toast.success(status === 'pending' ? 'Invitation cancelled' : 'Team member removed');
      } else {
        toast.error(result.error || 'Failed to remove member');
      }
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Failed to remove member');
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Members</h3>
        <div className="text-center py-4 text-gray-500">Loading team members...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Team Members</h3>
        <div className="px-3 py-1 bg-gray-100 rounded-full border border-gray-200">
          <span className="text-xs font-bold text-gray-600 uppercase">
            {members.length} / 5 Seats Used
          </span>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No team members invited yet</p>
          <p className="text-sm text-gray-400 mt-2">Invite someone to collaborate</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div className="flex-1">
                <p className="font-medium text-gray-900">{member.email}</p>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="capitalize">
                    {member.role?.toUpperCase() === 'RESELLER' ? 'Reseller' :
                      member.role?.toUpperCase() === 'EMPLOYEE' ? 'Team member (alias)' :
                        member.role}
                  </span>
                  <span>•</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${member.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                    }`}>
                    {member.status}
                  </span>
                </div>
              </div>

              {isAdmin && (
                <div className="flex items-center">
                  {member.status === 'pending' && (
                    <button
                      onClick={() => handleResendInvite(member.id)}
                      disabled={resending === member.id}
                      className="ml-4 px-3 py-1 text-sm text-jam-orange hover:bg-orange-50 rounded disabled:text-gray-400 font-medium border border-jam-orange hover:border-jam-orange transition-colors"
                    >
                      {resending === member.id ? 'Sending...' : 'Resend Invite'}
                    </button>
                  )}

                  <button
                    onClick={() => handleRemoveMember(member.id, member.email, member.status)}
                    disabled={removing === member.id}
                    className={`ml-4 px-3 py-1 text-sm rounded disabled:text-gray-400 font-medium transition-colors border ${member.status === 'pending'
                      ? 'text-gray-600 border-gray-300 hover:bg-gray-100 hover:text-gray-800'
                      : 'text-red-600 border-transparent hover:bg-red-50'
                      }`}
                  >
                    {removing === member.id
                      ? (member.status === 'pending' ? 'Cancelling...' : 'Removing...')
                      : (member.status === 'pending' ? 'Cancel Invite' : 'Remove')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
