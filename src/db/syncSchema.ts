import { pool } from './pool';
import { logger } from '../shared/logger';

/**
 * Self-healing schema sync.
 *
 * Runs on every app start. Fully idempotent:
 *   - ENUMs created with the `DO $$ EXCEPTION duplicate_object` pattern.
 *   - Tables created with `CREATE TABLE IF NOT EXISTS`.
 *   - Forward-only column additions go in the marked block below as
 *     `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`.
 *
 * Wrapped in a single transaction so a partial failure never leaves the DB
 * in a half-applied state. Throws on failure — the bootstrap should crash
 * rather than serve traffic against a broken schema.
 */
export async function syncSchema(): Promise<void> {
  logger.info('Syncing database schema...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // -----------------------------------------------------------------------
    // ENUM types
    // -----------------------------------------------------------------------
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('admin','support','learner');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE course_type AS ENUM ('recorded','ongoing');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE assignment_type AS ENUM ('mcq','text','code');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE submission_status AS ENUM ('pending','passed','failed');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // -----------------------------------------------------------------------
    // Tables
    // -----------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(512) NOT NULL,
        role user_role NOT NULL,
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        type course_type NOT NULL,
        thumbnail_url TEXT,
        is_published BOOLEAN DEFAULT false NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS course_modules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        order_index INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS lessons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        module_id UUID REFERENCES course_modules(id) ON DELETE CASCADE,
        course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        vimeo_url TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        is_published BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        type assignment_type NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mcq_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        options JSONB NOT NULL,
        correct_index INTEGER NOT NULL,
        order_index INTEGER NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assignment_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        submission_data JSONB NOT NULL,
        score INTEGER,
        status submission_status DEFAULT 'pending' NOT NULL,
        reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        submitted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS enrollments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        enrolled_by UUID REFERENCES users(id) ON DELETE SET NULL,
        enrolled_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        completed_at TIMESTAMPTZ,
        UNIQUE(learner_id, course_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS lesson_progress (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        is_completed BOOLEAN DEFAULT false NOT NULL,
        completed_at TIMESTAMPTZ,
        UNIQUE(learner_id, lesson_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
    `);

    // -----------------------------------------------------------------------
    // Forward-only column additions
    // Add new columns here as the schema evolves. Each statement must be
    // idempotent (use `ADD COLUMN IF NOT EXISTS`). Never DROP columns here —
    // do that with an explicit, reviewed migration.
    //
    // Example:
    //   await client.query(
    //     `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);`
    //   );
    // -----------------------------------------------------------------------

    // Recorded vs ongoing: lessons can belong to a module OR directly to a course.
    await client
      .query(
        `ALTER TABLE lessons ALTER COLUMN module_id DROP NOT NULL`,
      )
      .catch(() => {
        /* already nullable */
      });

    await client.query(`
      ALTER TABLE lessons ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE
    `);

    await client.query(`
      ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS watch_progress_percent INTEGER DEFAULT 0 NOT NULL
    `);

    await client.query(`
      ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS video_watched_at TIMESTAMPTZ
    `);

    await client.query(`
      ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS watch_time_seconds INTEGER DEFAULT 0 NOT NULL
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assessments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(180) NOT NULL,
        description TEXT,
        time_limit_minutes INTEGER NOT NULL DEFAULT 30,
        allow_retake BOOLEAN NOT NULL DEFAULT FALSE,
        results_released BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assessment_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        UNIQUE (assessment_id, order_index)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assessment_question_options (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        question_id UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
        option_text VARCHAR(600) NOT NULL,
        order_index INTEGER NOT NULL,
        is_correct BOOLEAN NOT NULL DEFAULT FALSE,
        UNIQUE (question_id, order_index)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assessment_learners (
        assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reattempts_allowed INTEGER NOT NULL DEFAULT 0,
        assigned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        PRIMARY KEY (assessment_id, learner_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assessment_attempts (
        assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        attempt_number INTEGER NOT NULL DEFAULT 1,
        started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        PRIMARY KEY (assessment_id, learner_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assessment_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        attempt_number INTEGER NOT NULL DEFAULT 1,
        score INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        timed_out BOOLEAN NOT NULL DEFAULT FALSE,
        started_at TIMESTAMPTZ,
        submitted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        UNIQUE (assessment_id, learner_id, attempt_number)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assessment_submission_answers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id UUID NOT NULL REFERENCES assessment_submissions(id) ON DELETE CASCADE,
        question_id UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
        option_id UUID NOT NULL REFERENCES assessment_question_options(id) ON DELETE CASCADE,
        is_correct BOOLEAN NOT NULL,
        UNIQUE (submission_id, question_id)
      )
    `);

    await client.query(`
      ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ
    `);

    await client.query('COMMIT');
    logger.info('Database schema synced');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Schema sync failed', { error: err });
    throw err;
  } finally {
    client.release();
  }
}
