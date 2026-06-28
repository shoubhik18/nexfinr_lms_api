import { and, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import { users } from '../../db/schema';
import { hashPassword } from '../../shared/utils/hash.utils';
import { HttpError } from '../../shared/utils/response.utils';
import { safeUserColumns, type SafeUser } from '../../shared/utils/user.utils';
import {
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from '../../shared/utils/email.utils';
import { env } from '../../config/env';
import type { CreateUserInput, UpdateUserInput } from './users.validator';

export function getDefaultPassword(): string {
  const password = env.DEFAULT_USER_PASSWORD;
  if (!password) {
    throw new HttpError(
      'DEFAULT_USER_PASSWORD is not configured on the server',
      500,
    );
  }
  return password;
}

export interface ListUsersQuery {
  role?: 'admin' | 'support' | 'learner';
  search?: string;
  page: number;
  limit: number;
}

export interface ListUsersResult {
  users: SafeUser[];
  total: number;
  page: number;
  limit: number;
}

export async function list(query: ListUsersQuery): Promise<ListUsersResult> {
  const { role, search, page, limit } = query;
  const offset = (page - 1) * limit;

  const filters: SQL[] = [];
  if (role) filters.push(eq(users.role, role));
  if (search) {
    const term = `%${search}%`;
    const searchFilter = or(ilike(users.name, term), ilike(users.email, term));
    if (searchFilter) filters.push(searchFilter);
  }

  const whereClause =
    filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select(safeUserColumns)
    .from(users)
    .where(whereClause)
    .orderBy(users.createdAt)
    .limit(limit)
    .offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(users)
    .where(whereClause);

  return { users: rows, total: Number(total), page, limit };
}

export async function getById(id: string): Promise<SafeUser> {
  const [user] = await db
    .select(safeUserColumns)
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) throw new HttpError('User not found', 404);
  return user;
}

export async function create(
  data: CreateUserInput,
  createdBy: string,
): Promise<SafeUser> {
  const password = getDefaultPassword();
  const passwordHash = await hashPassword(password);

  const [created] = await db
    .insert(users)
    .values({
      name: data.name,
      email: data.email,
      role: data.role,
      passwordHash,
      createdBy,
    })
    .returning();

  if (!created) throw new HttpError('Failed to create user', 500);

  // Fire-and-forget — never block the request on email delivery.
  void sendWelcomeEmail(created.email, created.name, password);

  return {
    id: created.id,
    name: created.name,
    email: created.email,
    role: created.role,
    isActive: created.isActive,
    createdBy: created.createdBy,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

export async function update(
  id: string,
  data: UpdateUserInput,
): Promise<SafeUser> {
  // Avoid pushing an UPDATE with zero columns (Postgres errors on it).
  if (Object.keys(data).length === 0) {
    return getById(id);
  }

  const [updated] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  if (!updated) throw new HttpError('User not found', 404);

  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    isActive: updated.isActive,
    createdBy: updated.createdBy,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

export async function deleteUser(
  id: string,
  requesterId: string,
): Promise<SafeUser> {
  if (id === requesterId) {
    throw new HttpError('Cannot delete yourself', 400);
  }

  const [deleted] = await db.delete(users).where(eq(users.id, id)).returning();
  if (!deleted) throw new HttpError('User not found', 404);

  return {
    id: deleted.id,
    name: deleted.name,
    email: deleted.email,
    role: deleted.role,
    isActive: deleted.isActive,
    createdBy: deleted.createdBy,
    createdAt: deleted.createdAt,
    updatedAt: deleted.updatedAt,
  };
}

export async function toggleStatus(id: string): Promise<SafeUser> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) throw new HttpError('User not found', 404);

  const [updated] = await db
    .update(users)
    .set({ isActive: !user.isActive, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  if (!updated) throw new HttpError('User not found', 404);

  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    isActive: updated.isActive,
    createdBy: updated.createdBy,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

export async function resetPassword(
  id: string,
  newPassword: string,
): Promise<SafeUser> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) throw new HttpError('User not found', 404);

  const passwordHash = await hashPassword(newPassword);

  const [updated] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  if (!updated) throw new HttpError('User not found', 404);

  void sendPasswordResetEmail(updated.email, updated.name, newPassword);

  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    isActive: updated.isActive,
    createdBy: updated.createdBy,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}
