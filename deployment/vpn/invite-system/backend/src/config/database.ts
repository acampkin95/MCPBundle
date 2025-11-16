import { DataSource } from 'typeorm';
import { Invite } from '../models/Invite';
import { Peer } from '../models/Peer';
import dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || '46.250.243.123',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'vpn_invite_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'mcp_vpn_invites',
  synchronize: false, // Use migrations in production
  logging: process.env.NODE_ENV === 'development',
  entities: [Invite, Peer],
  migrations: ['src/migrations/**/*.ts'],
  subscribers: [],
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  extra: {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  },
});

export async function initializeDatabase(): Promise<void> {
  try {
    await AppDataSource.initialize();
    console.log('✅ Database connection initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    console.log('Database connection closed');
  }
}
