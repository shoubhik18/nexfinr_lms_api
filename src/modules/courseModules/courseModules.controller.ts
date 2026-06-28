import type { Request, Response, NextFunction } from 'express';
import { success } from '../../shared/utils/response.utils';
import { param } from '../../shared/utils/request.utils';
import * as service from './courseModules.service';
import type {
  CreateModuleInput,
  ReorderInput,
  UpdateModuleInput,
} from './courseModules.validator';

export async function create(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = req.body as CreateModuleInput;
    const created = await service.create(param(req, 'courseId'), data);
    success(res, created, 'Module created', 201);
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
    const data = req.body as UpdateModuleInput;
    const updated = await service.update(param(req, 'moduleId'), data);
    success(res, updated, 'Module updated');
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
    const deleted = await service.deleteById(param(req, 'moduleId'));
    success(res, deleted, 'Module deleted');
  } catch (err) {
    next(err);
  }
}

export async function reorder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const items = req.body as ReorderInput;
    await service.reorder(items);
    success(res, null, 'Modules reordered');
  } catch (err) {
    next(err);
  }
}
