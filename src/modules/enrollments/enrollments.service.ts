import { aliasedTable } from 'drizzle-orm';
import { and, count, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import {
  courses,
  enrollments,
  users,
} from '../../db/schema';
import { HttpError } from '../../shared/utils/response.utils';
import type { Role } from '../../shared/types/express';
import type { CreateEnrollmentInput } from './enrollments.validator';

export interface ListEnrollmentsQuery {
  learnerId?: string;
  courseId?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface EnrollmentRow {
  id: string;
  learnerId: string;
  learnerName: string;
  learnerEmail: string;
  courseId: string;
  courseTitle: string;
  enrolledBy: string | null;
  enrolledByName: string | null;
  enrolledAt: Date;
  completedAt: Date | null;
}

export interface ListEnrollmentsResult {
  enrollments: EnrollmentRow[];
  total: number;
  page: number;
  limit: number;
}

const learner = aliasedTable(users, 'learner');
const enroller = aliasedTable(users, 'enroller');

const enrollmentColumns = {
  id: enrollments.id,
  learnerId: enrollments.learnerId,
  learnerName: learner.name,
  learnerEmail: learner.email,
  courseId: enrollments.courseId,
  courseTitle: courses.title,
  enrolledBy: enrollments.enrolledBy,
  enrolledByName: enroller.name,
  enrolledAt: enrollments.enrolledAt,
  completedAt: enrollments.completedAt,
};

export async function list(
  query: ListEnrollmentsQuery,
): Promise<ListEnrollmentsResult> {
  const { learnerId, courseId, search, page, limit } = query;
  const offset = (page - 1) * limit;

  const filters: SQL[] = [];
  if (learnerId) filters.push(eq(enrollments.learnerId, learnerId));
  if (courseId) filters.push(eq(enrollments.courseId, courseId));
  if (search) {
    const term = `%${search}%`;
    const f = or(
      ilike(learner.name, term),
      ilike(learner.email, term),
      ilike(courses.title, term),
    );
    if (f) filters.push(f);
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select(enrollmentColumns)
    .from(enrollments)
    .innerJoin(learner, eq(learner.id, enrollments.learnerId))
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .leftJoin(enroller, eq(enroller.id, enrollments.enrolledBy))
    .where(whereClause)
    .orderBy(enrollments.enrolledAt)
    .limit(limit)
    .offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(enrollments)
    .innerJoin(learner, eq(learner.id, enrollments.learnerId))
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(whereClause);

  return {
    enrollments: rows,
    total: Number(total),
    page,
    limit,
  };
}

export async function create(
  data: CreateEnrollmentInput,
  enrolledBy: string,
): Promise<EnrollmentRow> {
  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, data.learnerId))
    .limit(1);
  if (!user) throw new HttpError('Learner not found', 400);
  if (user.role !== 'learner') {
    throw new HttpError('User is not a learner', 400);
  }

  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, data.courseId))
    .limit(1);
  if (!course) throw new HttpError('Course not found', 400);

  const [created] = await db
    .insert(enrollments)
    .values({
      learnerId: data.learnerId,
      courseId: data.courseId,
      enrolledBy,
    })
    .returning();
  if (!created) throw new HttpError('Failed to create enrollment', 500);

  const [row] = await db
    .select(enrollmentColumns)
    .from(enrollments)
    .innerJoin(learner, eq(learner.id, enrollments.learnerId))
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .leftJoin(enroller, eq(enroller.id, enrollments.enrolledBy))
    .where(eq(enrollments.id, created.id))
    .limit(1);
  if (!row) throw new HttpError('Failed to load created enrollment', 500);
  return row;
}

export async function deleteById(enrollmentId: string): Promise<void> {
  const [deleted] = await db
    .delete(enrollments)
    .where(eq(enrollments.id, enrollmentId))
    .returning({ id: enrollments.id });
  if (!deleted) throw new HttpError('Enrollment not found', 404);
}

export interface BulkEnrollResult {
  enrolled: EnrollmentRow[];
  notFound: string[];
  notLearner: string[];
  alreadyEnrolled: string[];
}

