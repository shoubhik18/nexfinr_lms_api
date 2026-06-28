import { Router } from 'express';
import {
  adminOnly,
  staffOnly,
  verifyToken,
} from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
} from './users.validator';
import * as usersController from './users.controller';

const router = Router();

router.use(verifyToken);

router.get('/', staffOnly, usersController.list);
router.post('/', staffOnly, validate(createUserSchema), usersController.create);
router.get('/:id', staffOnly, usersController.getById);
router.put(
  '/:id',
  staffOnly,
  validate(updateUserSchema),
  usersController.update,
);
router.delete('/:id', adminOnly, usersController.deleteUser);
router.patch('/:id/toggle-status', staffOnly, usersController.toggleStatus);
router.post(
  '/:id/reset-password',
  adminOnly,
  validate(resetPasswordSchema),
  usersController.resetPassword,
);

export default router;
