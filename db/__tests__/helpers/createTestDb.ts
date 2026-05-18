import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from '@/db/schema';

/**
 * Opens an in-memory SQLite database using better-sqlite3 + drizzle-orm.
 * All drizzle operations resolve synchronously, which makes tests fast and
 * deterministic.
 *
 * NOTE: better-sqlite3 does NOT allow async transaction callbacks.
 * Functions that use `db.transaction(async (tx) => {...})` in production
 * (e.g. markStrokesServerSyncedLocal) cannot be called directly in tests.
 * Those tests verify the underlying SQL logic using direct db queries.
 *
 * Paths are relative to process.cwd() — always run jest from the project root.
 */
export function createTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './db/migrations' });
  return { db, schema };
}
