import type { Request, Response, NextFunction } from 'express';
import { success } from '../../shared/utils/response.utils';
import { param } from '../../shared/utils/request.utils';
import * as service from './progress.service';
import type { WatchProgressInput } from './progress.validator';

export async function markComplete(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.markComplete(
      param(req, 'lessonId'),
      req.user!.userId,
    );
    success(res, result, 'Lesson marked complete');
  } catch (err) {
    next(err);
  }
}

export async function recordWatch(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.recordWatchProgress(
      param(req, 'lessonId'),
      req.user!.userId,
      req.body as WatchProgressInput,
    );
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getCourseProgress(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.getCourseProgress(
      param(req, 'courseId'),
      req.user!.userId,
    );
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getMyDashboardStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await service.getLearnerDashboardStats(req.user!.userId);
    success(res, stats);
  } catch (err) {
    next(err);
  }
}
