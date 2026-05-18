import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";

export async function getMeta(key: string): Promise<string | null> {
  if (!db) return null;
  const rows = await db
    .select()
    .from(schema.meta)
    .where(eq(schema.meta.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  if (!db) return;
  await db
    .insert(schema.meta)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.meta.key, set: { value } });
}

export async function getLastPulledAt(): Promise<number | null> {
  const raw = await getMeta("last_pulled_at");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
