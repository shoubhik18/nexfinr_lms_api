import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { db } from '../../db';
import * as schema from '../../db/schema';
import {
  assessmentAttempts,
  assessmentLearners,
  assessmentQuestionOptions,
  assessmentQuestions,
  assessmentSubmissionAnswers,
  assessmentSubmissions,
  assessments,
  users,
} from '../../db/schema';
import { HttpError } from '../../shared/utils/response.utils';
import type {
  CreateAssessmentInput,
  SubmitAssessmentInput,
  UpdateAssessmentInput,
} from './assessments.validator';

type DbTx = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
type DbConn = typeof db | DbTx;

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value === null || value === undefined) return new Date();
  return new Date(String(value));
}

interface QuestionInput {
  text: string;
  options: string[];
  correctOptionIndex: number;
}

async function assertLearnersExist(learnerIds: string[]): Promise<string[]> {
  const unique = [...new Set(learnerIds)];
  if (unique.length === 0) return [];

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.role, 'learner'), inArray(users.id, unique), eq(users.isActive, true)),
    );

  if (rows.length !== unique.length) {
    throw new HttpError('One or more selected learners do not exist', 400);
  }
  return unique;
}

async function assertAssessmentExists(
  assessmentId: string,
  conn: DbConn = db,
): Promise<void> {
  const [row] = await conn
    .select({ id: assessments.id })
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);
  if (!row) throw new HttpError('Assessment not found', 404);
}

function questionsFingerprint(questions: QuestionInput[]): string {
  return JSON.stringify(
    questions.map((q) => ({
      text: q.text.trim(),
      options: q.options.map((o) => o.trim()),
      correctOptionIndex: q.correctOptionIndex,
    })),
  );
}

async function loadQuestionsAsInput(
  assessmentId: string,
  conn: DbConn,
): Promise<QuestionInput[]> {
  const qRows = await conn
    .select({
      questionId: assessmentQuestions.id,
      questionText: assessmentQuestions.questionText,
      questionOrder: assessmentQuestions.orderIndex,
      optionId: assessmentQuestionOptions.id,
      optionText: assessmentQuestionOptions.optionText,
      optionOrder: assessmentQuestionOptions.orderIndex,
      isCorrect: assessmentQuestionOptions.isCorrect,
    })
    .from(assessmentQuestions)
    .innerJoin(
      assessmentQuestionOptions,
      eq(assessmentQuestionOptions.questionId, assessmentQuestions.id),
    )
    .where(eq(assessmentQuestions.assessmentId, assessmentId))
    .orderBy(assessmentQuestions.orderIndex, assessmentQuestionOptions.orderIndex);

  return buildQuestionTree(
    qRows.map((r) => ({
      questionId: r.questionId,
      questionText: r.questionText,
      questionOrder: r.questionOrder,
      optionId: r.optionId,
      optionText: r.optionText,
      optionOrder: r.optionOrder,
      isCorrect: r.isCorrect,
    })),
  ).map((q) => ({
    text: q.text,
    options: q.options.map((o) => o.text),
    correctOptionIndex: Math.max(
      0,
      q.options.findIndex((o) => o.isCorrect),
    ),
  }));
}

async function countSubmissions(
  assessmentId: string,
  conn: DbConn = db,
): Promise<number> {
  const [row] = await conn
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(assessmentSubmissions)
    .where(eq(assessmentSubmissions.assessmentId, assessmentId));
  return Number(row?.count ?? 0);
}

async function replaceQuestions(
  assessmentId: string,
  questions: QuestionInput[],
  conn: DbConn,
): Promise<void> {
  await conn
    .delete(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentId, assessmentId));

  for (const [i, question] of questions.entries()) {
    const [q] = await conn
      .insert(assessmentQuestions)
      .values({
        assessmentId,
        questionText: question.text,
        orderIndex: i + 1,
      })
      .returning({ id: assessmentQuestions.id });

    for (const [j, optionText] of question.options.entries()) {
      await conn.insert(assessmentQuestionOptions).values({
        questionId: q.id,
        optionText,
        orderIndex: j + 1,
        isCorrect: j === question.correctOptionIndex,
      });
    }
  }
}

async function replaceLearners(
  assessmentId: string,
  learnerIds: string[],
  conn: DbConn,
): Promise<void> {
  if (learnerIds.length === 0) {
    await conn
      .delete(assessmentLearners)
      .where(eq(assessmentLearners.assessmentId, assessmentId));
    return;
  }

  await conn
    .delete(assessmentLearners)
    .where(
      and(
        eq(assessmentLearners.assessmentId, assessmentId),
        notInArray(assessmentLearners.learnerId, learnerIds),
      ),
    );

  for (const learnerId of learnerIds) {
    await conn
      .insert(assessmentLearners)
      .values({ assessmentId, learnerId })
      .onConflictDoNothing();
  }
}

