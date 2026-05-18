import { registerHandler } from "@/db/sync";
import {
  api,
  removeMaterialStorage,
  uploadMaterialStorage,
} from "@/lib/api";
import {
  getMaterialLocal,
  hardDeleteMaterialLocal,
  markMaterialSyncStatusLocal,
} from "@/db/repositories/materials";

type MaterialDeletePayload = { userId: string; fileName: string | null };

function isDuplicateKeyError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /duplicate key value|already exists|23505/i.test(err.message);
}

function isNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /not found|404|object not found/i.test(err.message);
}

registerHandler("materials", "create", async (rowId, _payload) => {
  const row = await getMaterialLocal(rowId);
  if (!row || !row.localFilePath || !row.fileName) {
    // Local state is gone or never seeded — treat as already-pushed.
    await markMaterialSyncStatusLocal(rowId, "synced");
    return;
  }
  await uploadMaterialStorage(
    row.userId,
    row.fileName,
    row.localFilePath,
    row.mimeType ?? "application/pdf",
  );
  try {
    await api("/materials", {
      method: "POST",
      json: {
        id: row.id,
        title: row.title,
        fileName: row.fileName,
        mimeType: row.mimeType ?? "application/pdf",
        sizeBytes: row.sizeBytes ?? 0,
        totalPages: row.totalPages,
        currentPage: row.currentPage,
      },
    });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }
  await markMaterialSyncStatusLocal(rowId, "synced");
});

registerHandler("materials", "update", async (rowId, _payload) => {
  const row = await getMaterialLocal(rowId);
  if (!row) return;
  await api(`/materials/${rowId}`, {
    method: "PATCH",
    json: {
      title: row.title,
      totalPages: row.totalPages,
      currentPage: row.currentPage,
    },
  });
  await markMaterialSyncStatusLocal(rowId, "synced");
});

registerHandler("materials", "delete", async (rowId, payload) => {
  const p = payload as MaterialDeletePayload;
  if (p.fileName) {
    try {
      await removeMaterialStorage(p.userId, p.fileName);
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }
  }
  try {
    await api(`/materials/${rowId}`, { method: "DELETE" });
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }
  await hardDeleteMaterialLocal(rowId);
});
