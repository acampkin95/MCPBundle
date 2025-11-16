import Keycloak from 'keycloak-js';

let keycloakInstance: Keycloak | null = null;

export interface KeycloakUser {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name: string;
  roles: string[];
}

export function initKeycloak(): Keycloak {
  if (!keycloakInstance) {
    keycloakInstance = new Keycloak({
      url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://154.26.158.31:8080',
      realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'mcp',
      clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'vpn-invite-system',
    });
  }
  return keycloakInstance;
}

export function getKeycloak(): Keycloak {
  if (!keycloakInstance) {
    throw new Error('Keycloak has not been initialized. Call initKeycloak() first.');
  }
  return keycloakInstance;
}

export async function loginKeycloak(): Promise<void> {
  const keycloak = getKeycloak();
  await keycloak.login({
    redirectUri: typeof window !== 'undefined' ? window.location.origin + '/dashboard' : undefined,
  });
}

export async function logoutKeycloak(): Promise<void> {
  const keycloak = getKeycloak();
  await keycloak.logout({
    redirectUri: typeof window !== 'undefined' ? window.location.origin : undefined,
  });
}

export function getToken(): string | undefined {
  const keycloak = getKeycloak();
  return keycloak.token;
}

export async function updateToken(minValidity: number = 30): Promise<boolean> {
  const keycloak = getKeycloak();
  try {
    const refreshed = await keycloak.updateToken(minValidity);
    return refreshed;
  } catch (error) {
    console.error('Failed to refresh token:', error);
    return false;
  }
}

export function isAuthenticated(): boolean {
  const keycloak = getKeycloak();
  return keycloak.authenticated || false;
}

export function getUser(): KeycloakUser | null {
  const keycloak = getKeycloak();

  if (!keycloak.authenticated || !keycloak.tokenParsed) {
    return null;
  }

  const token = keycloak.tokenParsed;

  return {
    id: token.sub || '',
    username: token.preferred_username || '',
    email: token.email || '',
    firstName: token.given_name,
    lastName: token.family_name,
    name: token.name || token.preferred_username || '',
    roles: token.realm_access?.roles || [],
  };
}

export function hasRole(role: string): boolean {
  const user = getUser();
  return user?.roles.includes(role) || false;
}

export function isAdmin(): boolean {
  return hasRole('admin') || hasRole('vpn-admin');
}
