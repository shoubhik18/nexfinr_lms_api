import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import {
  assignments,
  assignmentSubmissions,
  lessons,
  mcqQuestions,
  users,
  type Assignment,
  type AssignmentSubmission,
  type McqQuestion,
  type SubmissionData,
} from '../../db/schema';
import { HttpError } from '../../shared/utils/response.utils';
import {
  assertAssignmentAccess,
  assertLessonAccess,
} from '../../shared/utils/access.utils';
import type { Role } from '../../shared/types/express';
import type {
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from './assignments.validator';

// ----------------------------------------------------------------------------
// Types returned to clients
// ----------------------------------------------------------------------------

export type LearnerMcqQuestion = Omit<McqQuestion, 'correctIndex'>;

export interface AssignmentWithQuestions extends Assignment {
  questions: McqQuestion[] | LearnerMcqQuestion[];
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function fetchQuestions(assignmentId: string): Promise<McqQuestion[]> {
  return db
    .select()
    .from(mcqQuestions)
    .where(eq(mcqQuestions.assignmentId, assignmentId))
    .orderBy(mcqQuestions.orderIndex);
}

function stripCorrectIndex(q: McqQuestion): LearnerMcqQuestion {
  const { correctIndex: _omit, ...rest } = q;
  return rest;
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

export async function create(
  lessonId: string,
  data: CreateAssignmentInput,
): Promise<AssignmentWithQuestions> {
  const [lesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!lesson) throw new HttpError('Lesson not found', 404);

  const created = await db.transaction(async (tx) => {
    const [assignment] = await tx
      .insert(assignments)
      .values({
        lessonId,
        title: data.title,
        description: data.description,
        type: data.type,
        orderIndex: data.orderIndex ?? 0,
      })
      .returning();
    if (!assignment) throw new HttpError('Failed to create assignment', 500);

    if (data.type === 'mcq') {
      await tx.insert(mcqQuestions).values(
        data.questions.map((q) => ({
          assignmentId: assignment.id,
          questionText: q.questionText,
          options: q.options,
          correctIndex: q.correctIndex,
          orderIndex: q.orderIndex,
        })),
      );
    }

    return assignment;
  });

  const questions =
    created.type === 'mcq' ? await fetchQuestions(created.id) : [];
  return { ...created, questions };
}

export async function getByLesson(
  lessonId: string,
  userId: string,
  role: Role,
): Promise<AssignmentWithQuestions[]> {
  await assertLessonAccess(lessonId, userId, role);

  const rows = await db
    .select()
    .from(assignments)
    .where(eq(assignments.lessonId, lessonId))
    .orderBy(assignments.orderIndex);

  const result: AssignmentWithQuestions[] = [];
  for (const a of rows) {
    if (a.type === 'mcq') {
      const qs = await fetchQuestions(a.id);
      result.push({
        ...a,
        questions:
          role === 'learner' ? qs.map(stripCorrectIndex) : qs,
      });
    } else {
      result.push({ ...a, questions: [] });
    }
  }
  return result;
}

export async function update(
  assignmentId: string,
  data: UpdateAssignmentInput,
): Promise<AssignmentWithQuestions> {
  const [existing] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!existing) throw new HttpError('Assignment not found', 404);

  const { questions, ...assignmentFields } = data;

  const updated = await db.transaction(async (tx) => {
    let row: Assignment = existing;

    if (Object.keys(assignmentFields).length > 0) {
      const [u] = await tx
        .update(assignments)
        .set({ ...assignmentFields, updatedAt: new Date() })
        .where(eq(assignments.id, assignmentId))
        .returning();
      if (!u) throw new HttpError('Assignment not found', 404);
      row = u;
    }

    if (existing.type === 'mcq' && questions !== undefined) {
      await tx
        .delete(mcqQuestions)
        .where(eq(mcqQuestions.assignmentId, assignmentId));
      if (questions.length > 0) {
        await tx.insert(mcqQuestions).values(
          questions.map((q) => ({
            assignmentId,
            questionText: q.questionText,
            options: q.options,
            correctIndex: q.correctIndex,
            orderIndex: q.orderIndex,
          })),
        );
      }
    }

    return row;
  });

  const finalQuestions =
    updated.type === 'mcq' ? await fetchQuestions(updated.id) : [];
  return { ...updated, questions: finalQuestions };
}

export async function deleteById(assignmentId: string): Promise<Assignment> {
  const [deleted] = await db
    .delete(assignments)
    .where(eq(assignments.id, assignmentId))
    .returning();
  if (!deleted) throw new HttpError('Assignment not found', 404);
  return deleted;
}

// ----------------------------------------------------------------------------
// Submissions
// ----------------------------------------------------------------------------

export interface MCQCheckResult {
  isCorrect: boolean;
  correctIndex: number;
}

/** Returns feedback for a single question after the learner submits an answer. */
export async function checkMcqAnswer(
  assignmentId: string,
  learnerId: string,
  questionIndex: number,
  answer: number,
): Promise<MCQCheckResult> {
  await assertAssignmentAccess(assignmentId, learnerId, 'learner');

  const [assignment] = await db
    .select({ type: assignments.type })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!assignment) throw new HttpError('Assignment not found', 404);
  if (assignment.type !== 'mcq') {
    throw new HttpError('Assignment is not an MCQ', 400);
  }

  const questions = await fetchQuestions(assignmentId);
  const question = questions[questionIndex];
  if (!question) throw new HttpError('Question not found', 404);
  if (answer < 0 || answer >= question.options.length) {
    throw new HttpError('Invalid answer index', 400);
  }

  return {
    isCorrect: answer === question.correctIndex,
    correctIndex: question.correctIndex,
  };
}

export interface MCQSubmitResult {
  results: boolean[];
  score: number;
}

export async function submitMCQ(
  assignmentId: string,
  learnerId: string,
  answers: number[],
): Promise<MCQSubmitResult> {
  await assertAssignmentAccess(assignmentId, learnerId, 'learner');

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!assignment) throw new HttpError('Assignment not found', 404);
  if (assignment.type !== 'mcq') {
    throw new HttpError('Assignment is not an MCQ', 400);
  }

  const questions = await fetchQuestions(assignmentId);
  if (questions.length === 0) {
    throw new HttpError('Assignment has no questions', 400);
  }

  const results = questions.map(
    (q, i) => answers[i] !== undefined && answers[i] === q.correctIndex,
  );
  const correctCount = results.filter(Boolean).length;
  const score = Math.round((correctCount / questions.length) * 100);
  // Informational score only — learners are not blocked by pass/fail.
  const status = score >= 70 ? 'passed' : 'failed';

  await db.insert(assignmentSubmissions).values({
    assignmentId,
    learnerId,
    submissionData: { answers, results } satisfies SubmissionData,
    score,
    status,
  });

  return { results, score };
}