async function getNextAttemptNumber(
  assessmentId: string,
  learnerId: string,
  conn: DbConn,
): Promise<number> {
  const [row] = await conn
    .select({
      next: sql<number>`COALESCE(MAX(${assessmentSubmissions.attemptNumber}), 0) + 1`,
    })
    .from(assessmentSubmissions)
    .where(
      and(
        eq(assessmentSubmissions.assessmentId, assessmentId),
        eq(assessmentSubmissions.learnerId, learnerId),
      ),
    );
  return Number(row?.next ?? 1);
}

function buildQuestionTree(
  rows: Array<{
    questionId: string;
    questionText: string;
    questionOrder: number;
    optionId: string;
    optionText: string;
    optionOrder: number;
    isCorrect?: boolean;
  }>,
) {
  const map = new Map<
    string,
    {
      id: string;
      text: string;
      orderIndex: number;
      options: Array<{
        id: string;
        text: string;
        orderIndex: number;
        isCorrect?: boolean;
      }>;
    }
  >();

  for (const row of rows) {
    if (!map.has(row.questionId)) {
      map.set(row.questionId, {
        id: row.questionId,
        text: row.questionText,
        orderIndex: row.questionOrder,
        options: [],
      });
    }
    map.get(row.questionId)!.options.push({
      id: row.optionId,
      text: row.optionText,
      orderIndex: row.optionOrder,
      ...(row.isCorrect !== undefined ? { isCorrect: row.isCorrect } : {}),
    });
  }

  return [...map.values()].sort((a, b) => a.orderIndex - b.orderIndex);
}

export async function createAssessment(
  input: CreateAssessmentInput,
  createdBy: string,
): Promise<{ assessmentId: string }> {
  const validLearners = await assertLearnersExist(input.learnerIds);

  const assessmentId = await db.transaction(async (tx) => {
    const [a] = await tx
      .insert(assessments)
      .values({
        title: input.title,
        description: input.description || null,
        timeLimitMinutes: input.timeLimitMinutes,
        allowRetake: input.allowRetake,
        createdBy,
      })
      .returning({ id: assessments.id });

    await replaceQuestions(a.id, input.questions, tx);
    await replaceLearners(a.id, validLearners, tx);
    return a.id;
  });

  return { assessmentId };
}

export async function updateAssessment(
  assessmentId: string,
  input: UpdateAssessmentInput,
): Promise<{ message: string }> {
  const validLearners = await assertLearnersExist(input.learnerIds);

  await db.transaction(async (tx) => {
    await assertAssessmentExists(assessmentId, tx);
    await tx
      .update(assessments)
      .set({
        title: input.title,
        description: input.description || null,
        timeLimitMinutes: input.timeLimitMinutes,
        allowRetake: input.allowRetake,
        updatedAt: new Date(),
      })
      .where(eq(assessments.id, assessmentId));

    const submissionCount = await countSubmissions(assessmentId, tx);
    if (submissionCount > 0) {
      const currentQuestions = await loadQuestionsAsInput(assessmentId, tx);
      if (
        questionsFingerprint(currentQuestions) !==
        questionsFingerprint(input.questions)
      ) {
        throw new HttpError(
          'Questions cannot be changed after learners have submitted',
          400,
        );
      }
    } else {
      await replaceQuestions(assessmentId, input.questions, tx);
    }

    await replaceLearners(assessmentId, validLearners, tx);
  });

  return { message: 'Assessment updated' };
}

export async function deleteAssessment(assessmentId: string): Promise<void> {
  const [row] = await db
    .delete(assessments)
    .where(eq(assessments.id, assessmentId))
    .returning({ id: assessments.id });
  if (!row) throw new HttpError('Assessment not found', 404);
}

export async function setAssessmentActive(
  assessmentId: string,
  active: boolean,
): Promise<{ message: string; isActive: boolean }> {
  const [row] = await db
    .update(assessments)
    .set({ isActive: active, updatedAt: new Date() })
    .where(eq(assessments.id, assessmentId))
    .returning({ id: assessments.id });

  if (!row) throw new HttpError('Assessment not found', 404);

  return {
    message: active ? 'Assessment activated' : 'Assessment deactivated',
    isActive: active,
  };
}

export async function releaseResults(
  assessmentId: string,
  released: boolean,
): Promise<{ message: string; resultsReleased: boolean }> {
  const [row] = await db
    .update(assessments)
    .set({ resultsReleased: released, updatedAt: new Date() })
    .where(eq(assessments.id, assessmentId))
    .returning({ id: assessments.id });

  if (!row) throw new HttpError('Assessment not found', 404);

  return {
    message: released ? 'Results released' : 'Results hidden',
    resultsReleased: released,
  };
}

