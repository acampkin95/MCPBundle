'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { initKeycloak, getUser, logoutKeycloak, isAdmin } from '@/lib/keycloak';
import { useAppStore } from '@/lib/store';
import { apiClient, Invite, Peer } from '@/lib/api';
import InviteCard from '@/components/InviteCard';
import CreateInviteButton from '@/components/CreateInviteButton';
import PeerCard from '@/components/PeerCard';
import { LogOut, User, Plus } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { user, setUser, isLoading, setIsLoading } = useAppStore();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [activeTab, setActiveTab] = useState<'invites' | 'peers'>('invites');

  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsLoading(true);
        const keycloak = initKeycloak();

        const authenticated = await keycloak.init({
          onLoad: 'check-sso',
          checkLoginIframe: false,
        });

        if (!authenticated) {
          router.push('/login');
          return;
        }

        const currentUser = getUser();
        setUser(currentUser);
      } catch (err) {
        console.error('Authentication error:', err);
        router.push('/login');
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [router, setUser, setIsLoading]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      setLoadingData(true);
      const [invitesData, peersData] = await Promise.all([
        apiClient.getMyInvites(),
        apiClient.getMyPeers(),
      ]);
      setInvites(invitesData);
      setPeers(peersData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const handleLogout = async () => {
    await logoutKeycloak();
  };

  const handleInviteCreated = () => {
    loadData();
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">MCP VPN Dashboard</h1>
              <p className="text-sm text-gray-600">Manage your VPN invites and connections</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-700">
                <User className="h-4 w-4" />
                <span>{user?.name || user?.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('invites')}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                activeTab === 'invites'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Invites ({invites.length})
            </button>
            <button
              onClick={() => setActiveTab('peers')}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                activeTab === 'peers'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              My Connections ({peers.length})
            </button>
          </div>

          {activeTab === 'invites' && <CreateInviteButton onInviteCreated={handleInviteCreated} />}
        </div>

        {loadingData ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : (
          <>
            {activeTab === 'invites' && (
              <div className="space-y-4">
                {invites.length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-12 text-center">
                    <Plus className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No invites</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Get started by creating a new VPN invite.
                    </p>
                  </div>
                ) : (
                  invites.map((invite) => (
                    <InviteCard key={invite.id} invite={invite} onUpdate={loadData} />
                  ))
                )}
              </div>
            )}

            {activeTab === 'peers' && (
              <div className="space-y-4">
                {peers.length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-12 text-center">
                    <h3 className="text-sm font-medium text-gray-900">No active connections</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Claim an invite to create a VPN connection.
                    </p>
                  </div>
                ) : (
                  peers.map((peer) => <PeerCard key={peer.id} peer={peer} onUpdate={loadData} />)
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
