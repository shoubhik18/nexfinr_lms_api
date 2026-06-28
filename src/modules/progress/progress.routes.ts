import { Router } from 'express';
import {
  requireRole,
  verifyToken,
} from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { watchProgressSchema } from './progress.validator';
import * as controller from './progress.controller';

const router = Router();

router.post(
  '/progress/lessons/:lessonId/watch',
  verifyToken,
  requireRole('learner'),
  validate(watchProgressSchema),
  controller.recordWatch,
);

router.get(
  '/progress/learner/me/stats',
  verifyToken,
  requireRole('learner'),
  controller.getMyDashboardStats,
);

router.post(
  '/progress/lessons/:lessonId/complete',
  verifyToken,
  requireRole('learner'),
  controller.markComplete,
);

router.get(
  '/progress/courses/:courseId',
  verifyToken,
  controller.getCourseProgress,
);

export default router;
