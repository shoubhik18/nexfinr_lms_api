import type { Request, Response, NextFunction } from 'express';
import { success } from '../../shared/utils/response.utils';
import { param } from '../../shared/utils/request.utils';
import * as service from './assignments.service';
import type {
  CodeSubmitInput,
  CreateAssignmentInput,
  McqCheckInput,
  McqSubmitInput,
  ReviewInput,
  TextSubmitInput,
  UpdateAssignmentInput,
} from './assignments.validator';

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

export async function create(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = req.body as CreateAssignmentInput;
    const created = await service.create(param(req, 'lessonId'), data);
    success(res, created, 'Assignment created', 201);
  } catch (err) {
    next(err);
  }
}

export async function getByLesson(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const list = await service.getByLesson(
      param(req, 'lessonId'),
      req.user!.userId,
      req.user!.role,
    );
    success(res, list);
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
    const data = req.body as UpdateAssignmentInput;
    const updated = await service.update(param(req, 'id'), data);
    success(res, updated, 'Assignment updated');
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
    const deleted = await service.deleteById(param(req, 'id'));
    success(res, deleted, 'Assignment deleted');
  } catch (err) {
    next(err);
  }
}

export async function checkMcqAnswer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { questionIndex, answer } = req.body as McqCheckInput;
    const result = await service.checkMcqAnswer(
      param(req, 'id'),
      req.user!.userId,
      questionIndex,
      answer,
    );
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function submitMCQ(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { answers } = req.body as McqSubmitInput;
    const result = await service.submitMCQ(
      param(req, 'id'),
      req.user!.userId,
      answers,
    );
    success(res, result, 'MCQ submitted', 201);
  } catch (err) {
    next(err);
  }
}

export async function submitText(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { answer } = req.body as TextSubmitInput;
    const result = await service.submitText(
      param(req, 'id'),
      req.user!.userId,
      answer,
    );
    success(res, result, 'Text submission received', 201);
  } catch (err) {
    next(err);
  }
}

export async function submitCode(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { language, code } = req.body as CodeSubmitInput;
    const result = await service.submitCode(
      param(req, 'id'),
      req.user!.userId,
      language,
      code,
    );
    success(res, result, 'Code submission received', 201);
  } catch (err) {
    next(err);
  }
}

export async function getSubmissions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit } = parsePagination(req);
    const status = req.query.status as
      | 'pending'
      | 'passed'
      | 'failed'
      | undefined;
    const result = await service.getSubmissions(param(req, 'id'), {
      status,
      page,
      limit,
    });
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getMySubmission(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const submission = await service.getMySubmission(
      param(req, 'id'),
      req.user!.userId,
    );
    success(res, submission);
  } catch (err) {
    next(err);
  }
}

export async function review(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { status, feedback } = req.body as ReviewInput;
    const updated = await service.review(
      param(req, 'id'),
      param(req, 'sid'),
      req.user!.userId,
      status,
      feedback,
    );
    success(res, updated, 'Submission reviewed');
  } catch (err) {
    next(err);
  }
}
