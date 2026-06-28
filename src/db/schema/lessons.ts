import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { courseModules } from './courseModules';
import { courses } from './courses';

export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleId: uuid('module_id').references(() => courseModules.id, {
    onDelete: 'cascade',
  }),
  // Set for recorded courses only (lesson belongs to a module).
  courseId: uuid('course_id').references(() => courses.id, {
    onDelete: 'cascade',
  }),
  // Set for ongoing courses only (flat lesson list under course).
  title: varchar('title', { length: 255 }).notNull(),
  vimeoUrl: text('vimeo_url').notNull(),
  orderIndex: integer('order_index').notNull(),
  isPublished: boolean('is_published').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;
