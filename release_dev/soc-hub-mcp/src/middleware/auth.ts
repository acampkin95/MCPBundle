/**
 * Keycloak SSO Authentication Middleware
 * Provides JWT validation, RBAC, and session management
 */

import { Request, Response, NextFunction } from 'express';
import Keycloak from 'keycloak-connect';
import { logger } from '../utils/logger.js';

export interface KeycloakConfig {
  realm: string;
  authServerUrl: string;
  sslRequired: string;
  resource: string;
  publicClient: boolean;
  confidentialPort: number;
  clientId?: string;
  secret?: string;
}

export interface AuthenticatedRequest extends Request {
  kauth?: {
    grant?: {
      access_token?: {
        content?: {
          realm_access?: { roles?: string[] };
          resource_access?: Record<string, { roles?: string[] }>;
          preferred_username?: string;
          email?: string;
          sub?: string;
        };
      };
    };
  };
  user?: {
    id: string;
    username: string;
    email: string;
    roles: string[];
  };
}

/**
 * Initialize Keycloak
 */
export function initializeKeycloak(config: KeycloakConfig): Keycloak.Keycloak {
  const keycloakConfig: Record<string, unknown> = {
    realm: config.realm,
    'auth-server-url': config.authServerUrl,
    'ssl-required': config.sslRequired,
    resource: config.resource,
    'public-client': config.publicClient,
    'confidential-port': config.confidentialPort,
  };

  if (config.clientId) {
    keycloakConfig['client-id'] = config.clientId;
  }

  if (config.secret) {
    keycloakConfig.credentials = {
      secret: config.secret,
    };
  }

  const keycloak = new Keycloak({}, keycloakConfig as unknown as Keycloak.KeycloakConfig);

  logger.info('Keycloak initialized', {
    realm: config.realm,
    authServerUrl: config.authServerUrl,
  });

  return keycloak;
}

/**
 * Authentication middleware
 */
export function authenticate(keycloak: Keycloak.Keycloak) {
  return keycloak.protect();
}

/**
 * Role-based access control middleware
 */
export function requireRole(role: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.kauth?.grant?.access_token?.content) {
      res.status(403).json({
        success: false,
        error: 'Access denied - no token',
      });
      return;
    }

    const tokenContent = req.kauth.grant.access_token.content;
    const realmRoles = tokenContent.realm_access?.roles || [];
    const resourceRoles = Object.values(tokenContent.resource_access || {})
      .flatMap((resource) => resource.roles || []);

    const allRoles = [...realmRoles, ...resourceRoles];

    if (!allRoles.includes(role)) {
      logger.warn('Access denied - insufficient permissions', {
        user: tokenContent.preferred_username,
        required: role,
        actual: allRoles,
      });

      res.status(403).json({
        success: false,
        error: `Access denied - requires role: ${role}`,
      });
      return;
    }

    next();
  };
}

/**
 * Require any of the specified roles
 */
export function requireAnyRole(roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.kauth?.grant?.access_token?.content) {
      res.status(403).json({
        success: false,
        error: 'Access denied - no token',
      });
      return;
    }

    const tokenContent = req.kauth.grant.access_token.content;
    const realmRoles = tokenContent.realm_access?.roles || [];
    const resourceRoles = Object.values(tokenContent.resource_access || {})
      .flatMap((resource) => resource.roles || []);

    const allRoles = [...realmRoles, ...resourceRoles];
    const hasRequiredRole = roles.some((role) => allRoles.includes(role));

    if (!hasRequiredRole) {
      logger.warn('Access denied - insufficient permissions', {
        user: tokenContent.preferred_username,
        required: roles,
        actual: allRoles,
      });

      res.status(403).json({
        success: false,
        error: `Access denied - requires one of: ${roles.join(', ')}`,
      });
      return;
    }

    next();
  };
}

/**
 * Extract user information from token
 */
export function extractUser(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  if (!req.kauth?.grant?.access_token?.content) {
    next();
    return;
  }

  const tokenContent = req.kauth.grant.access_token.content;
  const realmRoles = tokenContent.realm_access?.roles || [];
  const resourceRoles = Object.values(tokenContent.resource_access || {})
    .flatMap((resource) => resource.roles || []);

  req.user = {
    id: tokenContent.sub || '',
    username: tokenContent.preferred_username || '',
    email: tokenContent.email || '',
    roles: [...realmRoles, ...resourceRoles],
  };

  next();
}

/**
 * Optional authentication - allows both authenticated and anonymous access
 */
export function optionalAuth(keycloak: Keycloak.Keycloak) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Try to authenticate but don't fail if token is missing
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      next();
      return;
    }

    keycloak.protect()(req, res, next);
  };
}

/**
 * Audit log middleware
 */
export function auditLog(action: string) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const username = req.user?.username || 'anonymous';
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    logger.info('Audit log', {
      action,
      username,
      ip,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
    });

    next();
  };
}

/**
 * Check if user has specific permission
 */
export function hasPermission(
  req: AuthenticatedRequest,
  permission: string
): boolean {
  if (!req.user) {
    return false;
  }

  // Permission format: resource:action (e.g., "cases:create", "alerts:read")
  const [resource, _action] = permission.split(':');

  // Check for wildcard permissions
  const hasWildcard = req.user.roles.some(
    (role) =>
      role === `${resource}:*` ||
      role === '*:*' ||
      role === 'admin' ||
      role === 'superadmin'
  );

  if (hasWildcard) {
    return true;
  }

  // Check for exact permission
  return req.user.roles.includes(permission);
}

/**
 * Require specific permission
 */
export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!hasPermission(req, permission)) {
      logger.warn('Access denied - missing permission', {
        user: req.user?.username,
        permission,
        roles: req.user?.roles,
      });

      res.status(403).json({
        success: false,
        error: `Access denied - requires permission: ${permission}`,
      });
      return;
    }

    next();
  };
}
