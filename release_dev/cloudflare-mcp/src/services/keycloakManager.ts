import KcAdminClient from '@keycloak/keycloak-admin-client';
import { logger } from '../utils/logger.js';

export interface RealmStats {
  readonly realmName: string;
  readonly users: number;
  readonly clients: number;
  readonly roles: number;
  readonly groups: number;
  readonly enabled: boolean;
}

export interface SessionInfo {
  readonly id: string;
  readonly username: string;
  readonly ipAddress: string;
  readonly start: number;
  readonly lastAccess: number;
  readonly clients: Record<string, string>;
}

export interface ClientStats {
  readonly clientId: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly publicClient: boolean;
  readonly redirectUris: string[];
}

export interface EventStats {
  readonly totalEvents: number;
  readonly byType: Record<string, number>;
  readonly recentEvents: RecentEvent[];
}

export interface RecentEvent {
  readonly time: number;
  readonly type: string;
  readonly realmId: string;
  readonly clientId?: string;
  readonly userId?: string;
  readonly ipAddress?: string;
  readonly error?: string;
}

export interface UserInfo {
  readonly id: string;
  readonly username: string;
  readonly email?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly enabled: boolean;
  readonly createdTimestamp?: number;
}

export class KeycloakManagerService {
  private readonly kcAdmin: KcAdminClient;
  private lastAuth: number = 0;
  private readonly authIntervalMs = 55000; // Re-auth every 55 seconds

  public constructor() {
    const baseUrl = process.env.KEYCLOAK_BASE_URL;
    if (!baseUrl) {
      throw new Error('KEYCLOAK_BASE_URL environment variable is required');
    }

    this.kcAdmin = new KcAdminClient({
      baseUrl,
      realmName: process.env.KEYCLOAK_REALM ?? 'master',
    });

    logger.info('KeycloakManagerService initialized', {
      baseUrl,
      realm: this.kcAdmin.realmName,
    });
  }

  public async authenticate(): Promise<void> {
    const clientId = process.env.KEYCLOAK_CLIENT_ID;
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('KEYCLOAK_CLIENT_ID and KEYCLOAK_CLIENT_SECRET are required');
    }

    await this.kcAdmin.auth({
      grantType: 'client_credentials',
      clientId,
      clientSecret,
    });

