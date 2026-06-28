import { Router } from 'express';
import {
  staffOnly,
  verifyToken,
} from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createEnrollmentSchema, bulkEnrollmentSchema } from './enrollments.validator';
import * as controller from './enrollments.controller';

const router = Router();

router.use(verifyToken);

router.get('/', staffOnly, controller.list);
router.post(
  '/',
  staffOnly,
  validate(createEnrollmentSchema),
  controller.create,
);
router.post(
  '/bulk',
  staffOnly,
  validate(bulkEnrollmentSchema),
  controller.bulkCreate,
);
router.delete('/:id', staffOnly, controller.deleteById);
router.get('/learner/:id', controller.getByLearner);

export default router;
