import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";

import * as schema from "./schema";

const DB_NAME = "tarkeez.db";

type Db = ExpoSQLiteDatabase<typeof schema>;

function canUseSqliteOnWeb(): boolean {
  if (Platform.OS !== "web") return true;
  // Disable expo-sqlite WASM on the web. openDatabaseSync() causes 
  // [Error: Sync operation timeout] because it spin-locks the main thread 
  // waiting for the async .wasm download to finish. 
  // The app will use the robust Supabase fallback implemented in LibraryContext.
  return false;
}

let _expoDb: SQLiteDatabase | null = null;
let _db: Db | null = null;

if (canUseSqliteOnWeb()) {
  _expoDb = openDatabaseSync(DB_NAME, { enableChangeListener: true });
  if (Platform.OS !== "web") {
    _expoDb.execSync("PRAGMA journal_mode = WAL;");
    _expoDb.execSync("PRAGMA foreign_keys = ON;");
  }
  _db = drizzle(_expoDb, { schema });
  if (Platform.OS === "web") {
    console.info("[db] SQLite (WASM) enabled on web");
  }
} else if (Platform.OS === "web") {
  console.info(
    "[db] SQLite (WASM) skipped — SharedArrayBuffer unavailable; using legacy fallback",
  );
}

export const db: Db | null = _db;
export const sqlite: SQLiteDatabase | null = _expoDb;
export { schema };
export type Database = Db;
