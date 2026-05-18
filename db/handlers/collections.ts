import { registerHandler } from "@/db/sync";
import { api } from "@/lib/api";
import {
  hardDeleteCollectionLocal,
  markCollectionSyncStatusLocal,
} from "@/db/repositories/collections";
import {
  hardDeleteCMRowLocal,
  markCMRowSyncStatusLocal,
} from "@/db/repositories/collectionMaterials";

type CollectionCreatePayload = { id: string; name: string };
type CollectionUpdatePayload = { id: string; name: string };
type CMUpsertPayload = {
  collectionId: string;
  materialId: string | null;
  noteId: string | null;
};

function isDuplicateKeyError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /duplicate key value|already exists|23505/i.test(err.message);
}

registerHandler("collections", "create", async (_rowId, payload) => {
  const p = payload as CollectionCreatePayload;
  try {
    await api("/collections", {
      method: "POST",
      json: { id: p.id, name: p.name },
    });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }
  await markCollectionSyncStatusLocal(p.id, "synced");
});

registerHandler("collections", "update", async (_rowId, payload) => {
  const p = payload as CollectionUpdatePayload;
  await api(`/collections/${p.id}`, {
    method: "PATCH",
    json: { name: p.name },
  });
  await markCollectionSyncStatusLocal(p.id, "synced");
});

registerHandler("collections", "delete", async (rowId, _payload) => {
  await api(`/collections/${rowId}`, { method: "DELETE" });
  await hardDeleteCollectionLocal(rowId);
});

registerHandler("collection_materials", "create", async (_rowId, payload) => {
  const p = payload as CMUpsertPayload;
  const target =
    p.materialId !== null
      ? { materialId: p.materialId }
      : { noteId: p.noteId as string };
  try {
    await api("/collection-materials", {
      method: "POST",
      json: p,
    });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }
  await markCMRowSyncStatusLocal(p.collectionId, target, "synced");
});

registerHandler("collection_materials", "delete", async (_rowId, payload) => {
  const p = payload as CMUpsertPayload;
  const target =
    p.materialId !== null
      ? { materialId: p.materialId }
      : { noteId: p.noteId as string };
  const path =
    p.materialId !== null
      ? `/collection-materials/material/${p.collectionId}/${p.materialId}`
      : `/collection-materials/note/${p.collectionId}/${p.noteId}`;
  await api(path, { method: "DELETE" });
  await hardDeleteCMRowLocal(p.collectionId, target);
});
