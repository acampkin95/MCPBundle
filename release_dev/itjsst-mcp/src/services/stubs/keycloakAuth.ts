import { logger } from "../../utils/logger.js";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface KeycloakConfig {
  readonly serverUrl: string;
  readonly realm: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly username?: string;
  readonly password?: string;
}

export interface TokenSet {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt: number; // Unix timestamp
  readonly tokenType: string;
  readonly scope?: string;
}

export interface TokenInfo {
  readonly sub: string; // Subject (user/client ID)
  readonly iss: string; // Issuer
  readonly aud: string; // Audience
  readonly exp: number; // Expiration timestamp
  readonly iat: number; // Issued at timestamp
  readonly scope?: string;
  readonly roles?: readonly string[];
  readonly capabilities?: readonly string[];
}

/**
 * KeycloakAuthService manages JWT token lifecycle for API authentication.
 *
 * **Authentication Flows**:
 * 1. Client Credentials: For service-to-service (recommended for IT-MCP)
 * 2. Resource Owner Password: For user-based authentication (optional)
 *
 * **Token Management**:
 * - Acquires JWT on startup
 * - Auto-refreshes before expiry (90% of lifetime)
 * - Validates token before use
 * - Handles refresh token rotation
 *
 * **Capability Mapping**:
 * - Keycloak roles → IT-MCP capabilities
 * - Example: "agent_admin" role → ["remote_exec", "service_control"] capabilities
 */
export class KeycloakAuthService {
  private readonly config: KeycloakConfig;
  private currentTokenSet: TokenSet | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  public constructor(config: KeycloakConfig) {
    this.config = config;
    logger.info("KeycloakAuthService initialized", {
      serverUrl: config.serverUrl,
      realm: config.realm,
      clientId: config.clientId,
    });
  }

  /**
   * Acquire initial access token
   */
  public async authenticate(): Promise<TokenSet> {
    try {
      logger.info("Authenticating with Keycloak");

      // Determine authentication flow
      const tokenSet = this.config.clientSecret
        ? await this.clientCredentialsFlow()
        : await this.passwordFlow();

      this.currentTokenSet = tokenSet;
      this.scheduleTokenRefresh(tokenSet);

      logger.info("Authentication successful", {
        expiresAt: new Date(tokenSet.expiresAt).toISOString(),
      });

      return tokenSet;
    } catch (error) {
      logger.error("Authentication failed", { error });
      throw new Error(`Failed to authenticate with Keycloak: ${error}`);
    }
  }

  /**
   * Client Credentials flow (service-to-service)
   */
  private async clientCredentialsFlow(): Promise<TokenSet> {
    if (!this.config.clientSecret) {
      throw new Error("Client secret required for client credentials flow");
    }

    const tokenEndpoint = `${this.config.serverUrl}/realms/${this.config.realm}/protocol/openid-connect/token`;

    logger.debug("Requesting token with client credentials", { tokenEndpoint });

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Token request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Resource Owner Password flow (user-based)
   */
  private async passwordFlow(): Promise<TokenSet> {
    if (!this.config.username || !this.config.password) {
      throw new Error("Username and password required for password flow");
    }

    const tokenEndpoint = `${this.config.serverUrl}/realms/${this.config.realm}/protocol/openid-connect/token`;

    logger.debug("Requesting token with password flow", { tokenEndpoint });

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: this.config.clientId,
        username: this.config.username,
        password: this.config.password,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Token request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  public async refreshToken(): Promise<TokenSet> {
    if (!this.currentTokenSet?.refreshToken) {
      logger.warn("No refresh token available, re-authenticating");
      return this.authenticate();
    }

    try {
      logger.debug("Refreshing access token");

      const tokenEndpoint = `${this.config.serverUrl}/realms/${this.config.realm}/protocol/openid-connect/token`;

      const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: this.config.clientId,
          refresh_token: this.currentTokenSet.refreshToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();

      const newTokenSet: TokenSet = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || this.currentTokenSet.refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
        tokenType: data.token_type,
        scope: data.scope,
      };

      this.currentTokenSet = newTokenSet;
      this.scheduleTokenRefresh(newTokenSet);

      logger.info("Token refreshed successfully");
      return newTokenSet;
    } catch (error) {
      logger.error("Token refresh failed, re-authenticating", { error });
      return this.authenticate();
    }
  }

  /**
   * Get current valid access token (auto-refresh if expired)
   */
  public async getAccessToken(): Promise<string> {
    if (!this.currentTokenSet) {
      await this.authenticate();
    }

    // Check if token is expired or will expire soon (within 60 seconds)
    const now = Date.now();
    const expiryBuffer = 60000; // 60 seconds

    if (this.currentTokenSet && this.currentTokenSet.expiresAt - now < expiryBuffer) {
      await this.refreshToken();
    }

    return this.currentTokenSet!.accessToken;
  }

  /**
   * Decode JWT and extract token info (without verification)
   */
  public decodeToken(token: string): TokenInfo | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());

