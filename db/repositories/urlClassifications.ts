import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";

export type CachedUrlVerdict = {
  domain: string;
  isEducational: boolean;
  reason: string;
  classifiedAt: number;
};

export async function getCached(domain: string): Promise<CachedUrlVerdict | null> {
  if (!db) return null;
  const rows = await db
    .select()
    .from(schema.urlClassifications)
    .where(eq(schema.urlClassifications.domain, domain))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    domain: row.domain,
    isEducational: row.isEducational,
    reason: row.reason,
    classifiedAt: row.classifiedAt,
  };
}

export async function setCached(
  domain: string,
  verdict: { isEducational: boolean; reason: string },
): Promise<void> {
  if (!db) return;
  const classifiedAt = Date.now();
  await db
    .insert(schema.urlClassifications)
    .values({
      domain,
      isEducational: verdict.isEducational,
      reason: verdict.reason,
      classifiedAt,
    })
    .onConflictDoUpdate({
      target: schema.urlClassifications.domain,
      set: {
        isEducational: verdict.isEducational,
        reason: verdict.reason,
        classifiedAt,
      },
    });
}
