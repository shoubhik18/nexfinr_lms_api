import { Router } from 'express';
import {
  adminOnly,
  staffOnly,
  verifyToken,
} from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createLessonForCourseSchema,
  createLessonForModuleSchema,
  reorderSchema,
  updateLessonSchema,
} from './lessons.validator';
import * as controller from './lessons.controller';

const router = Router();

// RECORDED: lessons under a module
router.post(
  '/modules/:moduleId/lessons',
  verifyToken,
  staffOnly,
  validate(createLessonForModuleSchema),
  controller.createForModule,
);

router.put(
  '/modules/:moduleId/lessons/reorder',
  verifyToken,
  staffOnly,
  validate(reorderSchema),
  controller.reorderModuleLessons,
);

// ONGOING: lessons directly under course
router.post(
  '/courses/:courseId/lessons',
  verifyToken,
  staffOnly,
  validate(createLessonForCourseSchema),
  controller.createForCourse,
);

router.put(
  '/courses/:courseId/lessons/reorder',
  verifyToken,
  staffOnly,
  validate(reorderSchema),
  controller.reorderCourseLessons,
);

// Shared: update and delete
router.put(
  '/lessons/:lessonId',
  verifyToken,
  staffOnly,
  validate(updateLessonSchema),
  controller.update,
);

router.delete(
  '/lessons/:lessonId',
  verifyToken,
  adminOnly,
  controller.deleteLesson,
);

export default router;