export async function listAssessments() {
  const rows = await db
    .select({
      id: assessments.id,
      title: assessments.title,
      description: assessments.description,
      timeLimitMinutes: assessments.timeLimitMinutes,
      allowRetake: assessments.allowRetake,
      resultsReleased: assessments.resultsReleased,
      isActive: assessments.isActive,
      createdAt: assessments.createdAt,
      questionCount: sql<number>`COUNT(DISTINCT ${assessmentQuestions.id})`,
      assignedLearnerCount: sql<number>`COUNT(DISTINCT ${assessmentLearners.learnerId})`,
    })
    .from(assessments)
    .leftJoin(
      assessmentQuestions,
      eq(assessmentQuestions.assessmentId, assessments.id),
    )
    .leftJoin(
      assessmentLearners,
      eq(assessmentLearners.assessmentId, assessments.id),
    )
    .groupBy(assessments.id)
    .orderBy(desc(assessments.createdAt));

  return { assessments: rows };
}

export async function getAssessmentForStaff(assessmentId: string) {
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);

  if (!assessment) throw new HttpError('Assessment not found', 404);

  const qRows = await db
    .select({
      questionId: assessmentQuestions.id,
      questionText: assessmentQuestions.questionText,
      questionOrder: assessmentQuestions.orderIndex,
      optionId: assessmentQuestionOptions.id,
      optionText: assessmentQuestionOptions.optionText,
      optionOrder: assessmentQuestionOptions.orderIndex,
      isCorrect: assessmentQuestionOptions.isCorrect,
    })
    .from(assessmentQuestions)
    .innerJoin(
      assessmentQuestionOptions,
      eq(assessmentQuestionOptions.questionId, assessmentQuestions.id),
    )
    .where(eq(assessmentQuestions.assessmentId, assessmentId))
    .orderBy(assessmentQuestions.orderIndex, assessmentQuestionOptions.orderIndex);

  const assignedLearners = await db.execute<{
    id: string;
    name: string;
    email: string;
    assigned_at: Date;
    reattempts_allowed: number;
    attempt_count: number;
    latest_attempt_number: number | null;
    latest_score: number | null;
    latest_total_questions: number | null;
    latest_submitted_at: Date | null;
    active_attempt_number: number | null;
    active_started_at: Date | null;
  }>(sql`
    SELECT
      u.id, u.name, u.email,
      al.assigned_at, al.reattempts_allowed,
      (SELECT COUNT(*)::int FROM assessment_submissions s
       WHERE s.assessment_id = al.assessment_id AND s.learner_id = al.learner_id) AS attempt_count,
      (SELECT s.attempt_number FROM assessment_submissions s
       WHERE s.assessment_id = al.assessment_id AND s.learner_id = al.learner_id
       ORDER BY s.attempt_number DESC LIMIT 1) AS latest_attempt_number,
      (SELECT s.score FROM assessment_submissions s
       WHERE s.assessment_id = al.assessment_id AND s.learner_id = al.learner_id
       ORDER BY s.attempt_number DESC LIMIT 1) AS latest_score,
      (SELECT s.total_questions FROM assessment_submissions s
       WHERE s.assessment_id = al.assessment_id AND s.learner_id = al.learner_id
       ORDER BY s.attempt_number DESC LIMIT 1) AS latest_total_questions,
      (SELECT s.submitted_at FROM assessment_submissions s
       WHERE s.assessment_id = al.assessment_id AND s.learner_id = al.learner_id
       ORDER BY s.attempt_number DESC LIMIT 1) AS latest_submitted_at,
      aa.attempt_number AS active_attempt_number,
      aa.started_at AS active_started_at
    FROM assessment_learners al
    JOIN users u ON u.id = al.learner_id
    LEFT JOIN assessment_attempts aa
      ON aa.assessment_id = al.assessment_id AND aa.learner_id = al.learner_id
    WHERE al.assessment_id = ${assessmentId}
    ORDER BY u.name
  `);

  const submissionCount = await countSubmissions(assessmentId);

  return {
    assessment: {
      ...assessment,
      submissionCount,
      questions: buildQuestionTree(
        qRows.map((r) => ({
          questionId: r.questionId,
          questionText: r.questionText,
          questionOrder: r.questionOrder,
          optionId: r.optionId,
          optionText: r.optionText,
          optionOrder: r.optionOrder,
          isCorrect: r.isCorrect,
        })),
      ),
      assignedLearners: assignedLearners.rows,
    },
  };
}

