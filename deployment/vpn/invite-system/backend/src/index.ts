import express, { Express } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase, closeDatabase } from './config/database';
import { initializeKeycloak, sessionConfig, memoryStore } from './config/keycloak';
import { validateWireGuardConfig } from './config/wireguard';
import { errorHandler, notFoundHandler } from './middleware/error';
import { generalLimiter } from './middleware/rateLimit';
import inviteRoutes from './routes/invites';
import configRoutes from './routes/config';
import { logger } from './utils/logger';
import { InviteService } from './services/inviteService';

dotenv.config();

const app: Express = express();
const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3101',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware (required for Keycloak)
app.use(session(sessionConfig));

// Initialize Keycloak
const keycloak = initializeKeycloak(memoryStore);
app.use(keycloak.middleware());

// Rate limiting
app.use(generalLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'vpn-invite-backend',
    version: '1.0.0',
  });
});

// API Routes
app.use('/api/invites', inviteRoutes);
app.use('/api/config', configRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Cleanup task - expire old invites every hour
const inviteService = new InviteService();
setInterval(async () => {
  try {
    const expired = await inviteService.expireOldInvites();
    if (expired > 0) {
      logger.info(`Expired ${expired} old invites`);
    }
  } catch (error) {
    logger.error('Failed to expire old invites:', error);
  }
}, 3600000); // 1 hour

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, starting graceful shutdown`);

  try {
    await closeDatabase();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
async function startServer() {
  try {
    // Validate configuration
    validateWireGuardConfig();
    logger.info('WireGuard configuration validated');

    // Initialize database
    await initializeDatabase();

    // Start HTTP server
    app.listen(PORT, HOST, () => {
      logger.info(`VPN Invite System backend running on http://${HOST}:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Frontend URL: ${process.env.FRONTEND_URL}`);
      logger.info(`Keycloak URL: ${process.env.KEYCLOAK_URL}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
