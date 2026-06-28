import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  assignments,
  assignmentSubmissions,
  courseModules,
  courses,
  enrollments,
  lessonProgress,
  lessons,
} from '../../db/schema';
import { HttpError } from '../../shared/utils/response.utils';
import type { WatchProgressInput } from './progress.validator';

// Threshold (percent) at which a video counts as "watched"
export const WATCH_THRESHOLD = 80;

async function resolveCourseForLesson(lessonId: string) {
  const [lesson] = await db
    .select({
      id: lessons.id,
      moduleId: lessons.moduleId,
      courseId: lessons.courseId,
    })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!lesson) throw new HttpError('Lesson not found', 404);

  let courseId: string;
  if (lesson.moduleId) {
    const [module] = await db
      .select({ courseId: courseModules.courseId })
      .from(courseModules)
      .where(eq(courseModules.id, lesson.moduleId))
      .limit(1);
    if (!module) throw new HttpError('Module not found', 404);
    courseId = module.courseId;
  } else if (lesson.courseId) {
    courseId = lesson.courseId;
  } else {
    throw new HttpError('Lesson is not linked to a course or module', 400);
  }

  const [course] = await db
    .select({ id: courses.id, type: courses.type })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) throw new HttpError('Course not found', 404);

  return { lesson, course };
}

export async function markComplete(
  lessonId: string,
  learnerId: string,
): Promise<{ success: true }> {
  const { course } = await resolveCourseForLesson(lessonId);

  const [enrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, course.id),
        eq(enrollments.learnerId, learnerId),
      ),
    )
    .limit(1);
  if (!enrollment) {
    throw new HttpError('Not enrolled in this course', 403);
  }

  await assertVideoWatched(lessonId, learnerId);
  await assertAllAssignmentsPassed(lessonId, learnerId);

  const completedAt = new Date();

  await db
    .insert(lessonProgress)
    .values({
      learnerId,
      lessonId,
      isCompleted: true,
      completedAt,
    })
    .onConflictDoUpdate({
      target: [lessonProgress.learnerId, lessonProgress.lessonId],
      set: { isCompleted: true, completedAt },
    });

  return { success: true };
}

async function assertVideoWatched(
  lessonId: string,
  learnerId: string,
): Promise<void> {
  const [progress] = await db
    .select({
      watchProgressPercent: lessonProgress.watchProgressPercent,
      videoWatchedAt: lessonProgress.videoWatchedAt,
    })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.learnerId, learnerId),
        eq(lessonProgress.lessonId, lessonId),
      ),
    )
    .limit(1);

  const watched =
    Boolean(progress?.videoWatchedAt) ||
    (progress?.watchProgressPercent ?? 0) >= WATCH_THRESHOLD;

  if (!watched) {
    throw new HttpError(
      'Watch the video before marking this lesson complete',
      400,
    );
  }
}

function mapWatchFields(
  progress:
    | {
        watchProgressPercent: number;
        videoWatchedAt: Date | null;
      }
    | undefined,
) {
  const watchProgressPercent = progress?.watchProgressPercent ?? 0;
  const isVideoWatched =
    Boolean(progress?.videoWatchedAt) ||
    watchProgressPercent >= WATCH_THRESHOLD;
  return { watchProgressPercent, isVideoWatched };
}

