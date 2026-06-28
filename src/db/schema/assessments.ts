import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const assessments = pgTable('assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 180 }).notNull(),
  description: text('description'),
  timeLimitMinutes: integer('time_limit_minutes').notNull().default(30),
  allowRetake: boolean('allow_retake').notNull().default(false),
  resultsReleased: boolean('results_released').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const assessmentQuestions = pgTable(
  'assessment_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    questionText: text('question_text').notNull(),
    orderIndex: integer('order_index').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('uq_assessment_questions_assessment_order').on(
      t.assessmentId,
      t.orderIndex,
    ),
  ],
);

export const assessmentQuestionOptions = pgTable(
  'assessment_question_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => assessmentQuestions.id, { onDelete: 'cascade' }),
    optionText: varchar('option_text', { length: 600 }).notNull(),
    orderIndex: integer('order_index').notNull(),
    isCorrect: boolean('is_correct').notNull().default(false),
  },
  (t) => [
    uniqueIndex('uq_assessment_options_question_order').on(
      t.questionId,
      t.orderIndex,
    ),
  ],
);

export const assessmentLearners = pgTable(
  'assessment_learners',
  {
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reattemptsAllowed: integer('reattempts_allowed').notNull().default(0),
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.assessmentId, t.learnerId] })],
);

export const assessmentAttempts = pgTable(
  'assessment_attempts',
  {
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull().default(1),
    startedAt: timestamp('started_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.assessmentId, t.learnerId] })],
);

export const assessmentSubmissions = pgTable(
  'assessment_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull().default(1),
    score: integer('score').notNull(),
    totalQuestions: integer('total_questions').notNull(),
    timedOut: boolean('timed_out').notNull().default(false),
    startedAt: timestamp('started_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('uq_assessment_submissions_attempt').on(
      t.assessmentId,
      t.learnerId,
      t.attemptNumber,
    ),
  ],
);

export const assessmentSubmissionAnswers = pgTable(
  'assessment_submission_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => assessmentSubmissions.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => assessmentQuestions.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => assessmentQuestionOptions.id, { onDelete: 'cascade' }),
    isCorrect: boolean('is_correct').notNull(),
  },
  (t) => [
    uniqueIndex('uq_assessment_submission_question').on(
      t.submissionId,
      t.questionId,
    ),
  ],
);

export type Assessment = typeof assessments.$inferSelect;
export type AssessmentQuestion = typeof assessmentQuestions.$inferSelect;
export type AssessmentQuestionOption =
  typeof assessmentQuestionOptions.$inferSelect;
