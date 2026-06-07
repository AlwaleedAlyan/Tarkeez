import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { registerHandler } from "@/db/sync";
import { api } from "@/lib/api";

type SessionPushPayload = {
  id: string;
  materialId: string | null;
  noteId: string | null;
  externalUrl: string | null;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  pausedSec: number;
  pagesRead: number | null;
  pageTimes: Record<number, number> | null;
  selections: number | null;
  wordsAdded: number | null;
  strokesAdded: number | null;
};

registerHandler("study_sessions", "create", async (_rowId, payload) => {
  const session = payload as SessionPushPayload;
  await api("/sessions", {
    method: "POST",
    json: { session },
  });
  if (db) {
    await db
      .update(schema.studySessions)
      .set({ syncStatus: "synced" })
      .where(eq(schema.studySessions.id, session.id));
  }
});
