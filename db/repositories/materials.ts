import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite/query";
import * as FileSystem from "expo-file-system/legacy";

import { cachePath } from "@/db/cachePath";
import { db, schema } from "@/db/client";
import { api } from "@/lib/api";

import type { Material } from "@/contexts/LibraryContext";

type ApiMaterialRow = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  totalPages: number | null;
  currentPage: number;
  createdAt: string;
  updatedAt: string;
};

export type MaterialUpsertInput = {
  id: string;
  userId: string;
  title: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  totalPages: number | null;
  currentPage: number;
  createdAt: number;
  updatedAt: number;
};

type MaterialRow = typeof schema.materials.$inferSelect;

const now = () => Date.now();

function materialFromRow(r: MaterialRow): Material {
  return {
    id: r.id,
    title: r.title,
    fileName: r.fileName ?? "",
    totalPages: r.totalPages ?? undefined,
    currentPage: r.currentPage ?? 1,
    createdAt: r.createdAt,
    sizeBytes: r.sizeBytes ?? 0,
  };
}

export async function upsertMaterialsFromServer(
  rows: MaterialUpsertInput[],
): Promise<void> {
  if (!db) return;
  if (rows.length === 0) return;
  const ts = now();
  for (const r of rows) {
    await db
      .insert(schema.materials)
      .values({
        id: r.id,
        userId: r.userId,
        title: r.title,
        fileName: r.fileName,
        mimeType: r.mimeType ?? "application/pdf",
        sizeBytes: r.sizeBytes,
        totalPages: r.totalPages,
        currentPage: r.currentPage,
        localFilePath: null,
        isDownloaded: 0,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        serverUpdatedAt: ts,
        syncStatus: "synced",
        deletedAt: null,
      })
      .onConflictDoUpdate({
        target: schema.materials.id,
        set: {
          title: r.title,
          fileName: r.fileName,
          mimeType: r.mimeType ?? "application/pdf",
          sizeBytes: r.sizeBytes,
          totalPages: r.totalPages,
          currentPage: r.currentPage,
          updatedAt: r.updatedAt,
          serverUpdatedAt: ts,
        },
        where: sql`${schema.materials.syncStatus} = 'synced'`,
      });
  }
}

export async function upsertMaterialLocal(r: MaterialUpsertInput): Promise<void> {
  if (!db) return;
  const ts = now();
  await db
    .insert(schema.materials)
    .values({
      id: r.id,
      userId: r.userId,
      title: r.title,
      fileName: r.fileName,
      mimeType: r.mimeType ?? "application/pdf",
      sizeBytes: r.sizeBytes,
      totalPages: r.totalPages,
      currentPage: r.currentPage,
      localFilePath: null,
      isDownloaded: 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      serverUpdatedAt: ts,
      syncStatus: "synced",
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: schema.materials.id,
      set: {
        title: r.title,
        fileName: r.fileName,
        mimeType: r.mimeType ?? "application/pdf",
        sizeBytes: r.sizeBytes,
        totalPages: r.totalPages,
        currentPage: r.currentPage,
        updatedAt: r.updatedAt,
        serverUpdatedAt: ts,
        syncStatus: "synced",
        deletedAt: null,
      },
    });
}

export async function deleteMaterialLocal(id: string): Promise<void> {
  if (!db) return;
  await db.delete(schema.materials).where(eq(schema.materials.id, id));
}

export const hardDeleteMaterialLocal = deleteMaterialLocal;

export type MaterialSyncStatus =
  | "synced"
  | "pending_create"
  | "pending_update"
  | "pending_delete";

export type PendingMaterialInput = {
  id: string;
  userId: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  totalPages: number | null;
  currentPage: number;
  localFilePath: string;
  createdAt: number;
  updatedAt: number;
};

export async function insertPendingMaterialLocal(
  r: PendingMaterialInput,
): Promise<void> {
  if (!db) return;
  await db
    .insert(schema.materials)
    .values({
      id: r.id,
      userId: r.userId,
      title: r.title,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      totalPages: r.totalPages,
      currentPage: r.currentPage,
      localFilePath: r.localFilePath,
      isDownloaded: 1,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      serverUpdatedAt: null,
      syncStatus: "pending_create",
      deletedAt: null,
    })
    .onConflictDoNothing({ target: schema.materials.id });
}

