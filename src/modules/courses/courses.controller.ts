import type { Request, Response, NextFunction } from 'express';
import { HttpError, success } from '../../shared/utils/response.utils';
import { param } from '../../shared/utils/request.utils';
import * as coursesService from './courses.service';
import type {
  CreateCourseInput,
  UpdateCourseInput,
} from './courses.validator';

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

function parseBoolQuery(value: unknown): boolean | undefined {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
}

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit } = parsePagination(req);
    const type = req.query.type as 'recorded' | 'ongoing' | undefined;
    const isPublished = parseBoolQuery(req.query.isPublished);
    const search =
      typeof req.query.search === 'string' && req.query.search.trim() !== ''
        ? req.query.search.trim()
        : undefined;

    const result = await coursesService.list(
      req.user!.role,
      req.user!.userId,
      { type, isPublished, search, page, limit },
    );
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const course = await coursesService.getById(
      param(req, 'id'),
      req.user!.userId,
      req.user!.role,
    );
    success(res, course);
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
    const data = req.body as CreateCourseInput;
    const created = await coursesService.create(data, req.user!.userId);
    success(res, created, 'Course created', 201);
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
    const data = req.body as UpdateCourseInput;
    const updated = await coursesService.update(param(req, 'id'), data);
    success(res, updated, 'Course updated');
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
    const deleted = await coursesService.deleteById(param(req, 'id'));
    success(res, deleted, 'Course deleted');
  } catch (err) {
    next(err);
  }
}

export async function togglePublish(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const updated = await coursesService.togglePublish(param(req, 'id'));
    success(res, updated, 'Course publish status updated');
  } catch (err) {
    next(err);
  }
}

export async function uploadThumbnail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      throw new HttpError(
        'No image file uploaded. Use field name "thumbnail".',
        400,
      );
    }
    const updated = await coursesService.setThumbnailFromUpload(
      param(req, 'id'),
      req.file.filename,
    );
    success(res, updated, 'Course thumbnail uploaded');
  } catch (err) {
    next(err);
  }
}
