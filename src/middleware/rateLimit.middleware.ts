import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/** Brute-force protection on credential endpoints. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.IS_PROD ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again later.' },
});

/** Limit assignment submission bursts per IP. */
export const submissionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.IS_PROD ? 30 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many submissions. Slow down.' },
});
