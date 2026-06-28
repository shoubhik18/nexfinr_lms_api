import { Router } from 'express';
import {
  adminOnly,
  staffOnly,
  verifyToken,
} from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createModuleSchema,
  reorderSchema,
  updateModuleSchema,
} from './courseModules.validator';
import * as controller from './courseModules.controller';

const router = Router();

// IMPORTANT: `/reorder` must be declared BEFORE the `/:moduleId` routes,
// otherwise Express will treat "reorder" as a moduleId and 404.
router.put(
  '/courses/:courseId/modules/reorder',
  verifyToken,
  staffOnly,
  validate(reorderSchema),
  controller.reorder,
);

router.post(
  '/courses/:courseId/modules',
  verifyToken,
  staffOnly,
  validate(createModuleSchema),
  controller.create,
);
router.put(
  '/courses/:courseId/modules/:moduleId',
  verifyToken,
  staffOnly,
  validate(updateModuleSchema),
  controller.update,
);
router.delete(
  '/courses/:courseId/modules/:moduleId',
  verifyToken,
  adminOnly,
  controller.deleteById,
);

export default router;
