import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite/query";

import { db, schema } from "@/db/client";
import { api } from "@/lib/api";

import type { Collection } from "@/contexts/LibraryContext";

type ApiCollectionRow = {
  id: string;
  name: string;
  createdAt: string;
};

export type CollectionUpsertInput = {
  id: string;
  userId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

type CollectionRow = typeof schema.collections.$inferSelect;

function collectionFromRow(r: CollectionRow): Collection {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
  };
}

export async function upsertCollectionsFromServer(
  rows: CollectionUpsertInput[],
): Promise<void> {
  if (!db) return;
  if (rows.length === 0) return;
  const ts = Date.now();
  for (const r of rows) {
    await db
      .insert(schema.collections)
      .values({
        id: r.id,
        userId: r.userId,
        name: r.name,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        serverUpdatedAt: ts,
        syncStatus: "synced",
        deletedAt: null,
      })
      .onConflictDoUpdate({
        target: schema.collections.id,
        set: {
          name: r.name,
          updatedAt: r.updatedAt,
          serverUpdatedAt: ts,
        },
        where: sql`${schema.collections.syncStatus} = 'synced'`,
      });
  }
}

export async function upsertCollectionLocal(
  r: CollectionUpsertInput,
): Promise<void> {
  if (!db) return;
  const ts = Date.now();
  await db
    .insert(schema.collections)
    .values({
      id: r.id,
      userId: r.userId,
      name: r.name,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      serverUpdatedAt: ts,
      syncStatus: "synced",
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: schema.collections.id,
      set: {
        name: r.name,
        updatedAt: r.updatedAt,
        serverUpdatedAt: ts,
        syncStatus: "synced",
        deletedAt: null,
      },
    });
}

export async function deleteCollectionLocal(id: string): Promise<void> {
  if (!db) return;
  await db.delete(schema.collections).where(eq(schema.collections.id, id));
}

export const hardDeleteCollectionLocal = deleteCollectionLocal;

export async function insertPendingCollectionLocal(
  r: CollectionUpsertInput,
): Promise<void> {
  if (!db) return;
  await db
    .insert(schema.collections)
    .values({
      id: r.id,
      userId: r.userId,
      name: r.name,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      serverUpdatedAt: null,
      syncStatus: "pending_create",
      deletedAt: null,
    })
    .onConflictDoNothing({ target: schema.collections.id });
}

export async function updateCollectionLocalPending(r: {
  id: string;
  name: string;
  updatedAt: number;
}): Promise<void> {
  if (!db) return;
  await db
    .update(schema.collections)
    .set({
      name: r.name,
      updatedAt: r.updatedAt,
      syncStatus: "pending_update",
    })
    .where(eq(schema.collections.id, r.id));
}

export async function softDeleteCollectionLocal(id: string): Promise<void> {
  if (!db) return;
  const now = Date.now();
  await db
    .update(schema.collections)
    .set({
      deletedAt: now,
      syncStatus: "pending_delete",
      updatedAt: now,
    })
    .where(eq(schema.collections.id, id));
}

export type CollectionSyncStatus =
  | "synced"
  | "pending_create"
  | "pending_update"
  | "pending_delete";

export async function markCollectionSyncStatusLocal(
  id: string,
  status: CollectionSyncStatus,
): Promise<void> {
  if (!db) return;
  await db
    .update(schema.collections)
    .set({ syncStatus: status })
    .where(eq(schema.collections.id, id));
}

function useLiveCollectionsNative(userId: string | undefined): Collection[] {
  const uid = userId ?? "";
  const { data } = useLiveQuery(
    db!
      .select()
      .from(schema.collections)
      .where(
        and(
          eq(schema.collections.userId, uid),
          isNull(schema.collections.deletedAt),
        ),
      )
      .orderBy(desc(schema.collections.createdAt)),
    [uid],
  );
  return data.map(collectionFromRow);
}

function useLiveCollectionsNoop(_userId: string | undefined): Collection[] {
  return [];
}

export const useLiveCollections: (
  userId: string | undefined,
) => Collection[] = db ? useLiveCollectionsNative : useLiveCollectionsNoop;

export async function pullCollections(userId: string): Promise<void> {
  if (!db) return;
  const res = await api<{ collections: ApiCollectionRow[] }>("/collections");
  await upsertCollectionsFromServer(
    res.collections.map((c) => ({
      id: c.id,
      userId,
      name: c.name,
      createdAt: new Date(c.createdAt).getTime(),
      updatedAt: new Date(c.createdAt).getTime(),
    })),
  );
  const present = new Set(res.collections.map((c) => c.id));
  await tombstoneMissingCollections(userId, present);
}

export async function tombstoneMissingCollections(
  userId: string,
  present: Set<string>,
): Promise<void> {
  if (!db) return;
  const candidates = await db
    .select({ id: schema.collections.id })
    .from(schema.collections)
    .where(
      and(
        eq(schema.collections.userId, userId),
        eq(schema.collections.syncStatus, "synced"),
        isNull(schema.collections.deletedAt),
      ),
    );
  const missing = candidates
    .map((r) => r.id)
    .filter((id) => !present.has(id));
  if (missing.length === 0) return;
  await db
    .delete(schema.collections)
    .where(inArray(schema.collections.id, missing));
  await db
    .delete(schema.collectionMaterials)
    .where(inArray(schema.collectionMaterials.collectionId, missing));
}
