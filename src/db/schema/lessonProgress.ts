import {
  pgTable,
  uuid,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { lessons } from './lessons';

export const lessonProgress = pgTable(
  'lesson_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    isCompleted: boolean('is_completed').default(false).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    watchProgressPercent: integer('watch_progress_percent')
      .default(0)
      .notNull(),
    videoWatchedAt: timestamp('video_watched_at', { withTimezone: true }),
    watchTimeSeconds: integer('watch_time_seconds').default(0).notNull(),
  },
  (table) => [
    uniqueIndex('lesson_progress_learner_lesson_unique').on(
      table.learnerId,
      table.lessonId,
    ),
  ],
);

export type LessonProgress = typeof lessonProgress.$inferSelect;
export type NewLessonProgress = typeof lessonProgress.$inferInsert;