export async function updateMaterialLocalPending(r: {
  id: string;
  title?: string;
  totalPages?: number | null;
  currentPage?: number;
  updatedAt: number;
}): Promise<void> {
  if (!db) return;
  const set: Record<string, unknown> = {
    updatedAt: r.updatedAt,
    syncStatus: "pending_update",
  };
  if (r.title !== undefined) set.title = r.title;
  if (r.totalPages !== undefined) set.totalPages = r.totalPages;
  if (r.currentPage !== undefined) set.currentPage = r.currentPage;
  await db
    .update(schema.materials)
    .set(set)
    .where(eq(schema.materials.id, r.id));
}

export async function softDeleteMaterialLocal(id: string): Promise<void> {
  if (!db) return;
  const ts = now();
  await db
    .update(schema.materials)
    .set({ deletedAt: ts, syncStatus: "pending_delete", updatedAt: ts })
    .where(eq(schema.materials.id, id));
}

export async function markMaterialSyncStatusLocal(
  id: string,
  status: MaterialSyncStatus,
): Promise<void> {
  if (!db) return;
  await db
    .update(schema.materials)
    .set({ syncStatus: status })
    .where(eq(schema.materials.id, id));
}

export type MaterialLocalRow = {
  id: string;
  userId: string;
  title: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  totalPages: number | null;
  currentPage: number;
  localFilePath: string | null;
};

export async function getMaterialLocal(
  id: string,
): Promise<MaterialLocalRow | null> {
  if (!db) return null;
  const rows = await db
    .select({
      id: schema.materials.id,
      userId: schema.materials.userId,
      title: schema.materials.title,
      fileName: schema.materials.fileName,
      mimeType: schema.materials.mimeType,
      sizeBytes: schema.materials.sizeBytes,
      totalPages: schema.materials.totalPages,
      currentPage: schema.materials.currentPage,
      localFilePath: schema.materials.localFilePath,
    })
    .from(schema.materials)
    .where(eq(schema.materials.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    totalPages: row.totalPages,
    currentPage: row.currentPage ?? 1,
    localFilePath: row.localFilePath,
  };
}

function useLiveMaterialsNative(userId: string | undefined): Material[] {
  const uid = userId ?? "";
  const { data } = useLiveQuery(
    db!
      .select()
      .from(schema.materials)
      .where(
        and(
          eq(schema.materials.userId, uid),
          isNull(schema.materials.deletedAt),
        ),
      )
      .orderBy(desc(schema.materials.createdAt)),
  );
  return data.map(materialFromRow);
}

function useLiveMaterialsNoop(_userId: string | undefined): Material[] {
  return [];
}

export const useLiveMaterials: (userId: string | undefined) => Material[] = db
  ? useLiveMaterialsNative
  : useLiveMaterialsNoop;

export async function pullMaterials(userId: string): Promise<void> {
  if (!db) return;
  const res = await api<{ materials: ApiMaterialRow[] }>("/materials");
  await upsertMaterialsFromServer(
    res.materials.map((m) => ({
      id: m.id,
      userId,
      title: m.title,
      fileName: m.fileName ?? null,
      mimeType: m.mimeType ?? null,
      sizeBytes: m.sizeBytes ?? null,
      totalPages: m.totalPages ?? null,
      currentPage: m.currentPage,
      createdAt: new Date(m.createdAt).getTime(),
      updatedAt: new Date(m.updatedAt).getTime(),
    })),
  );
  const present = new Set(res.materials.map((m) => m.id));
  await tombstoneMissingMaterials(userId, present);
}

export async function tombstoneMissingMaterials(
  userId: string,
  present: Set<string>,
): Promise<void> {
  if (!db) return;
  const candidates = await db
    .select({ id: schema.materials.id })
    .from(schema.materials)
    .where(
      and(
        eq(schema.materials.userId, userId),
        eq(schema.materials.syncStatus, "synced"),
        isNull(schema.materials.deletedAt),
      ),
    );
  const missing = candidates
    .map((r) => r.id)
    .filter((id) => !present.has(id));
  if (missing.length === 0) return;
  for (const id of missing) {
    const dest = cachePath(userId, id);
    if (dest) {
      try {
        await FileSystem.deleteAsync(dest, { idempotent: true });
      } catch {
        /* idempotent */
      }
    }
  }
  await db
    .delete(schema.materials)
    .where(inArray(schema.materials.id, missing));
  await db
    .delete(schema.collectionMaterials)
    .where(inArray(schema.collectionMaterials.materialId, missing));
}
