import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  pgEnum,
  timestamp,
} from 'drizzle-orm/pg-core';
import { lessons } from './lessons';

export const assignmentTypeEnum = pgEnum('assignment_type', [
  'mcq',
  'text',
  'code',
]);

export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id')
    .notNull()
    .references(() => lessons.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  type: assignmentTypeEnum('type').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;
