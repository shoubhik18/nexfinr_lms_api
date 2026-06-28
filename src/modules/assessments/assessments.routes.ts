import { Router } from 'express';
import {
  adminOnly,
  requireRole,
  staffOnly,
  verifyToken,
} from '../../middleware/auth.middleware';
import { submissionRateLimiter } from '../../middleware/rateLimit.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as controller from './assessments.controller';
import {
  assignLearnersSchema,
  createAssessmentSchema,
  releaseResultsSchema,
  setActiveSchema,
  submitAssessmentSchema,
  updateAssessmentSchema,
} from './assessments.validator';

const router = Router();
const learnerOnly = requireRole('learner');

router.get(
  '/assessments/mine/results',
  verifyToken,
  learnerOnly,
  controller.listMyResults,
);

router.get(
  '/assessments/mine',
  verifyToken,
  learnerOnly,
  controller.listMine,
);

router.get(
  '/assessments/:id/take',
  verifyToken,
  learnerOnly,
  controller.getMine,
);

router.post(
  '/assessments/:id/retake',
  verifyToken,
  learnerOnly,
  controller.startRetake,
);

router.post(
  '/assessments/:id/submit',
  verifyToken,
  learnerOnly,
  submissionRateLimiter,
  validate(submitAssessmentSchema),
  controller.submit,
);

router.get(
  '/assessments/:id/results/:submissionId',
  verifyToken,
  learnerOnly,
  controller.getMySubmissionDetail,
);

router.get(
  '/assessments',
  verifyToken,
  staffOnly,
  controller.list,
);

router.post(
  '/assessments',
  verifyToken,
  staffOnly,
  validate(createAssessmentSchema),
  controller.create,
);

router.get(
  '/assessments/:id',
  verifyToken,
  staffOnly,
  controller.getById,
);

router.put(
  '/assessments/:id',
  verifyToken,
  staffOnly,
  validate(updateAssessmentSchema),
  controller.update,
);

router.delete(
  '/assessments/:id',
  verifyToken,
  adminOnly,
  controller.remove,
);

router.put(
  '/assessments/:id/results-release',
  verifyToken,
  staffOnly,
  validate(releaseResultsSchema),
  controller.releaseResults,
);

router.put(
  '/assessments/:id/active',
  verifyToken,
  staffOnly,
  validate(setActiveSchema),
  controller.setActive,
);

router.put(
  '/assessments/:id/learners',
  verifyToken,
  staffOnly,
  validate(assignLearnersSchema),
  controller.assignLearners,
);

router.post(
  '/assessments/:id/learners/:learnerId/reattempt',
  verifyToken,
  staffOnly,
  controller.grantReattempt,
);

router.get(
  '/assessments/:id/results',
  verifyToken,
  staffOnly,
  controller.listResults,
);

router.get(
  '/assessments/:id/submissions/:submissionId',
  verifyToken,
  staffOnly,
  controller.getSubmissionDetail,
);

export default router;
