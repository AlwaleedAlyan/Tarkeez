import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";

export type CachedVerdict = {
  videoId: string;
  isEducational: boolean;
  reason: string;
  classifiedAt: number;
};

export async function getCached(videoId: string): Promise<CachedVerdict | null> {
  if (!db) return null;
  const rows = await db
    .select()
    .from(schema.youtubeClassifications)
    .where(eq(schema.youtubeClassifications.videoId, videoId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    videoId: row.videoId,
    isEducational: row.isEducational,
    reason: row.reason,
    classifiedAt: row.classifiedAt,
  };
}

export async function setCached(
  videoId: string,
  verdict: { isEducational: boolean; reason: string },
): Promise<void> {
  if (!db) return;
  const classifiedAt = Date.now();
  await db
    .insert(schema.youtubeClassifications)
    .values({
      videoId,
      isEducational: verdict.isEducational,
      reason: verdict.reason,
      classifiedAt,
    })
    .onConflictDoUpdate({
      target: schema.youtubeClassifications.videoId,
      set: {
        isEducational: verdict.isEducational,
        reason: verdict.reason,
        classifiedAt,
      },
    });
}
