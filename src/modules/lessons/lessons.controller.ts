import type { Request, Response, NextFunction } from 'express';
import { success } from '../../shared/utils/response.utils';
import { param } from '../../shared/utils/request.utils';
import * as service from './lessons.service';
import type {
  CreateLessonForCourseInput,
  CreateLessonForModuleInput,
  ReorderInput,
  UpdateLessonInput,
} from './lessons.validator';

export async function createForModule(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = req.body as CreateLessonForModuleInput;
    const created = await service.createForModule(param(req, 'moduleId'), data);
    success(res, created, 'Lesson created', 201);
  } catch (err) {
    next(err);
  }
}

export async function createForCourse(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = req.body as CreateLessonForCourseInput;
    const created = await service.createForCourse(param(req, 'courseId'), data);
    success(res, created, 'Lesson created', 201);
  } catch (err) {
    next(err);
  }
}

export async function update(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = req.body as UpdateLessonInput;
    const updated = await service.update(param(req, 'lessonId'), data);
    success(res, updated, 'Lesson updated');
  } catch (err) {
    next(err);
  }
}

export async function deleteLesson(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const deleted = await service.deleteById(param(req, 'lessonId'));
    success(res, deleted, 'Lesson deleted');
  } catch (err) {
    next(err);
  }
}

export async function reorderModuleLessons(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const items = req.body as ReorderInput;
    await service.reorderModuleLessons(param(req, 'moduleId'), items);
    success(res, null, 'Lessons reordered');
  } catch (err) {
    next(err);
  }
}

export async function reorderCourseLessons(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const items = req.body as ReorderInput;
    await service.reorderCourseLessons(param(req, 'courseId'), items);
    success(res, null, 'Lessons reordered');
  } catch (err) {
    next(err);
  }
}
