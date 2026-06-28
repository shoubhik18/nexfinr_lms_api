import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  pgEnum,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const courseTypeEnum = pgEnum('course_type', ['recorded', 'ongoing']);

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  type: courseTypeEnum('type').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  isPublished: boolean('is_published').default(false).notNull(),
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

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
