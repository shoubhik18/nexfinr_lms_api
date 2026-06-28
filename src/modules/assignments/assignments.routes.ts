import { Router } from 'express';
import {
  adminOnly,
  requireRole,
  staffOnly,
  verifyToken,
} from '../../middleware/auth.middleware';
import { submissionRateLimiter } from '../../middleware/rateLimit.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  // codeSubmitSchema, // disabled — Code Compiler not in use
  createAssignmentSchema,
  mcqSubmitSchema,
  mcqCheckSchema,
  reviewSchema,
  textSubmitSchema,
  updateAssignmentSchema,
} from './assignments.validator';
import * as controller from './assignments.controller';

const learnerOnly = requireRole('learner');
const router = Router();

// Lesson-scoped routes
router.post(
  '/lessons/:lessonId/assignments',
  verifyToken,
  staffOnly,
  validate(createAssignmentSchema),
  controller.create,
);
router.get(
  '/lessons/:lessonId/assignments',
  verifyToken,
  controller.getByLesson,
);

// Assignment-scoped routes
router.put(
  '/assignments/:id',
  verifyToken,
  staffOnly,
  validate(updateAssignmentSchema),
  controller.update,
);
router.delete(
  '/assignments/:id',
  verifyToken,
  adminOnly,
  controller.deleteById,
);

// Submissions
router.post(
  '/assignments/:id/submit/mcq/check',
  verifyToken,
  learnerOnly,
  submissionRateLimiter,
  validate(mcqCheckSchema),
  controller.checkMcqAnswer,
);
router.post(
  '/assignments/:id/submit/mcq',
  verifyToken,
  learnerOnly,
  submissionRateLimiter,
  validate(mcqSubmitSchema),
  controller.submitMCQ,
);
router.post(
  '/assignments/:id/submit/text',
  verifyToken,
  learnerOnly,
  submissionRateLimiter,
  validate(textSubmitSchema),
  controller.submitText,
);
// Code submission disabled — requires Code Compiler service.
// router.post(
//   '/assignments/:id/submit/code',
//   verifyToken,
//   learnerOnly,
//   submissionRateLimiter,
//   validate(codeSubmitSchema),
//   controller.submitCode,
// );

// `/submissions/mine` MUST come before `/submissions` is parameterised; both
// happen to be distinct paths so order is not strictly required, but we keep
// the learner-specific endpoint first for readability.
router.get(
  '/assignments/:id/submissions/mine',
  verifyToken,
  learnerOnly,
  controller.getMySubmission,
);
router.get(
  '/assignments/:id/submissions',
  verifyToken,
  staffOnly,
  controller.getSubmissions,
);
router.put(
  '/assignments/:id/submissions/:sid/review',
  verifyToken,
  staffOnly,
  validate(reviewSchema),
  controller.review,
);

export default router;
