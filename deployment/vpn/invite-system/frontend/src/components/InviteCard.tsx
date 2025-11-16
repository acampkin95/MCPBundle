import { useState } from 'react';
import { Invite, apiClient } from '@/lib/api';
import { Copy, Check, Trash2, Clock, CheckCircle, XCircle } from 'lucide-react';

interface InviteCardProps {
  invite: Invite;
  onUpdate: () => void;
}

export default function InviteCard({ invite, onUpdate }: InviteCardProps) {
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async () => {
    if (!confirm('Are you sure you want to revoke this invite?')) {
      return;
    }

    try {
      setRevoking(true);
      await apiClient.revokeInvite(invite.id);
      onUpdate();
    } catch (error) {
      console.error('Failed to revoke invite:', error);
      alert('Failed to revoke invite');
    } finally {
      setRevoking(false);
    }
  };

  const getStatusColor = () => {
    switch (invite.status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'claimed':
        return 'bg-green-100 text-green-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'revoked':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = () => {
    switch (invite.status) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'claimed':
        return <CheckCircle className="h-4 w-4" />;
      case 'expired':
      case 'revoked':
        return <XCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-medium text-gray-900">
              {invite.recipientName || 'Anonymous Invite'}
            </h3>
            <span
              className={`inline-flex items-center space-x-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor()}`}
            >
              {getStatusIcon()}
              <span className="capitalize">{invite.status}</span>
            </span>
          </div>

          {invite.recipientEmail && (
            <p className="mt-1 text-sm text-gray-600">{invite.recipientEmail}</p>
          )}

          {invite.notes && <p className="mt-2 text-sm text-gray-500 italic">{invite.notes}</p>}

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Created:</span>
              <p className="font-medium text-gray-900">
                {new Date(invite.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Expires:</span>
              <p className="font-medium text-gray-900">
                {new Date(invite.expiresAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {invite.claimedAt && (
            <div className="mt-2 text-sm">
              <span className="text-gray-500">Claimed:</span>
              <p className="font-medium text-gray-900">
                {new Date(invite.claimedAt).toLocaleDateString()}
              </p>
            </div>
          )}

          {invite.inviteUrl && invite.status === 'pending' && (
            <div className="mt-4 flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={invite.inviteUrl}
                className="flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700"
              />
              <button
                onClick={() => copyToClipboard(invite.inviteUrl!)}
                className="flex items-center space-x-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {invite.status === 'pending' && (
          <button
            onClick={handleRevoke}
            disabled={revoking}
            className="ml-4 rounded-md p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
            title="Revoke invite"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
