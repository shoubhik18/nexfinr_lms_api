// 1. Validate env BEFORE anything else loads (loads `.env.prod`).
import { env } from './config/env';

import helmet from 'helmet';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';

import { logger } from './shared/logger';
import { bootstrapApplication } from './db/bootstrap';
import { logBootstrapFailure } from './shared/utils/pgError.utils';
import { errorMiddleware } from './middleware/error.middleware';
import { success } from './shared/utils/response.utils';

import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import coursesRoutes from './modules/courses/courses.routes';
import courseModulesRoutes from './modules/courseModules/courseModules.routes';
import lessonsRoutes from './modules/lessons/lessons.routes';
import assignmentsRoutes from './modules/assignments/assignments.routes';
import enrollmentsRoutes from './modules/enrollments/enrollments.routes';
import progressRoutes from './modules/progress/progress.routes';
import assessmentsRoutes from './modules/assessments/assessments.routes';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// 2. Core middleware
app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (no Origin header) and listed frontends.
      if (!origin || env.FRONTEND_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(
  '/uploads',
  express.static(path.resolve(process.cwd(), 'uploads'), {
    maxAge: env.IS_PROD ? '7d' : 0,
  }),
);

// 3. HTTP access log → winston `http` level.
app.use(
  morgan(env.IS_PROD ? 'combined' : 'dev', {
    stream: {
      write: (msg: string) => logger.http(msg.trim()),
    },
  }),
);

// 4. Health check
app.get('/health', (_req: Request, res: Response) => {
  success(
    res,
    {
      status: 'ok',
      env: env.NODE_ENV,
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    'OK',
  );
});

// 5. API routers — mounted under /api/v1
app.get('/api/v1', (_req: Request, res: Response) => {
  success(res, { version: '1.0.0' }, 'lms-backend API');
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/courses', coursesRoutes);
// Nested resources mount at the API root and declare their own full paths.
app.use('/api/v1', courseModulesRoutes); // /api/v1/courses/:id/modules/...
app.use('/api/v1', lessonsRoutes); // /api/v1/modules/:id/lessons/...
app.use('/api/v1', assignmentsRoutes); // /api/v1/lessons/:id/assignments/... and /api/v1/assignments/...
app.use('/api/v1/enrollments', enrollmentsRoutes);
app.use('/api/v1', progressRoutes); // /api/v1/progress/...
app.use('/api/v1', assessmentsRoutes); // /api/v1/assessments/...

// 6. Error middleware LAST.
app.use(errorMiddleware);

// 7. Bootstrap — strict order: connect → schema sync → admin seed → listen
bootstrapApplication(app).catch((err) => {
  logBootstrapFailure(err, env.database);
  process.exit(1);
});

export default app;
