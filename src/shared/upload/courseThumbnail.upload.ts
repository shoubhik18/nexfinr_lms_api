import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';

const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');
const COURSE_DIR = path.join(UPLOAD_ROOT, 'courses');

fs.mkdirSync(COURSE_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, COURSE_DIR);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const uploadCourseThumbnail = multer({
  storage,
  limits: { fileSize: env.UPLOAD_MAX_BYTES },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'));
      return;
    }
    cb(null, true);
  },
});

export function publicUploadUrl(relativePath: string): string {
  const normalized = relativePath.startsWith('/')
    ? relativePath
    : `/${relativePath}`;
  return `${env.API_PUBLIC_URL}${normalized}`;
}