export async function assignLearners(
  assessmentId: string,
  learnerIds: string[],
): Promise<{ message: string }> {
  const valid = await assertLearnersExist(learnerIds);
  await db.transaction(async (tx) => {
    await assertAssessmentExists(assessmentId, tx);
    await replaceLearners(assessmentId, valid, tx);
  });
  return { message: 'Assessment learners updated' };
}

export async function grantReattempt(
  assessmentId: string,
  learnerId: string,
): Promise<{ message: string }> {
  await db.transaction(async (tx) => {
    const rows = await tx.execute<{
      active_attempt_number: number | null;
      attempt_count: number;
    }>(sql`
      SELECT aa.attempt_number AS active_attempt_number,
        (SELECT COUNT(*)::int FROM assessment_submissions s
         WHERE s.assessment_id = al.assessment_id AND s.learner_id = al.learner_id) AS attempt_count
      FROM assessment_learners al
      LEFT JOIN assessment_attempts aa
        ON aa.assessment_id = al.assessment_id AND aa.learner_id = al.learner_id
      WHERE al.assessment_id = ${assessmentId} AND al.learner_id = ${learnerId}
      LIMIT 1
    `);

    if (rows.rows.length === 0) {
      throw new HttpError('This learner is not assigned to the assessment', 404);
    }

    const row = rows.rows[0];
    if (row.active_attempt_number) {
      throw new HttpError('This learner already has an active attempt', 409);
    }
    if (Number(row.attempt_count) === 0) {
      throw new HttpError(
        'The learner must complete the assessment before a reattempt can be assigned',
        400,
      );
    }

    await tx
      .update(assessmentLearners)
      .set({
        reattemptsAllowed: sql`${assessmentLearners.reattemptsAllowed} + 1`,
      })
      .where(
        and(
          eq(assessmentLearners.assessmentId, assessmentId),
          eq(assessmentLearners.learnerId, learnerId),
        ),
      );

    await tx
      .update(assessments)
      .set({ resultsReleased: false, updatedAt: new Date() })
      .where(eq(assessments.id, assessmentId));
  });

  return { message: 'Reattempt assigned. Results are pending release again.' };
}

export async function listAssessmentResults(assessmentId: string) {
  await assertAssessmentExists(assessmentId);

  const rows = await db.execute<{
    submission_id: string;
    learner_id: string;
    learner_name: string;
    learner_email: string;
    attempt_number: number;
    score: number;
    total_questions: number;
    percentage: number;
    timed_out: boolean;
    started_at: Date | null;
    submitted_at: Date;
    time_taken_seconds: number | null;
  }>(sql`
    SELECT
      s.id AS submission_id,
      u.id AS learner_id,
      u.name AS learner_name,
      u.email AS learner_email,
      s.attempt_number,
      s.score,
      s.total_questions,
      ROUND((s.score::numeric / NULLIF(s.total_questions, 0)) * 100, 2) AS percentage,
      s.timed_out,
      s.started_at,
      s.submitted_at,
      EXTRACT(EPOCH FROM (s.submitted_at - s.started_at))::int AS time_taken_seconds
    FROM assessment_submissions s
    JOIN users u ON u.id = s.learner_id
    JOIN assessment_learners al
      ON al.assessment_id = s.assessment_id AND al.learner_id = s.learner_id
    WHERE s.assessment_id = ${assessmentId}
    ORDER BY s.submitted_at DESC
  `);

  return { results: rows.rows };
}

export async function listLearnerAssessments(learnerId: string) {
  const rows = await db.execute<{
    id: string;
    title: string;
    description: string | null;
    time_limit_minutes: number;
    allow_retake: boolean;
    results_released: boolean;
    created_at: Date;
    reattempts_allowed: number;
    started_at: Date | null;
    active_attempt_number: number | null;
    remaining_seconds: number | null;
    total_questions: number;
    attempt_count: number;
    score: number | null;
    submitted_total_questions: number | null;
    latest_attempt_number: number | null;
    submitted_at: Date | null;
  }>(sql`
    SELECT
      a.id, a.title, a.description, a.time_limit_minutes, a.allow_retake,
      a.results_released, a.created_at,
      al.reattempts_allowed,
      aa.started_at,
      aa.attempt_number AS active_attempt_number,
      CASE
        WHEN aa.started_at IS NULL THEN NULL
        ELSE GREATEST(
          EXTRACT(EPOCH FROM (aa.started_at + (a.time_limit_minutes || ' minutes')::interval - NOW()))::int,
          0
        )
      END AS remaining_seconds,
      (SELECT COUNT(*)::int FROM assessment_questions q WHERE q.assessment_id = a.id) AS total_questions,
      (SELECT COUNT(*)::int FROM assessment_submissions s
       WHERE s.assessment_id = a.id AND s.learner_id = al.learner_id) AS attempt_count,
      CASE WHEN a.results_released THEN s.score ELSE NULL END AS score,
      CASE WHEN a.results_released THEN s.total_questions ELSE NULL END AS submitted_total_questions,
      s.attempt_number AS latest_attempt_number,
      s.submitted_at
    FROM assessment_learners al
    JOIN assessments a ON a.id = al.assessment_id
    LEFT JOIN assessment_attempts aa
      ON aa.assessment_id = a.id AND aa.learner_id = al.learner_id
    LEFT JOIN assessment_submissions s ON s.id = (
      SELECT latest.id FROM assessment_submissions latest
      WHERE latest.assessment_id = a.id AND latest.learner_id = al.learner_id
      ORDER BY latest.attempt_number DESC LIMIT 1
    )
    WHERE al.learner_id = ${learnerId} AND a.is_active = TRUE
    ORDER BY al.assigned_at DESC
  `);

  return {
    assessments: rows.rows.map((a) => ({
      ...a,
      status:
        a.active_attempt_number || !a.submitted_at ? 'pending' : 'completed',
    })),
  };
}

