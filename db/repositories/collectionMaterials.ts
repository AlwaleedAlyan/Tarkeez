import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite/query";

import { db, schema } from "@/db/client";
import { api } from "@/lib/api";

import type { CMRow } from "@/contexts/LibraryContext";

type ApiCMRowResponse = {
  collectionId: string;
  materialId: string | null;
  noteId: string | null;
  addedAt: string;
};

export type CMUpsertInput = {
  collectionId: string;
  materialId: string | null;
  noteId: string | null;
  addedAt: number;
};

function syntheticId(r: CMUpsertInput): string {
  const target = r.materialId ?? `note:${r.noteId}`;
  return `${r.collectionId}|${target}`;
}

export function syntheticCMId(
  collectionId: string,
  target: { materialId: string } | { noteId: string },
): string {
  return "materialId" in target
    ? `${collectionId}|${target.materialId}`
    : `${collectionId}|note:${target.noteId}`;
}

export async function upsertCMRowsFromServer(
  rows: CMUpsertInput[],
): Promise<void> {
  if (!db) return;
  if (rows.length === 0) return;
  for (const r of rows) {
    const id = syntheticId(r);
    await db
      .insert(schema.collectionMaterials)
      .values({
        id,
        collectionId: r.collectionId,
        materialId: r.materialId,
        noteId: r.noteId,
        addedAt: r.addedAt,
        syncStatus: "synced",
        deletedAt: null,
      })
      .onConflictDoUpdate({
        target: schema.collectionMaterials.id,
        set: {
          addedAt: r.addedAt,
          syncStatus: "synced",
          deletedAt: null,
        },
        where: sql`${schema.collectionMaterials.syncStatus} = 'synced'`,
      });
  }
}

export async function insertCMRowLocal(r: CMUpsertInput): Promise<void> {
  if (!db) return;
  const id = syntheticId(r);
  await db
    .insert(schema.collectionMaterials)
    .values({
      id,
      collectionId: r.collectionId,
      materialId: r.materialId,
      noteId: r.noteId,
      addedAt: r.addedAt,
      syncStatus: "synced",
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: schema.collectionMaterials.id,
      set: {
        addedAt: r.addedAt,
        syncStatus: "synced",
        deletedAt: null,
      },
    });
}

export async function deleteCMRowLocal(
  collectionId: string,
  target: { materialId: string } | { noteId: string },
): Promise<void> {
  if (!db) return;
  const id =
    "materialId" in target
      ? `${collectionId}|${target.materialId}`
      : `${collectionId}|note:${target.noteId}`;
  await db
    .delete(schema.collectionMaterials)
    .where(eq(schema.collectionMaterials.id, id));
}

export async function deleteCMRowsByMaterialLocal(
  materialId: string,
): Promise<void> {
  if (!db) return;
  await db
    .delete(schema.collectionMaterials)
    .where(eq(schema.collectionMaterials.materialId, materialId));
}

export async function deleteCMRowsByCollectionLocal(
  collectionId: string,
): Promise<void> {
  if (!db) return;
  await db
    .delete(schema.collectionMaterials)
    .where(eq(schema.collectionMaterials.collectionId, collectionId));
}

export async function deleteCMRowsByNoteLocal(noteId: string): Promise<void> {
  if (!db) return;
  await db
    .delete(schema.collectionMaterials)
    .where(eq(schema.collectionMaterials.noteId, noteId));
}

export async function insertPendingCMRowLocal(
  r: CMUpsertInput,
): Promise<void> {
  if (!db) return;
  const id = syntheticId(r);
  await db
    .insert(schema.collectionMaterials)
    .values({
      id,
      collectionId: r.collectionId,
      materialId: r.materialId,
      noteId: r.noteId,
      addedAt: r.addedAt,
      syncStatus: "pending_create",
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: schema.collectionMaterials.id,
      set: {
        addedAt: r.addedAt,
        syncStatus: "pending_create",
        deletedAt: null,
      },
    });
}

export type CMSyncStatus =
  | "synced"
  | "pending_create"
  | "pending_update"
  | "pending_delete";

export async function softDeleteCMRowLocal(
  collectionId: string,
  target: { materialId: string } | { noteId: string },
): Promise<void> {
  if (!db) return;
  const id = syntheticCMId(collectionId, target);
  const now = Date.now();
  await db
    .update(schema.collectionMaterials)
    .set({ deletedAt: now, syncStatus: "pending_delete" })
    .where(eq(schema.collectionMaterials.id, id));
}

