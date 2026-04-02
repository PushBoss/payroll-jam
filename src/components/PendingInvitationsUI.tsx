import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { AccountMember } from '../features/employees/inviteService';

type PendingInvitation = AccountMember & { company_name?: string; inviter_name?: string; company_plan?: string };

interface PendingInvitationsUIProps {
  invitations: PendingInvitation[];
  onInvitationsAccepted: (invitations: PendingInvitation[]) => void;
  onSkip: () => void;
}

export const PendingInvitationsUI: React.FC<PendingInvitationsUIProps> = ({
  invitations,
  onInvitationsAccepted,
  onSkip,
}) => {
  const [selectedInvitations, setSelectedInvitations] = useState<Set<string>>(
    invitations.length === 1 ? new Set([invitations[0].id]) : new Set()
  );
  const [isProcessing, setIsProcessing] = useState(false);

  // Auto-accept if only one invitation
  React.useEffect(() => {
    if (invitations.length === 1) {
      handleAccept();
    }
  }, []);

  const handleSelectInvitation = (inviteId: string) => {
    const newSelected = new Set(selectedInvitations);
    if (newSelected.has(inviteId)) {
      newSelected.delete(inviteId);
    } else {
      newSelected.add(inviteId);
    }
    setSelectedInvitations(newSelected);
  };

  const handleAccept = async () => {
    if (selectedInvitations.size === 0 && invitations.length > 1) {
      toast.error('Please select at least one invitation to accept');
      return;
    }

    setIsProcessing(true);

    try {
      const invitesToAccept = invitations.filter(
        (inv) => selectedInvitations.size === 0 || selectedInvitations.has(inv.id)
      );

      console.log('✅ Accepting invitations:', invitesToAccept.length);

      // Pass accepted invitations to parent component
      onInvitationsAccepted(invitesToAccept);

      toast.success(`Successfully accepted ${invitesToAccept.length} invitation${invitesToAccept.length !== 1 ? 's' : ''}!`);
    } catch (error) {
      console.error('Error accepting invitations:', error);
      toast.error('Failed to accept invitations. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (invitations.length === 0) {
    return null;
  }

  // If only one invitation, auto-accept immediately (no UI shown)
  if (invitations.length === 1) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="w-full max-w-md bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Invitation Accepted
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              You've been added to a team
            </p>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <Building2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm text-gray-900">
                  {invitations[0].company_name}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Invited by {invitations[0].inviter_name} • Role: {invitations[0].role}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Your email has been verified through this invitation. You can now access this company.
            </p>
            <button
              onClick={() => onInvitationsAccepted(invitations)}
              disabled={isProcessing}
              className="w-full px-4 py-2 bg-jam-orange text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isProcessing ? 'Processing...' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            Team Invitations
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            You have {invitations.length} invitation{invitations.length !== 1 ? 's' : ''} to join teams
          </p>
        </div>
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            Select which teams you'd like to join. Your email has been verified.
          </p>

          <div className="space-y-3 max-h-64 overflow-y-auto">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition"
                onClick={() => handleSelectInvitation(invitation.id)}
              >
                <input
                  type="checkbox"
                  checked={selectedInvitations.has(invitation.id)}
                  onChange={() => handleSelectInvitation(invitation.id)}
                  className="mt-1 w-4 h-4"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {invitation.company_name}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {invitation.inviter_name} • Role: {invitation.role}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Plan: {invitation.company_plan}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {selectedInvitations.size > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-900">
                {selectedInvitations.size} of {invitations.length} selected
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onSkip}
              disabled={isProcessing}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Skip
            </button>
            <button
              onClick={handleAccept}
              disabled={isProcessing || selectedInvitations.size === 0}
              className="flex-1 px-4 py-2 bg-jam-orange text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isProcessing ? 'Processing...' : `Accept ${selectedInvitations.size > 0 ? `(${selectedInvitations.size})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