export async function getLearnerAssessment(
  assessmentId: string,
  learnerId: string,
) {
  return db.transaction(async (tx) => {
    const rows = await tx.execute<{
      id: string;
      title: string;
      description: string | null;
      time_limit_minutes: number;
      allow_retake: boolean;
      results_released: boolean;
      reattempts_allowed: number;
      active_attempt_number: number | null;
      active_started_at: Date | null;
      submission_id: string | null;
      latest_attempt_number: number | null;
      score: number | null;
      total_questions: number | null;
      submitted_at: Date | null;
    }>(sql`
      SELECT
        a.id, a.title, a.description, a.time_limit_minutes, a.allow_retake,
        a.results_released, al.reattempts_allowed,
        aa.attempt_number AS active_attempt_number,
        aa.started_at AS active_started_at,
        s.id AS submission_id,
        s.attempt_number AS latest_attempt_number,
        CASE WHEN a.results_released THEN s.score ELSE NULL END AS score,
        CASE WHEN a.results_released THEN s.total_questions ELSE NULL END AS total_questions,
        s.submitted_at
      FROM assessment_learners al
      JOIN assessments a ON a.id = al.assessment_id
      LEFT JOIN assessment_attempts aa
        ON aa.assessment_id = a.id AND aa.learner_id = al.learner_id
      LEFT JOIN assessment_submissions s ON s.id = (
        SELECT latest.id FROM assessment_submissions latest
        WHERE latest.assessment_id = a.id AND latest.learner_id = al.learner_id
        ORDER BY latest.attempt_number DESC LIMIT 1
      )
      WHERE al.learner_id = ${learnerId} AND a.id = ${assessmentId} AND a.is_active = TRUE
      LIMIT 1
    `);

    if (rows.rows.length === 0) {
      throw new HttpError('Assessment not found', 404);
    }

    const current = rows.rows[0];

    if (!current.submitted_at && !current.active_attempt_number) {
      await tx.insert(assessmentAttempts).values({
        assessmentId,
        learnerId,
        attemptNumber: 1,
      });
      current.active_attempt_number = 1;
    }

    const timing = await tx.execute<{
      started_at: Date;
      ends_at: Date;
      remaining_seconds: number;
    }>(sql`
      SELECT
        started_at,
        started_at + (${current.time_limit_minutes} || ' minutes')::interval AS ends_at,
        GREATEST(
          EXTRACT(EPOCH FROM (started_at + (${current.time_limit_minutes} || ' minutes')::interval - NOW()))::int,
          0
        ) AS remaining_seconds
      FROM assessment_attempts
      WHERE assessment_id = ${assessmentId} AND learner_id = ${learnerId}
      LIMIT 1
    `);

    const qRows = await tx
      .select({
        questionId: assessmentQuestions.id,
        questionText: assessmentQuestions.questionText,
        questionOrder: assessmentQuestions.orderIndex,
        optionId: assessmentQuestionOptions.id,
        optionText: assessmentQuestionOptions.optionText,
        optionOrder: assessmentQuestionOptions.orderIndex,
      })
      .from(assessmentQuestions)
      .innerJoin(
        assessmentQuestionOptions,
        eq(assessmentQuestionOptions.questionId, assessmentQuestions.id),
      )
      .where(eq(assessmentQuestions.assessmentId, assessmentId))
      .orderBy(assessmentQuestions.orderIndex, assessmentQuestionOptions.orderIndex);

    return {
      assessment: {
        id: current.id,
        title: current.title,
        description: current.description,
        timeLimitMinutes: current.time_limit_minutes,
        allowRetake: current.allow_retake,
        resultsReleased: current.results_released,
        reattemptsAllowed: current.reattempts_allowed,
        activeAttemptNumber: current.active_attempt_number,
        latestAttemptNumber: current.latest_attempt_number,
        score: current.score,
        totalQuestions: current.total_questions,
        submittedAt: current.submitted_at,
        startedAt: timing.rows[0]?.started_at ?? null,
        endsAt: timing.rows[0]?.ends_at ?? null,
        remainingSeconds: timing.rows[0]?.remaining_seconds ?? null,
        status:
          current.active_attempt_number || !current.submitted_at
            ? 'pending'
            : 'completed',
        questions: buildQuestionTree(
          qRows.map((r) => ({
            questionId: r.questionId,
            questionText: r.questionText,
            questionOrder: r.questionOrder,
            optionId: r.optionId,
            optionText: r.optionText,
            optionOrder: r.optionOrder,
          })),
        ),
      },
    };
  });
}