export async function submitText(
  assignmentId: string,
  learnerId: string,
  answer: string,
): Promise<AssignmentSubmission> {
  await assertAssignmentAccess(assignmentId, learnerId, 'learner');

  const [assignment] = await db
    .select({ id: assignments.id, type: assignments.type })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!assignment) throw new HttpError('Assignment not found', 404);
  if (assignment.type !== 'text') {
    throw new HttpError('Assignment is not a text assignment', 400);
  }

  const [created] = await db
    .insert(assignmentSubmissions)
    .values({
      assignmentId,
      learnerId,
      submissionData: { answer } satisfies SubmissionData,
      status: 'pending',
    })
    .returning();
  if (!created) throw new HttpError('Failed to create submission', 500);
  return created;
}

export async function submitCode(
  assignmentId: string,
  learnerId: string,
  language: string,
  code: string,
): Promise<AssignmentSubmission> {
  await assertAssignmentAccess(assignmentId, learnerId, 'learner');

  const [assignment] = await db
    .select({ id: assignments.id, type: assignments.type })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!assignment) throw new HttpError('Assignment not found', 404);
  if (assignment.type !== 'code') {
    throw new HttpError('Assignment is not a code assignment', 400);
  }

  const [created] = await db
    .insert(assignmentSubmissions)
    .values({
      assignmentId,
      learnerId,
      submissionData: { language, code } satisfies SubmissionData,
      status: 'pending',
    })
    .returning();
  if (!created) throw new HttpError('Failed to create submission', 500);
  return created;
}

