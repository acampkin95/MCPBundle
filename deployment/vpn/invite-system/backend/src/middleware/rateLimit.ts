import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 minutes
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);

export const generalLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    statusCode: 429,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const inviteCreationLimiter = rateLimit({
  windowMs: 3600000, // 1 hour
  max: 10, // 10 invites per hour per IP
  message: {
    error: 'Too many invites created from this IP, please try again later.',
    statusCode: 429,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

export const authLimiter = rateLimit({
  windowMs: 900000, // 15 minutes
  max: 5, // 5 failed auth attempts
  message: {
    error: 'Too many authentication attempts, please try again later.',
    statusCode: 429,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

export const configDownloadLimiter = rateLimit({
  windowMs: 300000, // 5 minutes
  max: 20, // 20 downloads per 5 minutes
  message: {
    error: 'Too many configuration downloads, please try again later.',
    statusCode: 429,
  },
  standardHeaders: true,
  legacyHeaders: false,
});
