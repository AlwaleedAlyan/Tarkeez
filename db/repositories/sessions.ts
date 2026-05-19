import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite/query";

import { db, schema } from "@/db/client";
import { api } from "@/lib/api";

import type { Session } from "@/contexts/LibraryContext";

type ApiSessionRow = {
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
  keystrokes: number | null;
  strokesAdded: number | null;
  createdAt: string;
};

export type SessionUpsertInput = {
  id: string;
  userId: string;
  materialId: string | null;
  noteId: string | null;
  externalUrl?: string | null;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  pausedSec: number;
  pagesRead: number | null;
  pageTimes: Record<number, number> | null;
  selections: number | null;
  wordsAdded: number | null;
  keystrokes: number | null;
  strokesAdded: number | null;
  createdAt: number;
  pendingSync?: boolean;
};

export async function upsertSessionsFromServer(
  rows: SessionUpsertInput[],
): Promise<void> {
  if (!db) return;
  if (rows.length === 0) return;
  for (const r of rows) {
    await db
      .insert(schema.studySessions)
      .values({
        id: r.id,
        userId: r.userId,
        materialId: r.materialId,
        noteId: r.noteId,
        externalUrl: r.externalUrl ?? null,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        durationSec: r.durationSec,
        pausedSec: r.pausedSec,
        pagesRead: r.pagesRead,
        pageTimesJson: r.pageTimes ? JSON.stringify(r.pageTimes) : null,
        selections: r.selections,
        wordsAdded: r.wordsAdded,
        keystrokes: r.keystrokes,
        strokesAdded: r.strokesAdded,
        createdAt: r.createdAt,
        syncStatus: r.pendingSync ? "pending_create" : "synced",
      })
      .onConflictDoUpdate({
        target: schema.studySessions.id,
        set: {
          syncStatus: r.pendingSync ? "pending_create" : "synced",
        },
        where: sql`${schema.studySessions.syncStatus} != 'synced'`,
      });
  }
}

type SessionRow = typeof schema.studySessions.$inferSelect;

function sessionFromRow(r: SessionRow): Session {
  let pageTimes: Record<number, number> | undefined;
  if (r.pageTimesJson) {
    try {
      pageTimes = JSON.parse(r.pageTimesJson) as Record<number, number>;
    } catch {
      pageTimes = undefined;
    }
  }
  return {
    id: r.id,
    materialId: r.materialId,
    noteId: r.noteId,
    externalUrl: r.externalUrl ?? null,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    durationSec: r.durationSec,
    pausedSec: r.pausedSec ?? 0,
    pagesRead: r.pagesRead ?? undefined,
    pageTimes,
    selections: r.selections ?? undefined,
    wordsAdded: r.wordsAdded ?? undefined,
    keystrokes: r.keystrokes ?? undefined,
    strokesAdded: r.strokesAdded ?? undefined,
    pendingSync: r.syncStatus !== "synced",
  };
}

export async function insertPendingSessionLocal(
  r: SessionUpsertInput,
): Promise<void> {
  if (!db) return;
  await db
    .insert(schema.studySessions)
    .values({
      id: r.id,
      userId: r.userId,
      materialId: r.materialId,
      noteId: r.noteId,
      externalUrl: r.externalUrl,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationSec: r.durationSec,
      pausedSec: r.pausedSec,
      pagesRead: r.pagesRead,
      pageTimesJson: r.pageTimes ? JSON.stringify(r.pageTimes) : null,
      selections: r.selections,
      wordsAdded: r.wordsAdded,
      keystrokes: r.keystrokes,
      strokesAdded: r.strokesAdded,
      createdAt: r.createdAt,
      syncStatus: "pending_create",
    })
    .onConflictDoNothing({ target: schema.studySessions.id });
}

export async function deleteSessionsByNoteLocal(noteId: string): Promise<void> {
  if (!db) return;
  await db
    .delete(schema.studySessions)
    .where(eq(schema.studySessions.noteId, noteId));
}

export async function deleteSessionsByMaterialLocal(
  materialId: string,
): Promise<void> {
  if (!db) return;
  await db
    .delete(schema.studySessions)
    .where(eq(schema.studySessions.materialId, materialId));
}

function useLiveSessionsNative(userId: string | undefined): Session[] {
  const uid = userId ?? "";
  const { data } = useLiveQuery(
    db!
      .select()
      .from(schema.studySessions)
      .where(eq(schema.studySessions.userId, uid))
      .orderBy(desc(schema.studySessions.startedAt)),
  );
  return data.map(sessionFromRow);
}

function useLiveSessionsNoop(_userId: string | undefined): Session[] {
  return [];
}

export const useLiveSessions: (userId: string | undefined) => Session[] = db
  ? useLiveSessionsNative
  : useLiveSessionsNoop;

export async function pullSessions(userId: string): Promise<void> {
  if (!db) return;
  const res = await api<{ sessions: ApiSessionRow[] }>("/sessions");
  const validRows = res.sessions.filter(
    (s) =>
      (s.materialId != null ? 1 : 0) +
        (s.noteId != null ? 1 : 0) +
        (s.externalUrl != null ? 1 : 0) ===
      1,
  );
  await upsertSessionsFromServer(
    validRows.map((s) => ({
      id: s.id,
      userId,
      materialId: s.materialId,
      noteId: s.noteId,
      externalUrl: s.externalUrl,
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
      pendingSync: false,
    })),
  );
  const present = new Set(res.sessions.map((s) => s.id));
  await tombstoneMissingSessions(userId, present);
}

export async function tombstoneMissingSessions(
  userId: string,
  present: Set<string>,
): Promise<void> {
  if (!db) return;
  const candidates = await db
    .select({ id: schema.studySessions.id })
    .from(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.userId, userId),
        eq(schema.studySessions.syncStatus, "synced"),
      ),
    );
  const missing = candidates
    .map((r) => r.id)
    .filter((id) => !present.has(id));
  if (missing.length === 0) return;
  await db
    .delete(schema.studySessions)
    .where(inArray(schema.studySessions.id, missing));
}

export async function upsertLocalPendingSessions(
  rows: SessionUpsertInput[],
): Promise<void> {
  if (!db) return;
  if (rows.length === 0) return;
  for (const r of rows) {
    await db
      .insert(schema.studySessions)
      .values({
        id: r.id,
        userId: r.userId,
        materialId: r.materialId,
        noteId: r.noteId,
        externalUrl: r.externalUrl ?? null,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        durationSec: r.durationSec,
        pausedSec: r.pausedSec,
        pagesRead: r.pagesRead,
        pageTimesJson: r.pageTimes ? JSON.stringify(r.pageTimes) : null,
        selections: r.selections,
        wordsAdded: r.wordsAdded,
        keystrokes: r.keystrokes,
        strokesAdded: r.strokesAdded,
        createdAt: r.createdAt,
        syncStatus: r.pendingSync ? "pending_create" : "synced",
      })
      .onConflictDoNothing({ target: schema.studySessions.id });
  }
}