export async function bulkCreateByEmails(
  courseId: string,
  rawEmails: string[],
  enrolledBy: string,
): Promise<BulkEnrollResult> {
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) throw new HttpError('Course not found', 404);

  const emails = [
    ...new Set(
      rawEmails.map((e) => e.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  if (emails.length === 0) {
    throw new HttpError('Provide at least one valid email', 400);
  }

  const emailConditions = emails.map((email) =>
    eq(sql`lower(${users.email})`, email),
  );
  const matchedUsers =
    emailConditions.length > 0
      ? await db
          .select({ id: users.id, email: users.email, role: users.role })
          .from(users)
          .where(or(...emailConditions))
      : [];

  const userByEmail = new Map(
    matchedUsers.map((u) => [u.email.toLowerCase(), u] as const),
  );

  const notFound: string[] = [];
  const notLearner: string[] = [];
  const learnerIds: string[] = [];

  for (const email of emails) {
    const user = userByEmail.get(email);
    if (!user) {
      notFound.push(email);
      continue;
    }
    if (user.role !== 'learner') {
      notLearner.push(email);
      continue;
    }
    learnerIds.push(user.id);
  }

  const existing =
    learnerIds.length > 0
      ? await db
          .select({ learnerId: enrollments.learnerId })
          .from(enrollments)
          .where(
            and(
              eq(enrollments.courseId, courseId),
              inArray(enrollments.learnerId, learnerIds),
            ),
          )
      : [];

  const existingLearnerIds = new Set(existing.map((e) => e.learnerId));
  const alreadyEnrolled: string[] = [];
  const toEnroll: string[] = [];

  for (const email of emails) {
    const user = userByEmail.get(email);
    if (!user || user.role !== 'learner') continue;
    if (existingLearnerIds.has(user.id)) {
      alreadyEnrolled.push(email);
    } else {
      toEnroll.push(user.id);
    }
  }

  const enrolled: EnrollmentRow[] = [];
  for (const learnerId of toEnroll) {
    const [created] = await db
      .insert(enrollments)
      .values({
        learnerId,
        courseId,
        enrolledBy,
      })
      .onConflictDoNothing({
        target: [enrollments.learnerId, enrollments.courseId],
      })
      .returning();

    if (!created) {
      const user = matchedUsers.find((u) => u.id === learnerId);
      if (user) alreadyEnrolled.push(user.email.toLowerCase());
      continue;
    }

    const [row] = await db
      .select(enrollmentColumns)
      .from(enrollments)
      .innerJoin(learner, eq(learner.id, enrollments.learnerId))
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .leftJoin(enroller, eq(enroller.id, enrollments.enrolledBy))
      .where(eq(enrollments.id, created.id))
      .limit(1);
    if (row) enrolled.push(row);
  }

  return { enrolled, notFound, notLearner, alreadyEnrolled };
}

export interface LearnerEnrollmentRow {
  id: string;
  courseId: string;
  course: {
    id: string;
    title: string;
    description: string | null;
    type: 'recorded' | 'ongoing';
    thumbnailUrl: string | null;
    isPublished: boolean;
  };
  enrolledAt: Date;
  completedAt: Date | null;
  progress: {
    totalLessons: number;
    completedLessons: number;
    percentComplete: number;
  };
}

export async function getByLearner(
  learnerId: string,
  requesterId: string,
  requesterRole: Role,
): Promise<LearnerEnrollmentRow[]> {
  if (requesterRole === 'learner' && learnerId !== requesterId) {
    throw new HttpError('Forbidden', 403);
  }

  const rows = await db
    .select({
      id: enrollments.id,
      courseId: enrollments.courseId,
      enrolledAt: enrollments.enrolledAt,
      completedAt: enrollments.completedAt,
      course: {
        id: courses.id,
        title: courses.title,
        description: courses.description,
        type: courses.type,
        thumbnailUrl: courses.thumbnailUrl,
        isPublished: courses.isPublished,
      },
      // Subqueries use fully qualified column names so they correlate with the
      // outer `courses` row instead of resolving to the inner FROM scope.
      totalLessons: sql<number>`(
        SELECT COUNT(*)::int FROM lessons
        LEFT JOIN course_modules
          ON lessons.module_id = course_modules.id
        WHERE course_modules.course_id = courses.id
           OR lessons.course_id = courses.id
      )`,
      completedLessons: sql<number>`(
        SELECT COUNT(*)::int FROM lesson_progress
        INNER JOIN lessons ON lesson_progress.lesson_id = lessons.id
        LEFT JOIN course_modules
          ON lessons.module_id = course_modules.id
        WHERE (course_modules.course_id = courses.id OR lessons.course_id = courses.id)
          AND lesson_progress.learner_id = ${learnerId}
          AND lesson_progress.is_completed = true
      )`,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(eq(enrollments.learnerId, learnerId))
    .orderBy(enrollments.enrolledAt);

  return rows.map((row) => {
    const total = Number(row.totalLessons);
    const completed = Number(row.completedLessons);
    const percent =
      total === 0 ? 0 : Math.round((completed / total) * 100);
    return {
      id: row.id,
      courseId: row.courseId,
      course: row.course,
      enrolledAt: row.enrolledAt,
      completedAt: row.completedAt,
      progress: {
        totalLessons: total,
        completedLessons: completed,
        percentComplete: percent,
      },
    };
  });
}
