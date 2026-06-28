import type { User } from '../../db/schema';
import { users } from '../../db/schema';

export type SafeUser = Omit<User, 'passwordHash'>;

/**
 * Drizzle column projection that returns every user column EXCEPT
 * `passwordHash`. Use as the first argument of `db.select(...)` whenever
 * the result will be sent to a client.
 *
 *   db.select(safeUserColumns).from(users)...
 */
export const safeUserColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  isActive: users.isActive,
  createdBy: users.createdBy,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

/**
 * Strip `passwordHash` from a fetched user row before returning it.
 */
export function toSafeUser(user: User): SafeUser {
  const { passwordHash: _omit, ...safe } = user;
  return safe;
}
