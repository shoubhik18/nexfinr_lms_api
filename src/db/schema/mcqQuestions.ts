import { pgTable, uuid, text, integer, jsonb } from 'drizzle-orm/pg-core';
import { assignments } from './assignments';

export const mcqQuestions = pgTable('mcq_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id')
    .notNull()
    .references(() => assignments.id, { onDelete: 'cascade' }),
  questionText: text('question_text').notNull(),
  options: jsonb('options').$type<string[]>().notNull(),
  correctIndex: integer('correct_index').notNull(),
  orderIndex: integer('order_index').notNull(),
});

export type McqQuestion = typeof mcqQuestions.$inferSelect;
export type NewMcqQuestion = typeof mcqQuestions.$inferInsert;
