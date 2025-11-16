import type { NextAuthOptions } from 'next-auth';
import KeycloakProvider from 'next-auth/providers/keycloak';

const required = [
  'AUTH_SECRET',
  'KEYCLOAK_BASE_URL',
  'KEYCLOAK_REALM',
  'KEYCLOAK_CLIENT_ID',
  'KEYCLOAK_CLIENT_SECRET',
] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[admin-panel] Missing environment variable ${key}`);
  }
}

const issuer =
  process.env.KEYCLOAK_BASE_URL && process.env.KEYCLOAK_REALM
    ? `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}`
    : undefined;

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID ?? '',
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
      issuer,
    }),
  ],
  session: {
    strategy: 'jwt',
  },
};
