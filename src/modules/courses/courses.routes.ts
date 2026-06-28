import { Router } from 'express';
import {
  adminOnly,
  staffOnly,
  verifyToken,
} from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createCourseSchema,
  updateCourseSchema,
} from './courses.validator';
import { uploadCourseThumbnail } from '../../shared/upload/courseThumbnail.upload';
import * as coursesController from './courses.controller';

const router = Router();

router.use(verifyToken);

router.get('/', coursesController.list);
router.post(
  '/',
  staffOnly,
  validate(createCourseSchema),
  coursesController.create,
);
router.get('/:id', coursesController.getById);
router.put(
  '/:id',
  staffOnly,
  validate(updateCourseSchema),
  coursesController.update,
);
router.delete('/:id', adminOnly, coursesController.deleteById);
router.patch('/:id/publish', staffOnly, coursesController.togglePublish);
router.post(
  '/:id/thumbnail',
  staffOnly,
  uploadCourseThumbnail.single('thumbnail'),
  coursesController.uploadThumbnail,
);

export default router;
