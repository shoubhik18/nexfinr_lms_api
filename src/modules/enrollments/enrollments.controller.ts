import type { Request, Response, NextFunction } from 'express';
import { success } from '../../shared/utils/response.utils';
import { param } from '../../shared/utils/request.utils';
import * as service from './enrollments.service';
import type { CreateEnrollmentInput, BulkEnrollmentInput } from './enrollments.validator';

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function parsePagination(req: Request): { page: number; limit: number } {
  const rawPage = parseInt(String(req.query.page ?? '1'), 10);
  const rawLimit = parseInt(String(req.query.limit ?? '20'), 10);
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
  const limit = Number.isFinite(rawLimit) ? clamp(rawLimit, 1, 100) : 20;
  return { page, limit };
}

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit } = parsePagination(req);
    const learnerId =
      typeof req.query.learnerId === 'string' ? req.query.learnerId : undefined;
    const courseId =
      typeof req.query.courseId === 'string' ? req.query.courseId : undefined;
    const search =
      typeof req.query.search === 'string' && req.query.search.trim() !== ''
        ? req.query.search.trim()
        : undefined;

    const result = await service.list({
      learnerId,
      courseId,
      search,
      page,
      limit,
    });
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function create(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = req.body as CreateEnrollmentInput;
    const created = await service.create(data, req.user!.userId);
    success(res, created, 'Enrollment created', 201);
  } catch (err) {
    next(err);
  }
}

export async function bulkCreate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { courseId, emails } = req.body as BulkEnrollmentInput;
    const result = await service.bulkCreateByEmails(
      courseId,
      emails,
      req.user!.userId,
    );
    const count = result.enrolled.length;
    success(
      res,
      result,
      count > 0
        ? `${count} learner${count === 1 ? '' : 's'} enrolled`
        : 'No new enrollments created',
      count > 0 ? 201 : 200,
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await service.deleteById(param(req, 'id'));
    success(res, null, 'Enrollment deleted');
  } catch (err) {
    next(err);
  }
}

export async function getByLearner(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.getByLearner(
      param(req, 'id'),
      req.user!.userId,
      req.user!.role,
    );
    success(res, result);
  } catch (err) {
    next(err);
  }
}
