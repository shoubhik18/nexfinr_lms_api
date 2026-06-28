import {
  pgTable,
  uuid,
  integer,
  jsonb,
  pgEnum,
  timestamp,
} from 'drizzle-orm/pg-core';
import { assignments } from './assignments';
import { users } from './users';

export const submissionStatusEnum = pgEnum('submission_status', [
  'pending',
  'passed',
  'failed',
]);

export type SubmissionData =
  | { answers: number[]; results: boolean[]; feedback?: string }
  | { answer: string; feedback?: string }
  | { language: string; code: string; feedback?: string };

export const assignmentSubmissions = pgTable('assignment_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id')
    .notNull()
    .references(() => assignments.id, { onDelete: 'cascade' }),
  learnerId: uuid('learner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  submissionData: jsonb('submission_data').$type<SubmissionData>().notNull(),
  score: integer('score'),
  status: submissionStatusEnum('status').default('pending').notNull(),
  reviewedBy: uuid('reviewed_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type AssignmentSubmission = typeof assignmentSubmissions.$inferSelect;
export type NewAssignmentSubmission =
  typeof assignmentSubmissions.$inferInsert;