      return {
        sub: payload.sub,
        iss: payload.iss,
        aud: payload.aud,
        exp: payload.exp,
        iat: payload.iat,
        scope: payload.scope,
        roles: payload.realm_access?.roles,
        capabilities: payload.capabilities,
      };
    } catch (error) {
      logger.error("Failed to decode token", { error });
      return null;
    }
  }

  /**
   * Validate token (check expiry and structure)
   */
  public isTokenValid(token?: string): boolean {
    const tokenToCheck = token ?? this.currentTokenSet?.accessToken;
    if (!tokenToCheck) {
      return false;
    }

    const info = this.decodeToken(tokenToCheck);
    if (!info) {
      return false;
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    return info.exp > now;
  }

  /**
   * Schedule automatic token refresh before expiry
   */
  private scheduleTokenRefresh(tokenSet: TokenSet): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Refresh at 90% of token lifetime
    const lifetime = tokenSet.expiresAt - Date.now();
    const refreshAt = lifetime * 0.9;

    logger.debug("Scheduling token refresh", {
      refreshInMs: refreshAt,
      refreshAt: new Date(Date.now() + refreshAt).toISOString(),
    });

    this.refreshTimer = setTimeout(() => {
      void this.refreshToken();
    }, refreshAt);
  }

  /**
   * Revoke current token (logout)
   */
  public async revoke(): Promise<void> {
    if (!this.currentTokenSet) {
      logger.warn("No active token to revoke");
      return;
    }

    try {
      logger.info("Revoking access token");

      const revokeEndpoint = `${this.config.serverUrl}/realms/${this.config.realm}/protocol/openid-connect/revoke`;

      const response = await fetch(revokeEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          token: this.currentTokenSet.accessToken,
          token_type_hint: "access_token",
        }),
      });

      if (!response.ok) {
        logger.warn("Token revocation returned non-OK status", {
          status: response.status,
        });
      }

      this.currentTokenSet = null;
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }

      logger.info("Token revoked successfully");
    } catch (error) {
      logger.error("Token revocation failed", { error });
      // Clear local state anyway
      this.currentTokenSet = null;
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }
    }
  }

  /**
   * Verify JWT signature and extract capabilities from realm_access roles
   *
   * Uses JWKS (JSON Web Key Set) from Keycloak to verify signature offline.
   * This is more secure than just decoding the JWT.
   *
   * @param token JWT access token
   * @returns Array of capabilities (roles from realm_access.roles)
   */
  public async verifyAndExtractCapabilities(token: string): Promise<readonly string[]> {
    try {
      const jwksUrl = `${this.config.serverUrl}/realms/${this.config.realm}/protocol/openid-connect/certs`;
      const JWKS = createRemoteJWKSet(new URL(jwksUrl));

      // Verify JWT signature and validate claims
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: `${this.config.serverUrl}/realms/${this.config.realm}`,
        audience: this.config.clientId,
      });

      // Extract capabilities from realm_access.roles
      const realmAccess = payload.realm_access as { roles?: string[] } | undefined;
      const roles = realmAccess?.roles || [];

      logger.debug("JWT verified successfully", {
        sub: payload.sub,
        roles: roles.length,
      });

      return roles;
    } catch (error) {
      logger.error("JWT verification failed", { error });
      throw new Error(`JWT verification failed: ${error}`);
    }
  }

  /**
   * Cleanup: revoke token and stop refresh timer
   */
  public async destroy(): Promise<void> {
    await this.revoke();
    logger.info("KeycloakAuthService destroyed");
  }
}
