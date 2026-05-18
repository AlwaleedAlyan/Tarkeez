import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";

import migrations from "./migrations/migrations";
import { db } from "./client";

type MigrationsResult = { success: boolean; error?: Error };

const NOOP: MigrationsResult = { success: true };

function useNativeDbMigrations(): MigrationsResult {
  return useMigrations(db!, migrations);
}

function useNoopDbMigrations(): MigrationsResult {
  return NOOP;
}

export const useDbMigrations: () => MigrationsResult = db
  ? useNativeDbMigrations
  : useNoopDbMigrations;
