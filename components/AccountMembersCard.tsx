import React, { useState, useEffect } from 'react';
import { getAccountMembers, removeMemberFromAccount, AccountMember } from '../services/inviteService';
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

  const handleRemoveMember = async (memberId: string, email: string) => {
    if (!confirm(`Remove ${email} from the team?`)) {
      return;
    }

    setRemoving(memberId);
    try {
      const result = await removeMemberFromAccount(accountId, memberId);
      if (result.success) {
        setMembers(members.filter((m) => m.id !== memberId));
        toast.success('Team member removed');
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
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Members</h3>

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
                  <span className="capitalize">{member.role}</span>
                  <span>•</span>
                  <span className="capitalize">{member.status}</span>
                </div>
              </div>

              {isAdmin && (
                <button
                  onClick={() => handleRemoveMember(member.id, member.email)}
                  disabled={removing === member.id}
                  className="ml-4 px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded disabled:text-gray-400 font-medium"
                >
                  {removing === member.id ? 'Removing...' : 'Remove'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
