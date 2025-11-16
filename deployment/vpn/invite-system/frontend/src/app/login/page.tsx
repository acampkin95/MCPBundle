'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { initKeycloak, isAuthenticated } from '@/lib/keycloak';
import { useAppStore } from '@/lib/store';

export default function LoginPage() {
  const router = useRouter();
  const setIsLoading = useAppStore((state) => state.setIsLoading);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsLoading(true);
        const keycloak = initKeycloak();

        const authenticated = await keycloak.init({
          onLoad: 'login-required',
          checkLoginIframe: false,
        });

        if (authenticated) {
          router.push('/dashboard');
        }
      } catch (err) {
        console.error('Authentication error:', err);
        setError('Failed to initialize authentication. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [router, setIsLoading]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-2xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">MCP VPN</h1>
          <p className="mt-2 text-sm text-gray-600">Invite System</p>
        </div>

        <div className="mt-8 space-y-6">
          {error ? (
            <div className="rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Authentication Error</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
              <span className="ml-3 text-gray-600">Authenticating...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
