import type { Request, Response, NextFunction } from 'express';
import { success } from '../../shared/utils/response.utils';
import { param } from '../../shared/utils/request.utils';
import * as service from './assessments.service';
import type {
  CreateAssessmentInput,
  SubmitAssessmentInput,
  UpdateAssessmentInput,
} from './assessments.validator';

export async function create(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.createAssessment(
      req.body as CreateAssessmentInput,
      req.user!.userId,
    );
    success(res, result, 'Assessment created', 201);
  } catch (err) {
    next(err);
  }
}

export async function list(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.listAssessments();
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
    const result = await service.getAssessmentForStaff(param(req, 'id'));
    success(res, result);
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
    const result = await service.updateAssessment(
      param(req, 'id'),
      req.body as UpdateAssessmentInput,
    );
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function remove(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await service.deleteAssessment(param(req, 'id'));
    success(res, null, 'Assessment deleted');
  } catch (err) {
    next(err);
  }
}

export async function setActive(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { active } = req.body as { active: boolean };
    const result = await service.setAssessmentActive(param(req, 'id'), active);
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function releaseResults(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { released } = req.body as { released: boolean };
    const result = await service.releaseResults(param(req, 'id'), released);
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function assignLearners(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { learnerIds } = req.body as { learnerIds: string[] };
    const result = await service.assignLearners(param(req, 'id'), learnerIds);
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function grantReattempt(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.grantReattempt(
      param(req, 'id'),
      param(req, 'learnerId'),
    );
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function listResults(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.listAssessmentResults(param(req, 'id'));
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getSubmissionDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.getStaffSubmissionDetail(
      param(req, 'id'),
      param(req, 'submissionId'),
    );
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function listMine(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.listLearnerAssessments(req.user!.userId);
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getMine(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.getLearnerAssessment(
      param(req, 'id'),
      req.user!.userId,
    );
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function startRetake(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.startRetake(
      param(req, 'id'),
      req.user!.userId,
    );
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function submit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.submitAssessment(
      param(req, 'id'),
      req.user!.userId,
      req.body as SubmitAssessmentInput,
    );
    success(res, result, String(result.message), 201);
  } catch (err) {
    next(err);
  }
}

export async function listMyResults(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.listLearnerResults(req.user!.userId);
    success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getMySubmissionDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.getLearnerSubmissionDetail(
      param(req, 'id'),
      req.user!.userId,
      param(req, 'submissionId'),
    );
    success(res, result);
  } catch (err) {
    next(err);
  }
}