    this.lastAuth = Date.now();
    logger.info('Keycloak authenticated successfully');
  }

  private async ensureAuthenticated(): Promise<void> {
    if (Date.now() - this.lastAuth > this.authIntervalMs) {
      await this.authenticate();
    }
  }

  public async getRealmStats(realmName?: string): Promise<RealmStats> {
    await this.ensureAuthenticated();
    const realm = realmName ?? this.kcAdmin.realmName;

    // Get realm info
    const realmInfo = await this.kcAdmin.realms.findOne({ realm });
    if (!realmInfo) {
      throw new Error(`Realm ${realm} not found`);
    }

    // Get users count
    const users = await this.kcAdmin.users.count({ realm });

    // Get clients
    const clients = await this.kcAdmin.clients.find({ realm });

    // Get roles
    const roles = await this.kcAdmin.roles.find({ realm });

    // Get groups
    const groups = await this.kcAdmin.groups.count({ realm });

    return {
      realmName: realm,
      users: users,
      clients: clients.length,
      roles: roles.length,
      groups: groups.count,
      enabled: realmInfo.enabled ?? false,
    };
  }

  public async getActiveSessions(realmName?: string): Promise<SessionInfo[]> {
    await this.ensureAuthenticated();
    const realm = realmName ?? this.kcAdmin.realmName;

    // Get all clients to map clientUuid to clientId
    const clients = await this.kcAdmin.clients.find({ realm });
    const clientMap = new Map(clients.map((c) => [c.id!, c.clientId!]));

    // Get active sessions
    const sessions: SessionInfo[] = [];

    // Note: Keycloak Admin API doesn't have a direct "get all sessions" endpoint
    // We need to iterate through clients and get their sessions
    for (const client of clients.slice(0, 10)) {
      // Limit to first 10 clients for performance
      if (!client.id) {
        continue;
      }

      try {
        const clientSessions = await this.kcAdmin.clients.listSessions({
          realm,
          id: client.id,
        });

        for (const session of clientSessions) {
          if (!session.id) {
            continue;
          }

          const clientSessionMap: Record<string, string> = {};
          for (const [clientUuid, clientSessionId] of Object.entries(session.clients ?? {})) {
            const clientId = clientMap.get(clientUuid);
            if (clientId) {
              clientSessionMap[clientId] = String(clientSessionId);
            }
          }

          sessions.push({
            id: session.id,
            username: session.username ?? 'unknown',
            ipAddress: session.ipAddress ?? 'unknown',
            start: session.start ?? 0,
            lastAccess: session.lastAccess ?? 0,
            clients: clientSessionMap,
          });
        }
      } catch (error) {
        logger.debug('Failed to get sessions for client', { client: client.clientId, error });
      }
    }

    return sessions;
  }

  public async getClientStats(realmName?: string): Promise<ClientStats[]> {
    await this.ensureAuthenticated();
    const realm = realmName ?? this.kcAdmin.realmName;

    const clients = await this.kcAdmin.clients.find({ realm });

    return clients.map((client) => ({
      clientId: client.clientId ?? 'unknown',
      name: client.name ?? client.clientId ?? 'unknown',
      enabled: client.enabled ?? false,
      publicClient: client.publicClient ?? false,
      redirectUris: client.redirectUris ?? [],
    }));
  }

  public async getEventStats(realmName?: string, lastHours: number = 24): Promise<EventStats> {
    await this.ensureAuthenticated();
    const realm = realmName ?? this.kcAdmin.realmName;

    const dateFrom = new Date(Date.now() - lastHours * 60 * 60 * 1000);

    // Get admin events
    const events = await this.kcAdmin.realms.findAdminEvents({
      realm,
      dateFrom,
      max: 100,
    });

    const byType: Record<string, number> = {};
    const recentEvents: RecentEvent[] = [];

    for (const event of events) {
      const eventType = event.operationType ?? 'unknown';
      byType[eventType] = (byType[eventType] ?? 0) + 1;

      if (recentEvents.length < 20) {
        recentEvents.push({
          time: event.time ?? 0,
          type: eventType,
          realmId: event.realmId ?? realm,
          error: event.error,
        });
      }
    }

    return {
      totalEvents: events.length,
      byType,
      recentEvents,
    };
  }

  public async createUser(
    realmName: string,
    username: string,
    email: string,
    password: string
  ): Promise<UserInfo> {
    await this.ensureAuthenticated();

    const user = await this.kcAdmin.users.create({
      realm: realmName,
      username,
      email,
      enabled: true,
      emailVerified: false,
    });

    // Set password
    if (user.id) {
      await this.kcAdmin.users.resetPassword({
        realm: realmName,
        id: user.id,
        credential: {
          temporary: false,
          type: 'password',
          value: password,
        },
      });
    }

    logger.info('User created successfully', { realm: realmName, username });

    return {
      id: user.id ?? 'unknown',
      username,
      email,
      enabled: true,
    };
  }

  public async rotateClientSecret(realmName: string, clientId: string): Promise<string> {
    await this.ensureAuthenticated();

    // Find client by clientId
    const clients = await this.kcAdmin.clients.find({ realm: realmName, clientId });
    if (clients.length === 0) {
      throw new Error(`Client ${clientId} not found in realm ${realmName}`);
    }

    const client = clients[0];
    if (!client.id) {
      throw new Error(`Client ${clientId} has no ID`);
    }

    // Generate new secret
    const secretResponse = await this.kcAdmin.clients.generateNewClientSecret({
      realm: realmName,
      id: client.id,
    });

    const newSecret = secretResponse.value ?? '';
    logger.info('Client secret rotated successfully', { realm: realmName, clientId });

    return newSecret;
  }

  public async getUserCount(realmName?: string): Promise<number> {
    await this.ensureAuthenticated();
    const realm = realmName ?? this.kcAdmin.realmName;

    return await this.kcAdmin.users.count({ realm });
  }

  public async listUsers(realmName?: string, max: number = 100): Promise<UserInfo[]> {
    await this.ensureAuthenticated();
    const realm = realmName ?? this.kcAdmin.realmName;

    const users = await this.kcAdmin.users.find({ realm, max });

    return users.map((user) => ({
      id: user.id ?? 'unknown',
      username: user.username ?? 'unknown',
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      enabled: user.enabled ?? false,
      createdTimestamp: user.createdTimestamp,
    }));
  }
}