export async function recordWatchProgress(
  lessonId: string,
  learnerId: string,
  input: WatchProgressInput,
): Promise<{ watchProgressPercent: number; isVideoWatched: boolean }> {
  const { course } = await resolveCourseForLesson(lessonId);

  const [enrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, course.id),
        eq(enrollments.learnerId, learnerId),
      ),
    )
    .limit(1);
  if (!enrollment) {
    throw new HttpError('Not enrolled in this course', 403);
  }

  const requested = Math.min(
    100,
    Math.max(0, Math.round(input.watchProgressPercent)),
  );
  const timeDelta = Math.min(
    120,
    Math.max(0, Math.round(input.watchTimeDeltaSeconds ?? 0)),
  );

  const [existing] = await db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.learnerId, learnerId),
        eq(lessonProgress.lessonId, lessonId),
      ),
    )
    .limit(1);

  const currentPercent = existing?.watchProgressPercent ?? 0;
  const nextPercent = Math.max(currentPercent, requested);
  const currentWatchTime = existing?.watchTimeSeconds ?? 0;
  const nextWatchTime = currentWatchTime + timeDelta;
  const crossedThreshold =
    nextPercent >= WATCH_THRESHOLD && !existing?.videoWatchedAt;
  const videoWatchedAt =
    existing?.videoWatchedAt ?? (crossedThreshold ? new Date() : null);

  if (
    nextPercent === currentPercent &&
    !crossedThreshold &&
    existing?.videoWatchedAt &&
    timeDelta === 0
  ) {
    return mapWatchFields(existing);
  }

  const [saved] = await db
    .insert(lessonProgress)
    .values({
      learnerId,
      lessonId,
      watchProgressPercent: nextPercent,
      videoWatchedAt,
      watchTimeSeconds: nextWatchTime,
    })
    .onConflictDoUpdate({
      target: [lessonProgress.learnerId, lessonProgress.lessonId],
      set: {
        watchProgressPercent: nextPercent,
        watchTimeSeconds: nextWatchTime,
        ...(crossedThreshold ? { videoWatchedAt: new Date() } : {}),
      },
    })
    .returning({
      watchProgressPercent: lessonProgress.watchProgressPercent,
      videoWatchedAt: lessonProgress.videoWatchedAt,
    });

  return mapWatchFields(saved);
}

async function assertAllAssignmentsPassed(
  lessonId: string,
  learnerId: string,
): Promise<void> {
  const lessonAssignments = await db
    .select({ id: assignments.id, type: assignments.type })
    .from(assignments)
    .where(eq(assignments.lessonId, lessonId));

  if (lessonAssignments.length === 0) return;

  const ids = lessonAssignments.map((a) => a.id);
  const latest = await fetchLatestSubmissions(learnerId, ids);

  for (const a of lessonAssignments) {
    const sub = latest.get(a.id);
    if (a.type === 'mcq') {
      if (!sub) {
        throw new HttpError('Complete all assignments first', 400);
      }
      continue;
    }
    if (!sub || sub.status !== 'passed') {
      throw new HttpError(
        'Pass all assignments before marking this lesson complete',
        400,
      );
    }
  }
}

// ----------------------------------------------------------------------------
// Course progress detail
// ----------------------------------------------------------------------------

export interface ProgressAssignment {
  id: string;
  title: string;
  type: 'mcq' | 'text' | 'code';
  submission: {
    id: string;
    status: 'pending' | 'passed' | 'failed';
    score: number | null;
    submittedAt: Date;
  } | null;
}
export interface ProgressLesson {
  id: string;
  title: string;
  orderIndex: number;
  vimeoUrl: string;
  isPublished: boolean;
  isCompleted: boolean;
  isLocked: boolean;
  watchProgressPercent: number;
  isVideoWatched: boolean;
  assignments: ProgressAssignment[];
}
export interface ProgressModule {
  id: string;
  title: string;
  orderIndex: number;
  lessons: ProgressLesson[];
}
export interface CourseProgress {
  totalLessons: number;
  completedLessons: number;
  percentComplete: number;
  modules: ProgressModule[];
  lessons: ProgressLesson[];
}