export async function hardDeleteCMRowLocal(
  collectionId: string,
  target: { materialId: string } | { noteId: string },
): Promise<void> {
  if (!db) return;
  const id = syntheticCMId(collectionId, target);
  await db
    .delete(schema.collectionMaterials)
    .where(eq(schema.collectionMaterials.id, id));
}

export async function markCMRowSyncStatusLocal(
  collectionId: string,
  target: { materialId: string } | { noteId: string },
  status: CMSyncStatus,
): Promise<void> {
  if (!db) return;
  const id = syntheticCMId(collectionId, target);
  await db
    .update(schema.collectionMaterials)
    .set({ syncStatus: status })
    .where(eq(schema.collectionMaterials.id, id));
}

export async function softDeleteCMRowsByCollectionLocal(
  collectionId: string,
): Promise<void> {
  if (!db) return;
  const now = Date.now();
  await db
    .update(schema.collectionMaterials)
    .set({ deletedAt: now, syncStatus: "pending_delete" })
    .where(eq(schema.collectionMaterials.collectionId, collectionId));
}

export async function softDeleteCMRowsByNoteLocal(
  noteId: string,
): Promise<void> {
  if (!db) return;
  const now = Date.now();
  await db
    .update(schema.collectionMaterials)
    .set({ deletedAt: now, syncStatus: "pending_delete" })
    .where(eq(schema.collectionMaterials.noteId, noteId));
}

export async function softDeleteCMRowsByMaterialLocal(
  materialId: string,
): Promise<void> {
  if (!db) return;
  const now = Date.now();
  await db
    .update(schema.collectionMaterials)
    .set({ deletedAt: now, syncStatus: "pending_delete" })
    .where(eq(schema.collectionMaterials.materialId, materialId));
}

function useLiveCMRowsNative(userId: string | undefined): CMRow[] {
  const uid = userId ?? "";
  const { data } = useLiveQuery(
    db!
      .select({
        collectionId: schema.collectionMaterials.collectionId,
        materialId: schema.collectionMaterials.materialId,
        noteId: schema.collectionMaterials.noteId,
        addedAt: schema.collectionMaterials.addedAt,
      })
      .from(schema.collectionMaterials)
      .innerJoin(
        schema.collections,
        eq(schema.collectionMaterials.collectionId, schema.collections.id),
      )
      .where(
        and(
          eq(schema.collections.userId, uid),
          isNull(schema.collectionMaterials.deletedAt),
          isNull(schema.collections.deletedAt),
        ),
      ),
  );
  return data.map((r) => ({
    collectionId: r.collectionId,
    materialId: r.materialId ?? null,
    noteId: r.noteId ?? null,
    addedAt: r.addedAt,
  }));
}

function useLiveCMRowsNoop(_userId: string | undefined): CMRow[] {
  return [];
}

export const useLiveCMRows: (userId: string | undefined) => CMRow[] = db
  ? useLiveCMRowsNative
  : useLiveCMRowsNoop;

export async function pullCMRows(userId: string): Promise<void> {
  if (!db) return;
  const res = await api<{ rows: ApiCMRowResponse[] }>("/collection-materials");
  await upsertCMRowsFromServer(
    res.rows.map((r) => ({
      collectionId: r.collectionId,
      materialId: r.materialId ?? null,
      noteId: r.noteId ?? null,
      addedAt: new Date(r.addedAt).getTime(),
    })),
  );
  const present = new Set(
    res.rows.map((r) => {
      const target = r.materialId ?? `note:${r.noteId}`;
      return `${r.collectionId}|${target}`;
    }),
  );
  await tombstoneMissingCMRows(userId, present);
}

// CM rows have no user_id column; scope is via the parent collection.
export async function tombstoneMissingCMRows(
  userId: string,
  present: Set<string>,
): Promise<void> {
  if (!db) return;
  const candidates = await db
    .select({ id: schema.collectionMaterials.id })
    .from(schema.collectionMaterials)
    .innerJoin(
      schema.collections,
      eq(schema.collectionMaterials.collectionId, schema.collections.id),
    )
    .where(
      and(
        eq(schema.collections.userId, userId),
        eq(schema.collectionMaterials.syncStatus, "synced"),
        isNull(schema.collectionMaterials.deletedAt),
        isNull(schema.collections.deletedAt),
      ),
    );
  const missing = candidates
    .map((r) => r.id)
    .filter((id) => !present.has(id));
  if (missing.length === 0) return;
  await db
    .delete(schema.collectionMaterials)
    .where(inArray(schema.collectionMaterials.id, missing));
}