export async function startRetake(assessmentId: string, learnerId: string) {
  const attemptNumber = await db.transaction(async (tx) => {
    const rows = await tx.execute<{
      allow_retake: boolean;
      reattempts_allowed: number;
      active_attempt_number: number | null;
      attempt_count: number;
    }>(sql`
      SELECT a.allow_retake, al.reattempts_allowed,
        aa.attempt_number AS active_attempt_number,
        (SELECT COUNT(*)::int FROM assessment_submissions s
         WHERE s.assessment_id = a.id AND s.learner_id = al.learner_id) AS attempt_count
      FROM assessment_learners al
      JOIN assessments a ON a.id = al.assessment_id
      LEFT JOIN assessment_attempts aa
        ON aa.assessment_id = a.id AND aa.learner_id = al.learner_id
      WHERE al.learner_id = ${learnerId} AND a.id = ${assessmentId} AND a.is_active = TRUE
      LIMIT 1
    `);

    if (rows.rows.length === 0) throw new HttpError('Assessment not found', 404);

    const a = rows.rows[0];
    const hasGrant = Number(a.reattempts_allowed) > 0;

    if (a.active_attempt_number) {
      throw new HttpError('A retake is already active for this assessment', 409);
    }
    if (!a.allow_retake && !hasGrant) {
      throw new HttpError('Retake is not enabled for this assessment', 403);
    }
    if (Number(a.attempt_count) === 0) {
      throw new HttpError('This assessment has not been completed yet', 400);
    }

    const next = await getNextAttemptNumber(assessmentId, learnerId, tx);

    if (!a.allow_retake && hasGrant) {
      await tx
        .update(assessmentLearners)
        .set({
          reattemptsAllowed: sql`GREATEST(${assessmentLearners.reattemptsAllowed} - 1, 0)`,
        })
        .where(
          and(
            eq(assessmentLearners.assessmentId, assessmentId),
            eq(assessmentLearners.learnerId, learnerId),
          ),
        );
    }

    await tx
      .insert(assessmentAttempts)
      .values({ assessmentId, learnerId, attemptNumber: next })
      .onConflictDoUpdate({
        target: [
          assessmentAttempts.assessmentId,
          assessmentAttempts.learnerId,
        ],
        set: { attemptNumber: next, startedAt: new Date() },
      });

    await tx
      .update(assessments)
      .set({ resultsReleased: false, updatedAt: new Date() })
      .where(eq(assessments.id, assessmentId));

    return next;
  });

  return { message: 'Retake started', attemptNumber };
}

