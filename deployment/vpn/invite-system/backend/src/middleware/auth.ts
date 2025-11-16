import { Request, Response, NextFunction } from 'express';
import { getKeycloak, extractUserFromToken, TokenPayload } from '../config/keycloak';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  kauth?: any;
}

export function authenticate() {
  const keycloak = getKeycloak();
  return keycloak.protect();
}

export function authenticateWithRole(role: string) {
  const keycloak = getKeycloak();
  return keycloak.protect(`realm:${role}`);
}

export function extractUser(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    if (req.kauth && req.kauth.grant && req.kauth.grant.access_token) {
      req.user = extractUserFromToken(req.kauth.grant.access_token);
      next();
    } else {
      res.status(401).json({ error: 'Unauthorized: No valid token found' });
    }
  } catch (error) {
    console.error('Error extracting user from token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized: No user context' });
    return;
  }

  const isAdmin =
    req.user.realm_access?.roles.includes('admin') ||
    req.user.realm_access?.roles.includes('vpn-admin');

  if (isAdmin) {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden: Admin role required' });
  }
}

export function requireRole(role: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: No user context' });
      return;
    }

    const hasRole = req.user.realm_access?.roles.includes(role);

    if (hasRole) {
      next();
    } else {
      res.status(403).json({ error: `Forbidden: ${role} role required` });
    }
  };
}
