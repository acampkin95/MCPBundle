import Keycloak from 'keycloak-connect';
import session from 'express-session';
import dotenv from 'dotenv';

dotenv.config();

export const memoryStore = new session.MemoryStore();

export const sessionConfig: session.SessionOptions = {
  secret: process.env.SESSION_SECRET || 'vpn-invite-secret-change-me',
  resave: false,
  saveUninitialized: true,
  store: memoryStore,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10),
  },
};

export const keycloakConfig = {
  realm: process.env.KEYCLOAK_REALM || 'mcp',
  'auth-server-url': process.env.KEYCLOAK_URL || 'http://154.26.158.31:8080',
  'ssl-required': 'external',
  resource: process.env.KEYCLOAK_CLIENT_ID || 'vpn-invite-system',
  'public-client': false,
  'confidential-port': 0,
  credentials: {
    secret: process.env.KEYCLOAK_CLIENT_SECRET || '',
  },
  'use-resource-role-mappings': true,
  'bearer-only': true,
};

let keycloakInstance: Keycloak.Keycloak | null = null;

export function initializeKeycloak(memStore: session.Store): Keycloak.Keycloak {
  if (!keycloakInstance) {
    keycloakInstance = new Keycloak({ store: memStore }, keycloakConfig);
  }
  return keycloakInstance;
}

export function getKeycloak(): Keycloak.Keycloak {
  if (!keycloakInstance) {
    throw new Error('Keycloak has not been initialized');
  }
  return keycloakInstance;
}

export interface TokenPayload {
  sub: string;
  email: string;
  preferred_username: string;
  name: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: {
    [key: string]: {
      roles: string[];
    };
  };
}

export function extractUserFromToken(token: any): TokenPayload {
  return {
    sub: token.content.sub,
    email: token.content.email || '',
    preferred_username: token.content.preferred_username || '',
    name: token.content.name || '',
    realm_access: token.content.realm_access,
    resource_access: token.content.resource_access,
  };
}