export async function submitAssessment(
  assessmentId: string,
  learnerId: string,
  input: SubmitAssessmentInput,
) {
  const result = await db.transaction(async (tx) => {
    const assigned = await tx.execute<{
      time_limit_minutes: number;
      results_released: boolean;
      active_attempt_number: number | null;
    }>(sql`
      SELECT a.time_limit_minutes, a.results_released,
        aa.attempt_number AS active_attempt_number
      FROM assessment_learners al
      JOIN assessments a ON a.id = al.assessment_id
      LEFT JOIN assessment_attempts aa
        ON aa.assessment_id = a.id AND aa.learner_id = al.learner_id
      WHERE al.learner_id = ${learnerId} AND a.id = ${assessmentId} AND a.is_active = TRUE
      LIMIT 1
    `);

    if (assigned.rows.length === 0) {
      throw new HttpError('Assessment not found', 404);
    }

    const assessment = assigned.rows[0];
    let activeAttempt = Number(assessment.active_attempt_number);

    if (!activeAttempt) {
      const next = await getNextAttemptNumber(assessmentId, learnerId, tx);
      if (next > 1) {
        throw new HttpError('This assessment has already been submitted', 409);
      }
      await tx.insert(assessmentAttempts).values({
        assessmentId,
        learnerId,
        attemptNumber: next,
      });
      activeAttempt = next;
    }

    const timing = await tx.execute<{ remaining_seconds: number; started_at: Date }>(sql`
      SELECT GREATEST(
        EXTRACT(EPOCH FROM (started_at + (${assessment.time_limit_minutes} || ' minutes')::interval - NOW()))::int,
        0
      ) AS remaining_seconds,
      started_at
      FROM assessment_attempts
      WHERE assessment_id = ${assessmentId} AND learner_id = ${learnerId}
      LIMIT 1
    `);

    const existing = await tx
      .select({ id: assessmentSubmissions.id })
      .from(assessmentSubmissions)
      .where(
        and(
          eq(assessmentSubmissions.assessmentId, assessmentId),
          eq(assessmentSubmissions.learnerId, learnerId),
          eq(assessmentSubmissions.attemptNumber, activeAttempt),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new HttpError('This attempt has already been submitted', 409);
    }

    const optionRows = await tx
      .select({
        questionId: assessmentQuestions.id,
        optionId: assessmentQuestionOptions.id,
        isCorrect: assessmentQuestionOptions.isCorrect,
      })
      .from(assessmentQuestions)
      .innerJoin(
        assessmentQuestionOptions,
        eq(assessmentQuestionOptions.questionId, assessmentQuestions.id),
      )
      .where(eq(assessmentQuestions.assessmentId, assessmentId));

    const questions = new Map<string, Map<string, boolean>>();
    for (const row of optionRows) {
      if (!questions.has(row.questionId)) {
        questions.set(row.questionId, new Map());
      }
      questions.get(row.questionId)!.set(row.optionId, row.isCorrect);
    }

    const answersByQuestion = new Map(
      input.answers.map((a) => [a.questionId, a.optionId]),
    );

    if (input.answers.length !== answersByQuestion.size) {
      throw new HttpError('Submission contains duplicate answers', 400);
    }

    let score = 0;
    const checked: Array<{
      questionId: string;
      optionId: string;
      isCorrect: boolean;
    }> = [];

    for (const [questionId, optionId] of answersByQuestion.entries()) {
      const options = questions.get(questionId);
      if (!options?.has(optionId)) {
        throw new HttpError('Submission contains an invalid answer', 400);
      }
      const isCorrect = options.get(optionId)!;
      if (isCorrect) score += 1;
      checked.push({ questionId, optionId, isCorrect });
    }

    const timedOut =
      input.timedOut || Number(timing.rows[0]?.remaining_seconds ?? 0) === 0;

    const [submission] = await tx
      .insert(assessmentSubmissions)
      .values({
        assessmentId,
        learnerId,
        attemptNumber: activeAttempt,
        score,
        totalQuestions: questions.size,
        timedOut,
        startedAt: timing.rows[0]?.started_at
          ? toDate(timing.rows[0].started_at)
          : new Date(),
      })
      .returning({ id: assessmentSubmissions.id });

    for (const answer of checked) {
      await tx.insert(assessmentSubmissionAnswers).values({
        submissionId: submission.id,
        questionId: answer.questionId,
        optionId: answer.optionId,
        isCorrect: answer.isCorrect,
      });
    }

    await tx
      .delete(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.assessmentId, assessmentId),
          eq(assessmentAttempts.learnerId, learnerId),
        ),
      );

    return {
      attemptNumber: activeAttempt,
      score,
      totalQuestions: questions.size,
      answeredQuestions: checked.length,
      unansweredQuestions: questions.size - checked.length,
      resultsReleased: assessment.results_released,
      timedOut,
    };
  });

  const response: Record<string, unknown> = {
    message: result.resultsReleased
      ? 'Assessment submitted'
      : 'Assessment submitted. Result is pending release.',
    attemptNumber: result.attemptNumber,
    totalQuestions: result.totalQuestions,
    answeredQuestions: result.answeredQuestions,
    unansweredQuestions: result.unansweredQuestions,
    resultsReleased: result.resultsReleased,
    timedOut: result.timedOut,
  };

  if (result.resultsReleased) {
    response.score = result.score;
  }

  return response;
}

export async function listLearnerResults(learnerId: string) {
  const rows = await db.execute<{
    id: string;
    assessment_id: string;
    assessment_title: string;
    attempt_number: number;
    score: number;
    total_questions: number;
    percentage: number;
    timed_out: boolean;
    submitted_at: Date;
    time_taken_seconds: number | null;
  }>(sql`
    SELECT
      s.id,
      a.id AS assessment_id,
      a.title AS assessment_title,
      s.attempt_number,
      s.score,
      s.total_questions,
      ROUND((s.score::numeric / NULLIF(s.total_questions, 0)) * 100, 2) AS percentage,
      s.timed_out,
      s.submitted_at,
      EXTRACT(EPOCH FROM (s.submitted_at - s.started_at))::int AS time_taken_seconds
    FROM assessment_submissions s
    JOIN assessments a ON a.id = s.assessment_id
    JOIN assessment_learners al
      ON al.assessment_id = a.id AND al.learner_id = s.learner_id
    WHERE s.learner_id = ${learnerId} AND a.results_released = TRUE
    ORDER BY s.submitted_at DESC
  `);

  return { results: rows.rows };
}

