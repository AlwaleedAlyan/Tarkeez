import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Session, Stroke } from "@/contexts/LibraryContext";

import { db } from "./client";
import { getMeta, setMeta } from "./repositories/meta";
import { setNoteStrokesManifest } from "./repositories/notes";
import { upsertLocalPendingSessions } from "./repositories/sessions";
import { upsertAnnotations } from "./repositories/annotations";
import { writeStrokesFile } from "./strokesStore";

const SENTINEL_KEY = "backfill_v2_done";

function sessionsKey(userId: string) {
  return `@Tarkeez/sessions/${userId}`;
}

function annoKeyPrefix(userId: string) {
  return `@Tarkeez/annos/${userId}/`;
}

function strokesKeyPrefix(userId: string) {
  return `@Tarkeez/note_strokes/${userId}/`;
}

async function drainSessions(userId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(sessionsKey(userId));
  if (!raw) return;
  let parsed: Session[] = [];
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) parsed = data as Session[];
  } catch {
    return;
  }
  if (parsed.length === 0) return;
  await upsertLocalPendingSessions(
    parsed
      .filter((s) => (s.materialId == null) !== (s.noteId == null))
      .map((s) => ({
        id: s.id,
        userId,
        materialId: s.materialId,
        noteId: s.noteId,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationSec: s.durationSec,
        pausedSec: s.pausedSec ?? 0,
        pagesRead: s.pagesRead ?? null,
        pageTimes: s.pageTimes ?? null,
        selections: s.selections ?? null,
        wordsAdded: s.wordsAdded ?? null,
        keystrokes: s.keystrokes ?? null,
        strokesAdded: s.strokesAdded ?? null,
        createdAt: s.endedAt,
        pendingSync: s.pendingSync === true,
      })),
  );
}

async function drainAnnotations(
  userId: string,
  allKeys: readonly string[],
): Promise<void> {
  const prefix = annoKeyPrefix(userId);
  const keys = allKeys.filter((k) => k.startsWith(prefix));
  if (keys.length === 0) return;
  for (const key of keys) {
    const materialId = key.slice(prefix.length);
    if (!materialId) continue;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    let parsed: Record<string, unknown> = {};
    try {
      const data = JSON.parse(raw);
      if (data && typeof data === "object") parsed = data as Record<string, unknown>;
    } catch {
      continue;
    }
    const rows = Object.entries(parsed).map(([page, pageData]) => ({
      userId,
      materialId,
      pageNumber: Number.parseInt(page, 10),
      pageData,
    }));
    await upsertAnnotations(rows.filter((r) => Number.isFinite(r.pageNumber)));
  }
}

async function drainNoteStrokes(
  userId: string,
  allKeys: readonly string[],
): Promise<void> {
  const prefix = strokesKeyPrefix(userId);
  const keys = allKeys.filter((k) => k.startsWith(prefix));
  if (keys.length === 0) return;
  const dirtyAt = Date.now();
  for (const key of keys) {
    const noteId = key.slice(prefix.length);
    if (!noteId) continue;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    let strokes: Stroke[] = [];
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) strokes = data as Stroke[];
    } catch {
      continue;
    }
    const result = await writeStrokesFile(userId, noteId, strokes);
    if (!result) continue;
    // Mark dirty so the future push worker picks it up.
    // No-op if the notes row hasn't been hydrated yet; manifest is re-applied
    // on the next backfill pass once the row exists.
    await setNoteStrokesManifest(noteId, {
      strokesFilePath: result.path,
      strokesByteSize: result.byteSize,
      strokesDirtyAt: dirtyAt,
    });
  }
}

export async function runBackfillForUser(userId: string): Promise<void> {
  if (!db) return;
  const done = await getMeta(SENTINEL_KEY);
  if (done === userId) return;
  const allKeys = await AsyncStorage.getAllKeys();
  await Promise.all([
    drainSessions(userId),
    drainAnnotations(userId, allKeys),
    drainNoteStrokes(userId, allKeys),
  ]);
  await setMeta(SENTINEL_KEY, userId);
}
