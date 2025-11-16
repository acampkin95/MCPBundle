'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { initKeycloak, getUser } from '@/lib/keycloak';
import { apiClient, Invite } from '@/lib/api';
import ConfigDownload from '@/components/ConfigDownload';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

export default function InviteClaimPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState('');

  useEffect(() => {
    const initAuth = async () => {
      try {
        const keycloak = initKeycloak();
        const authenticated = await keycloak.init({
          onLoad: 'check-sso',
          checkLoginIframe: false,
        });

        if (!authenticated) {
          router.push(`/login?redirect=/invite/${token}`);
          return;
        }

        // Load invite details
        const inviteData = await apiClient.getInviteByToken(token);
        setInvite(inviteData);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load invite');
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, [token, router]);

  const handleClaim = async () => {
    try {
      setClaiming(true);
      setError(null);

      const result = await apiClient.claimInvite(token, {
        deviceName: deviceName || undefined,
      });

      setPeerId(result.peerId);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to claim invite');
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (peerId) {
    return <ConfigDownload peerId={peerId} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-2xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">VPN Invite</h1>
          <p className="mt-2 text-sm text-gray-600">Claim your VPN access</p>
        </div>

        {invite && (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Status</span>
                <div className="flex items-center space-x-2">
                  {invite.status === 'pending' && invite.canBeClaimed && (
                    <>
                      <Clock className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm font-medium text-yellow-700">Pending</span>
                    </>
                  )}
                  {invite.status === 'claimed' && (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium text-green-700">Claimed</span>
                    </>
                  )}
                  {invite.status === 'expired' && (
                    <>
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="text-sm font-medium text-red-700">Expired</span>
                    </>
                  )}
                  {invite.status === 'revoked' && (
                    <>
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="text-sm font-medium text-red-700">Revoked</span>
                    </>
                  )}
                </div>
              </div>

              {invite.recipientName && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Recipient</span>
                  <span className="text-sm text-gray-900">{invite.recipientName}</span>
                </div>
              )}

              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Expires At</span>
                <span className="text-sm text-gray-900">
                  {new Date(invite.expiresAt).toLocaleString()}
                </span>
              </div>
            </div>

            {invite.canBeClaimed ? (
              <>
                <div>
                  <label htmlFor="deviceName" className="block text-sm font-medium text-gray-700">
                    Device Name (Optional)
                  </label>
                  <input
                    type="text"
                    id="deviceName"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    placeholder="My Laptop"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  />
                </div>

                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
                >
                  {claiming ? 'Claiming...' : 'Claim VPN Access'}
                </button>
              </>
            ) : (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Cannot Claim Invite</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>
                        This invite{' '}
                        {invite.status === 'expired' ? 'has expired' : 'is no longer available'}.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
