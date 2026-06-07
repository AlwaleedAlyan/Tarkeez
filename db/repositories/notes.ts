import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite/query";

import { db, schema } from "@/db/client";
import {
  deleteStrokesFile,
  writeStrokesFile,
} from "@/db/strokesStore";
import { api } from "@/lib/api";

import type { Note, Stroke } from "@/contexts/LibraryContext";

type ApiNoteRow = {
  id: string;
  title: string;
  contentHtml: string;
  drawingStrokes?: Stroke[];
  createdAt: string;
  updatedAt: string;
};

export type NoteUpsertInput = {
  id: string;
  userId: string;
  title: string;
  contentHtml: string;
  createdAt: number;
  updatedAt: number;
};

type NoteRow = typeof schema.notes.$inferSelect;

function noteFromRow(r: NoteRow): Note {
  return {
    id: r.id,
    title: r.title,
    contentHtml: r.contentHtml,
    drawingStrokes: [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function upsertNotesFromServer(
  rows: NoteUpsertInput[],
): Promise<void> {
  if (!db) return;
  if (rows.length === 0) return;
  const ts = Date.now();
  for (const r of rows) {
    await db
      .insert(schema.notes)
      .values({
        id: r.id,
        userId: r.userId,
        title: r.title,
        contentHtml: r.contentHtml,
        strokesFilePath: null,
        strokesByteSize: 0,
        strokesDirtyAt: null,
        strokesServerSyncedAt: null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        serverUpdatedAt: ts,
        syncStatus: "synced",
        deletedAt: null,
      })
      .onConflictDoUpdate({
        target: schema.notes.id,
        set: {
          title: r.title,
          contentHtml: r.contentHtml,
          updatedAt: r.updatedAt,
          serverUpdatedAt: ts,
        },
        where: sql`${schema.notes.syncStatus} = 'synced'`,
      });
  }
}

export async function upsertNoteLocal(r: NoteUpsertInput): Promise<void> {
  if (!db) return;
  const ts = Date.now();
  await db
    .insert(schema.notes)
    .values({
      id: r.id,
      userId: r.userId,
      title: r.title,
      contentHtml: r.contentHtml,
      strokesFilePath: null,
      strokesByteSize: 0,
      strokesDirtyAt: null,
      strokesServerSyncedAt: null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      serverUpdatedAt: ts,
      syncStatus: "synced",
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: schema.notes.id,
      set: {
        title: r.title,
        contentHtml: r.contentHtml,
        updatedAt: r.updatedAt,
        serverUpdatedAt: ts,
        syncStatus: "synced",
        deletedAt: null,
      },
    });
}

export async function deleteNoteLocal(id: string): Promise<void> {
  if (!db) return;
  await db.delete(schema.notes).where(eq(schema.notes.id, id));
}

export const hardDeleteNoteLocal = deleteNoteLocal;

export type NoteSyncStatus =
  | "synced"
  | "pending_create"
  | "pending_update"
  | "pending_delete";

export async function insertPendingNoteLocal(
  r: NoteUpsertInput,
): Promise<void> {
  if (!db) return;
  await db
    .insert(schema.notes)
    .values({
      id: r.id,
      userId: r.userId,
      title: r.title,
      contentHtml: r.contentHtml,
      strokesFilePath: null,
      strokesByteSize: 0,
      strokesDirtyAt: null,
      strokesServerSyncedAt: null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      serverUpdatedAt: null,
      syncStatus: "pending_create",
      deletedAt: null,
    })
    .onConflictDoNothing({ target: schema.notes.id });
}

export async function updateNoteLocalPending(r: {
  id: string;
  title?: string;
  contentHtml?: string;
  updatedAt: number;
}): Promise<void> {
  if (!db) return;
  const setClause: Record<string, unknown> = {
    updatedAt: r.updatedAt,
    syncStatus: "pending_update",
  };
  if (r.title !== undefined) setClause.title = r.title;
  if (r.contentHtml !== undefined) setClause.contentHtml = r.contentHtml;
  await db
    .update(schema.notes)
    .set(setClause)
    .where(eq(schema.notes.id, r.id));
}

export async function softDeleteNoteLocal(id: string): Promise<void> {
  if (!db) return;
  const now = Date.now();
  await db
    .update(schema.notes)
    .set({ deletedAt: now, syncStatus: "pending_delete", updatedAt: now })
    .where(eq(schema.notes.id, id));
}

export async function markNoteSyncStatusLocal(
  id: string,
  status: NoteSyncStatus,
): Promise<void> {
  if (!db) return;
  await db
    .update(schema.notes)
    .set({ syncStatus: status })
    .where(eq(schema.notes.id, id));
}

export type NoteStrokesManifest = {
  userId: string;
  strokesFilePath: string | null;
  strokesByteSize: number;
  strokesDirtyAt: number | null;
  strokesServerSyncedAt: number | null;
};

export async function getNoteStrokesManifest(
  noteId: string,
): Promise<NoteStrokesManifest | null> {
  if (!db) return null;
  const rows = await db
    .select({
      userId: schema.notes.userId,
      strokesFilePath: schema.notes.strokesFilePath,
      strokesByteSize: schema.notes.strokesByteSize,
      strokesDirtyAt: schema.notes.strokesDirtyAt,
      strokesServerSyncedAt: schema.notes.strokesServerSyncedAt,
    })
    .from(schema.notes)
    .where(eq(schema.notes.id, noteId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.userId,
    strokesFilePath: row.strokesFilePath,
    strokesByteSize: row.strokesByteSize ?? 0,
    strokesDirtyAt: row.strokesDirtyAt,
    strokesServerSyncedAt: row.strokesServerSyncedAt,
  };
}

// Compare-and-set: only clears strokes_dirty_at if it still matches the
// timestamp captured at the start of the handler. If the user drew again
// mid-push, leave dirty_at set so the next drain re-fires.
export async function markStrokesServerSyncedLocal(
  noteId: string,
  expectedDirtyAt: number,
  syncedAt: number,
): Promise<void> {
  if (!db) return;
  await db.transaction(async (tx) => {
    await tx
      .update(schema.notes)
      .set({ strokesServerSyncedAt: syncedAt, strokesDirtyAt: null })
      .where(
        and(
          eq(schema.notes.id, noteId),
          eq(schema.notes.strokesDirtyAt, expectedDirtyAt),
        ),
      );
    await tx
      .update(schema.notes)
      .set({ strokesServerSyncedAt: syncedAt })
      .where(
        and(
          eq(schema.notes.id, noteId),
          ne(schema.notes.strokesDirtyAt, expectedDirtyAt),
        ),
      );
  });
}

export async function findNotesWithDirtyStrokes(
  userId: string,
): Promise<{ id: string; strokesDirtyAt: number }[]> {
  if (!db) return [];
  const rows = await db
    .select({
      id: schema.notes.id,
      strokesDirtyAt: schema.notes.strokesDirtyAt,
    })
    .from(schema.notes)
    .where(
      and(
        eq(schema.notes.userId, userId),
        isNotNull(schema.notes.strokesDirtyAt),
        isNull(schema.notes.deletedAt),
      ),
    );
  return rows
    .filter((r): r is { id: string; strokesDirtyAt: number } =>
      r.strokesDirtyAt !== null,
    );
}

export async function setNoteStrokesManifest(
  noteId: string,
  manifest: {
    strokesFilePath: string;
    strokesByteSize: number;
    strokesDirtyAt: number | null;
  },
): Promise<void> {
  if (!db) return;
  await db
    .update(schema.notes)
    .set({
      strokesFilePath: manifest.strokesFilePath,
      strokesByteSize: manifest.strokesByteSize,
      strokesDirtyAt: manifest.strokesDirtyAt,
    })
    .where(sql`${schema.notes.id} = ${noteId}`);
}

function useLiveNotesNative(userId: string | undefined): Note[] {
  const uid = userId ?? "";
  const { data } = useLiveQuery(
    db!
      .select()
      .from(schema.notes)
      .where(
        and(eq(schema.notes.userId, uid), isNull(schema.notes.deletedAt)),
      )
      .orderBy(desc(schema.notes.createdAt)),
    [uid],
  );
  return data.map(noteFromRow);
}

function useLiveNotesNoop(_userId: string | undefined): Note[] {
  return [];
}

export const useLiveNotes: (userId: string | undefined) => Note[] = db
  ? useLiveNotesNative
  : useLiveNotesNoop;

export async function applyServerStrokes(
  userId: string,
  noteId: string,
  strokes: Stroke[],
): Promise<void> {
  if (!db) return;
  const writeResult = await writeStrokesFile(userId, noteId, strokes);
  if (!writeResult) return;
  await db
    .update(schema.notes)
    .set({
      strokesFilePath: writeResult.path,
      strokesByteSize: writeResult.byteSize,
      strokesDirtyAt: null,
      strokesServerSyncedAt: Date.now(),
    })
    .where(eq(schema.notes.id, noteId));
}

export async function pullNotes(userId: string): Promise<void> {
  if (!db) return;
  const res = await api<{ notes: ApiNoteRow[] }>("/notes");
  await upsertNotesFromServer(
    res.notes.map((n) => ({
      id: n.id,
      userId,
      title: n.title,
      contentHtml: n.contentHtml ?? "",
      createdAt: new Date(n.createdAt).getTime(),
      updatedAt: new Date(n.updatedAt).getTime(),
    })),
  );

  // Strokes hydration — server wins when local has no pending edits.
  for (const n of res.notes) {
    const serverStrokes = Array.isArray(n.drawingStrokes)
      ? n.drawingStrokes
      : [];
    if (serverStrokes.length === 0) continue;
    const manifest = await getNoteStrokesManifest(n.id);
    if (!manifest) continue;
    if (manifest.strokesDirtyAt !== null) continue;
    const serverUpdatedAt = new Date(n.updatedAt).getTime();
    if ((manifest.strokesServerSyncedAt ?? 0) >= serverUpdatedAt) continue;
    await applyServerStrokes(userId, n.id, serverStrokes);
  }

  const present = new Set(res.notes.map((n) => n.id));
  await tombstoneMissingNotes(userId, present);
}

export async function tombstoneMissingNotes(
  userId: string,
  present: Set<string>,
): Promise<void> {
  if (!db) return;
  const candidates = await db
    .select({ id: schema.notes.id })
    .from(schema.notes)
    .where(
      and(
        eq(schema.notes.userId, userId),
        eq(schema.notes.syncStatus, "synced"),
        isNull(schema.notes.deletedAt),
      ),
    );
  const missing = candidates
    .map((r) => r.id)
    .filter((id) => !present.has(id));
  if (missing.length === 0) return;
  for (const noteId of missing) {
    try {
      await deleteStrokesFile(userId, noteId);
    } catch {
      /* idempotent */
    }
  }
  await db.delete(schema.notes).where(inArray(schema.notes.id, missing));
  await db
    .delete(schema.collectionMaterials)
    .where(inArray(schema.collectionMaterials.noteId, missing));
}
