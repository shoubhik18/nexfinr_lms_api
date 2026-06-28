import { Router } from 'express';
import { verifyToken } from '../../middleware/auth.middleware';
import { authRateLimiter } from '../../middleware/rateLimit.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  loginSchema,
  logoutBodySchema,
  refreshTokenBodySchema,
} from './auth.validator';
import * as authController from './auth.controller';

const router = Router();

router.post(
  '/login',
  authRateLimiter,
  validate(loginSchema),
  authController.login,
);
router.post(
  '/refresh',
  authRateLimiter,
  validate(refreshTokenBodySchema),
  authController.refresh,
);
router.post(
  '/logout',
  validate(logoutBodySchema),
  authController.logout,
);
router.get('/me', verifyToken, authController.me);

export default router;
