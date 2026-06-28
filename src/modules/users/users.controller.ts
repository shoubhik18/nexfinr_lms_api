import type { Request, Response, NextFunction } from 'express';
import { success } from '../../shared/utils/response.utils';
import { param } from '../../shared/utils/request.utils';
import * as usersService from './users.service';
import type {
  CreateUserInput,
  ResetPasswordInput,
  UpdateUserInput,
} from './users.validator';

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
    const role = req.query.role as
      | 'admin'
      | 'support'
      | 'learner'
      | undefined;
    const search =
      typeof req.query.search === 'string' && req.query.search.trim() !== ''
        ? req.query.search.trim()
        : undefined;

    const result = await usersService.list({ role, search, page, limit });
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
    const user = await usersService.getById(param(req, 'id'));
    success(res, user);
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
    const data = req.body as CreateUserInput;
    const created = await usersService.create(data, req.user!.userId);
    success(res, created, 'User created', 201);
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
    const data = req.body as UpdateUserInput;
    const updated = await usersService.update(param(req, 'id'), data);
    success(res, updated, 'User updated');
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const deleted = await usersService.deleteUser(
      param(req, 'id'),
      req.user!.userId,
    );
    success(res, deleted, 'User deleted');
  } catch (err) {
    next(err);
  }
}

export async function toggleStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const updated = await usersService.toggleStatus(param(req, 'id'));
    success(res, updated, 'Status toggled');
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { newPassword } = req.body as ResetPasswordInput;
    const updated = await usersService.resetPassword(
      param(req, 'id'),
      newPassword,
    );
    success(res, updated, 'Password reset');
  } catch (err) {
    next(err);
  }
}