export async function getLearnerSubmissionDetail(
  assessmentId: string,
  learnerId: string,
  submissionId: string,
) {
  const [submission] = await db
    .select({
      id: assessmentSubmissions.id,
      attemptNumber: assessmentSubmissions.attemptNumber,
      score: assessmentSubmissions.score,
      totalQuestions: assessmentSubmissions.totalQuestions,
      timedOut: assessmentSubmissions.timedOut,
      submittedAt: assessmentSubmissions.submittedAt,
      resultsReleased: assessments.resultsReleased,
      title: assessments.title,
    })
    .from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessments.id, assessmentSubmissions.assessmentId))
    .where(
      and(
        eq(assessmentSubmissions.id, submissionId),
        eq(assessmentSubmissions.assessmentId, assessmentId),
        eq(assessmentSubmissions.learnerId, learnerId),
        eq(assessments.resultsReleased, true),
      ),
    )
    .limit(1);

  if (!submission) throw new HttpError('Result not found', 404);

  const answers = await db
    .select({
      questionId: assessmentQuestions.id,
      questionText: assessmentQuestions.questionText,
      orderIndex: assessmentQuestions.orderIndex,
      optionId: assessmentQuestionOptions.id,
      optionText: assessmentQuestionOptions.optionText,
      isCorrect: assessmentSubmissionAnswers.isCorrect,
      selectedOptionId: assessmentSubmissionAnswers.optionId,
    })
    .from(assessmentSubmissionAnswers)
    .innerJoin(
      assessmentQuestions,
      eq(assessmentQuestions.id, assessmentSubmissionAnswers.questionId),
    )
    .innerJoin(
      assessmentQuestionOptions,
      eq(assessmentQuestionOptions.id, assessmentSubmissionAnswers.optionId),
    )
    .where(eq(assessmentSubmissionAnswers.submissionId, submissionId))
    .orderBy(assessmentQuestions.orderIndex);

  return {
    submission: {
      ...submission,
      percentage:
        submission.totalQuestions > 0
          ? Math.round((submission.score / submission.totalQuestions) * 10000) /
            100
          : 0,
      answers,
    },
  };
}

export async function getStaffSubmissionDetail(
  assessmentId: string,
  submissionId: string,
) {
  const [submission] = await db
    .select({
      id: assessmentSubmissions.id,
      learnerId: assessmentSubmissions.learnerId,
      learnerName: users.name,
      learnerEmail: users.email,
      attemptNumber: assessmentSubmissions.attemptNumber,
      score: assessmentSubmissions.score,
      totalQuestions: assessmentSubmissions.totalQuestions,
      timedOut: assessmentSubmissions.timedOut,
      submittedAt: assessmentSubmissions.submittedAt,
    })
    .from(assessmentSubmissions)
    .innerJoin(users, eq(users.id, assessmentSubmissions.learnerId))
    .where(
      and(
        eq(assessmentSubmissions.id, submissionId),
        eq(assessmentSubmissions.assessmentId, assessmentId),
      ),
    )
    .limit(1);

  if (!submission) throw new HttpError('Submission not found', 404);

  const answers = await db
    .select({
      questionId: assessmentQuestions.id,
      questionText: assessmentQuestions.questionText,
      orderIndex: assessmentQuestions.orderIndex,
      optionId: assessmentQuestionOptions.id,
      optionText: assessmentQuestionOptions.optionText,
      isCorrect: assessmentSubmissionAnswers.isCorrect,
    })
    .from(assessmentSubmissionAnswers)
    .innerJoin(
      assessmentQuestions,
      eq(assessmentQuestions.id, assessmentSubmissionAnswers.questionId),
    )
    .innerJoin(
      assessmentQuestionOptions,
      eq(assessmentQuestionOptions.id, assessmentSubmissionAnswers.optionId),
    )
    .where(eq(assessmentSubmissionAnswers.submissionId, submissionId))
    .orderBy(assessmentQuestions.orderIndex);

  return {
    submission: {
      ...submission,
      percentage:
        submission.totalQuestions > 0
          ? Math.round((submission.score / submission.totalQuestions) * 10000) /
            100
          : 0,
      answers,
    },
  };
}