async function fetchLatestSubmissions(
  learnerId: string,
  assignmentIds: string[],
) {
  type SubmissionRow = {
    id: string;
    assignmentId: string;
    status: 'pending' | 'passed' | 'failed';
    score: number | null;
    submittedAt: Date;
  };
  if (assignmentIds.length === 0) return new Map<string, SubmissionRow>();

  const submissions = await db
    .select({
      id: assignmentSubmissions.id,
      assignmentId: assignmentSubmissions.assignmentId,
      status: assignmentSubmissions.status,
      score: assignmentSubmissions.score,
      submittedAt: assignmentSubmissions.submittedAt,
      rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${assignmentSubmissions.assignmentId} ORDER BY ${assignmentSubmissions.submittedAt} DESC)`,
    })
    .from(assignmentSubmissions)
    .where(
      and(
        eq(assignmentSubmissions.learnerId, learnerId),
        inArray(assignmentSubmissions.assignmentId, assignmentIds),
      ),
    )
    .orderBy(desc(assignmentSubmissions.submittedAt))
    .then((rows) =>
      rows
        .filter((r) => r.rn === 1)
        .map(({ rn: _drop, ...rest }) => rest),
    );

  return new Map(submissions.map((s) => [s.assignmentId, s] as const));
}

function formatAssignments(
  lessonAssignments: Array<{
    id: string;
    title: string;
    type: 'mcq' | 'text' | 'code';
  }>,
  latestByAssignment: Map<
    string,
    {
      id: string;
      status: 'pending' | 'passed' | 'failed';
      score: number | null;
      submittedAt: Date;
    }
  >,
): ProgressAssignment[] {
  return lessonAssignments.map((a) => {
    const sub = latestByAssignment.get(a.id);
    return {
      id: a.id,
      title: a.title,
      type: a.type,
      submission: sub
        ? {
            id: sub.id,
            status: sub.status,
            score: sub.score,
            submittedAt: sub.submittedAt,
          }
        : null,
    };
  });
}

export async function getCourseProgress(
  courseId: string,
  learnerId: string,
): Promise<CourseProgress> {
  const [enrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, courseId),
        eq(enrollments.learnerId, learnerId),
      ),
    )
    .limit(1);
  if (!enrollment) throw new HttpError('Not enrolled in this course', 403);

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) throw new HttpError('Course not found', 404);

  if (course.type === 'recorded') {
    const moduleRows = await db
      .select()
      .from(courseModules)
      .where(eq(courseModules.courseId, courseId))
      .orderBy(courseModules.orderIndex);

    const moduleIds = moduleRows.map((m) => m.id);
    if (moduleIds.length === 0) {
      return {
        totalLessons: 0,
        completedLessons: 0,
        percentComplete: 0,
        modules: [],
        lessons: [],
      };
    }

    const lessonRows = await db
      .select()
      .from(lessons)
      .where(inArray(lessons.moduleId, moduleIds))
      .orderBy(lessons.orderIndex);

    const lessonIds = lessonRows.map((l) => l.id);

    const progressRows =
      lessonIds.length > 0
        ? await db
            .select()
            .from(lessonProgress)
            .where(
              and(
                eq(lessonProgress.learnerId, learnerId),
                inArray(lessonProgress.lessonId, lessonIds),
              ),
            )
        : [];
    const progressByLesson = new Map(
      progressRows.map((p) => [p.lessonId, p] as const),
    );

    const assignmentRows =
      lessonIds.length > 0
        ? await db
            .select()
            .from(assignments)
            .where(inArray(assignments.lessonId, lessonIds))
            .orderBy(assignments.orderIndex)
        : [];

    const assignmentsByLesson = new Map<string, typeof assignmentRows>();
    for (const a of assignmentRows) {
      const list = assignmentsByLesson.get(a.lessonId) ?? [];
      list.push(a);
      assignmentsByLesson.set(a.lessonId, list);
    }

    const latestByAssignment = await fetchLatestSubmissions(
      learnerId,
      assignmentRows.map((a) => a.id),
    );

    const lessonsByModule = new Map<string, typeof lessonRows>();
    for (const l of lessonRows) {
      if (!l.moduleId) continue;
      const list = lessonsByModule.get(l.moduleId) ?? [];
      list.push(l);
      lessonsByModule.set(l.moduleId, list);
    }

    let totalLessons = 0;
    let completedLessons = 0;
    const modules: ProgressModule[] = moduleRows.map((m) => {
      const moduleLessons = lessonsByModule.get(m.id) ?? [];
      const builtLessons: ProgressLesson[] = moduleLessons.map((l, i) => {
        const progress = progressByLesson.get(l.id);
        const isCompleted = progress?.isCompleted ?? false;
        const { watchProgressPercent, isVideoWatched } =
          mapWatchFields(progress);

        let isLocked = false;
        if (i > 0) {
          const prev = moduleLessons[i - 1];
          const prevProgress = progressByLesson.get(prev.id);
          isLocked = !(prevProgress?.isCompleted ?? false);
        }

        const lessonAssignments = assignmentsByLesson.get(l.id) ?? [];
        const formattedAssignments = formatAssignments(
          lessonAssignments,
          latestByAssignment,
        );

        totalLessons += 1;
        if (isCompleted) completedLessons += 1;

        return {
          id: l.id,
          title: l.title,
          orderIndex: l.orderIndex,
          vimeoUrl: l.vimeoUrl,
          isPublished: l.isPublished,
          isCompleted,
          isLocked,
          watchProgressPercent,
          isVideoWatched,
          assignments: formattedAssignments,
        };
      });

      return {
        id: m.id,
        title: m.title,
        orderIndex: m.orderIndex,
        lessons: builtLessons,
      };
    });

    const percentComplete =
      totalLessons === 0
        ? 0
        : Math.round((completedLessons / totalLessons) * 100);

    return {
      totalLessons,
      completedLessons,
      percentComplete,
      modules,
      lessons: [],
    };
  }

  // Ongoing: flat lesson list under course
  const lessonRows = await db
    .select()
    .from(lessons)
    .where(eq(lessons.courseId, courseId))
    .orderBy(lessons.orderIndex);

  const lessonIds = lessonRows.map((l) => l.id);

  const progressRows =
    lessonIds.length > 0
      ? await db
          .select()
          .from(lessonProgress)
          .where(
            and(
              eq(lessonProgress.learnerId, learnerId),
              inArray(lessonProgress.lessonId, lessonIds),
            ),
          )
      : [];
  const progressByLesson = new Map(
    progressRows.map((p) => [p.lessonId, p] as const),
  );

  const assignmentRows =
    lessonIds.length > 0
      ? await db
          .select()
          .from(assignments)
          .where(inArray(assignments.lessonId, lessonIds))
          .orderBy(assignments.orderIndex)
      : [];

  const assignmentsByLesson = new Map<string, typeof assignmentRows>();
  for (const a of assignmentRows) {
    const list = assignmentsByLesson.get(a.lessonId) ?? [];
    list.push(a);
    assignmentsByLesson.set(a.lessonId, list);
  }

  const latestByAssignment = await fetchLatestSubmissions(
    learnerId,
    assignmentRows.map((a) => a.id),
  );

  let completedLessons = 0;
  const builtLessons: ProgressLesson[] = lessonRows.map((l) => {
    const progress = progressByLesson.get(l.id);
    const isCompleted = progress?.isCompleted ?? false;
    const { watchProgressPercent, isVideoWatched } = mapWatchFields(progress);
    if (isCompleted) completedLessons += 1;

    const lessonAssignments = assignmentsByLesson.get(l.id) ?? [];
    const formattedAssignments = formatAssignments(
      lessonAssignments,
      latestByAssignment,
    );

    return {
      id: l.id,
      title: l.title,
      orderIndex: l.orderIndex,
      vimeoUrl: l.vimeoUrl,
      isPublished: l.isPublished,
      isCompleted,
      isLocked: false,
      watchProgressPercent,
      isVideoWatched,
      assignments: formattedAssignments,
    };
  });

  const totalLessons = builtLessons.length;
  const percentComplete =
    totalLessons === 0
      ? 0
      : Math.round((completedLessons / totalLessons) * 100);

  return {
    totalLessons,
    completedLessons,
    percentComplete,
    modules: [],
    lessons: builtLessons,
  };
}

export interface LearnerDashboardStats {
  courses: {
    enrolled: number;
    completed: number;
    lessonsCompleted: number;
    totalLessons: number;
    percentComplete: number;
  };
  videos: {
    watched: number;
    total: number;
    watchTimeSeconds: number;
  };
  assessments: {
    assigned: number;
    submitted: number;
    passed: number;
    inProgress: number;
  };
}

export async function getLearnerDashboardStats(
  learnerId: string,
): Promise<LearnerDashboardStats> {
  const courseStats = await db.execute<{
    enrolled: number;
    completed: number;
    lessons_completed: number;
    total_lessons: number;
    videos_watched: number;
    watch_time_seconds: number;
  }>(sql`
    WITH enrolled AS (
      SELECT e.course_id, c.type
      FROM enrollments e
      INNER JOIN courses c ON c.id = e.course_id
      WHERE e.learner_id = ${learnerId}
    ),
    recorded_lessons AS (
      SELECT l.id AS lesson_id, en.course_id
      FROM enrolled en
      INNER JOIN lessons l ON l.is_published = TRUE
      WHERE en.type = 'recorded'
        AND (
          l.course_id = en.course_id
          OR l.module_id IN (
            SELECT m.id FROM course_modules m WHERE m.course_id = en.course_id
          )
        )
    ),
    lesson_stats AS (
      SELECT
        COUNT(DISTINCT rl.lesson_id)::int AS total_lessons,
        COUNT(DISTINCT CASE
          WHEN lp.is_completed = TRUE
            OR lp.video_watched_at IS NOT NULL
            OR lp.watch_progress_percent >= ${WATCH_THRESHOLD}
          THEN rl.lesson_id
        END)::int AS videos_watched,
        COUNT(DISTINCT CASE WHEN lp.is_completed = TRUE THEN rl.lesson_id END)::int AS lessons_completed,
        COALESCE(SUM(lp.watch_time_seconds), 0)::int AS watch_time_seconds
      FROM recorded_lessons rl
      LEFT JOIN lesson_progress lp
        ON lp.lesson_id = rl.lesson_id AND lp.learner_id = ${learnerId}
    ),
    per_course AS (
      SELECT
        en.course_id,
        COUNT(DISTINCT rl.lesson_id)::int AS total_lessons,
        COUNT(DISTINCT CASE WHEN lp.is_completed = TRUE THEN rl.lesson_id END)::int AS completed_lessons
      FROM enrolled en
      INNER JOIN recorded_lessons rl ON rl.course_id = en.course_id
      LEFT JOIN lesson_progress lp
        ON lp.lesson_id = rl.lesson_id AND lp.learner_id = ${learnerId}
      WHERE en.type = 'recorded'
      GROUP BY en.course_id
    )
    SELECT
      (SELECT COUNT(*)::int FROM enrolled) AS enrolled,
      (SELECT COUNT(*)::int FROM per_course
        WHERE total_lessons > 0 AND completed_lessons >= total_lessons) AS completed,
      (SELECT lessons_completed FROM lesson_stats) AS lessons_completed,
      (SELECT total_lessons FROM lesson_stats) AS total_lessons,
      (SELECT videos_watched FROM lesson_stats) AS videos_watched,
      (SELECT watch_time_seconds FROM lesson_stats) AS watch_time_seconds
  `);

  const row = courseStats.rows[0] ?? {
    enrolled: 0,
    completed: 0,
    lessons_completed: 0,
    total_lessons: 0,
    videos_watched: 0,
    watch_time_seconds: 0,
  };

  const totalLessons = row.total_lessons ?? 0;
  const lessonsCompleted = row.lessons_completed ?? 0;

  const assessmentStats = await db.execute<{
    assigned: number;
    submitted: number;
    passed: number;
    in_progress: number;
  }>(sql`
    SELECT
      COUNT(DISTINCT al.assessment_id)::int AS assigned,
      COUNT(DISTINCT CASE WHEN latest.submitted_at IS NOT NULL THEN al.assessment_id END)::int AS submitted,
      COUNT(DISTINCT CASE
        WHEN latest.submitted_at IS NOT NULL
          AND a.results_released = TRUE
          AND latest.score IS NOT NULL
          AND latest.total_questions > 0
          AND latest.score >= latest.total_questions
        THEN al.assessment_id
      END)::int AS passed,
      COUNT(DISTINCT CASE WHEN latest.submitted_at IS NULL THEN al.assessment_id END)::int AS in_progress
    FROM assessment_learners al
    INNER JOIN assessments a ON a.id = al.assessment_id AND a.is_active = TRUE
    LEFT JOIN LATERAL (
      SELECT s.submitted_at, s.score, s.total_questions
      FROM assessment_submissions s
      WHERE s.assessment_id = al.assessment_id AND s.learner_id = al.learner_id
      ORDER BY s.attempt_number DESC
      LIMIT 1
    ) latest ON TRUE
    WHERE al.learner_id = ${learnerId}
  `);

  const aRow = assessmentStats.rows[0] ?? {
    assigned: 0,
    submitted: 0,
    passed: 0,
    in_progress: 0,
  };

  return {
    courses: {
      enrolled: row.enrolled ?? 0,
      completed: row.completed ?? 0,
      lessonsCompleted,
      totalLessons,
      percentComplete:
        totalLessons === 0
          ? 0
          : Math.round((lessonsCompleted / totalLessons) * 100),
    },
    videos: {
      watched: row.videos_watched ?? 0,
      total: totalLessons,
      watchTimeSeconds: row.watch_time_seconds ?? 0,
    },
    assessments: {
      assigned: aRow.assigned ?? 0,
      submitted: aRow.submitted ?? 0,
      passed: aRow.passed ?? 0,
      inProgress: aRow.in_progress ?? 0,
    },
  };
}