// ----------------------------------------------------------------------------
// Submission queries
// ----------------------------------------------------------------------------

export interface ListSubmissionsQuery {
  status?: 'pending' | 'passed' | 'failed';
  page: number;
  limit: number;
}

export interface SubmissionWithLearner {
  id: string;
  assignmentId: string;
  learnerId: string;
  learnerName: string;
  learnerEmail: string;
  submissionData: SubmissionData;
  score: number | null;
  status: 'pending' | 'passed' | 'failed';
  reviewedBy: string | null;
  reviewedAt: Date | null;
  submittedAt: Date;
}

export interface ListSubmissionsResult {
  submissions: SubmissionWithLearner[];
  total: number;
  page: number;
  limit: number;
}

export async function getSubmissions(
  assignmentId: string,
  query: ListSubmissionsQuery,
): Promise<ListSubmissionsResult> {
  const { status, page, limit } = query;
  const offset = (page - 1) * limit;

  const filters: SQL[] = [eq(assignmentSubmissions.assignmentId, assignmentId)];
  if (status) filters.push(eq(assignmentSubmissions.status, status));
  const whereClause = and(...filters);

  const rows = await db
    .select({
      id: assignmentSubmissions.id,
      assignmentId: assignmentSubmissions.assignmentId,
      learnerId: assignmentSubmissions.learnerId,
      learnerName: users.name,
      learnerEmail: users.email,
      submissionData: assignmentSubmissions.submissionData,
      score: assignmentSubmissions.score,
      status: assignmentSubmissions.status,
      reviewedBy: assignmentSubmissions.reviewedBy,
      reviewedAt: assignmentSubmissions.reviewedAt,
      submittedAt: assignmentSubmissions.submittedAt,
    })
    .from(assignmentSubmissions)
    .innerJoin(users, eq(users.id, assignmentSubmissions.learnerId))
    .where(whereClause)
    .orderBy(desc(assignmentSubmissions.submittedAt))
    .limit(limit)
    .offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(assignmentSubmissions)
    .where(whereClause);

  return {
    submissions: rows,
    total: Number(total),
    page,
    limit,
  };
}

export async function getMySubmission(
  assignmentId: string,
  learnerId: string,
): Promise<AssignmentSubmission | null> {
  await assertAssignmentAccess(assignmentId, learnerId, 'learner');

  const [row] = await db
    .select()
    .from(assignmentSubmissions)
    .where(
      and(
        eq(assignmentSubmissions.assignmentId, assignmentId),
        eq(assignmentSubmissions.learnerId, learnerId),
      ),
    )
    .orderBy(desc(assignmentSubmissions.submittedAt))
    .limit(1);
  return row ?? null;
}

// ----------------------------------------------------------------------------
// Review
// ----------------------------------------------------------------------------

export async function review(
  assignmentId: string,
  submissionId: string,
  reviewerId: string,
  status: 'passed' | 'failed',
  feedback?: string,
): Promise<AssignmentSubmission> {
  const [existing] = await db
    .select()
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.id, submissionId))
    .limit(1);
  if (!existing) throw new HttpError('Submission not found', 404);
  if (existing.assignmentId !== assignmentId) {
    throw new HttpError('Submission does not belong to this assignment', 404);
  }

  const newSubmissionData: SubmissionData = feedback
    ? ({ ...existing.submissionData, feedback } as SubmissionData)
    : existing.submissionData;

  const [updated] = await db
    .update(assignmentSubmissions)
    .set({
      status,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      submissionData: newSubmissionData,
    })
    .where(eq(assignmentSubmissions.id, submissionId))
    .returning();
  if (!updated) throw new HttpError('Submission not found', 404);
  return updated;
}
