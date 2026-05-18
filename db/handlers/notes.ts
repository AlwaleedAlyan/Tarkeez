import { registerHandler } from "@/db/sync";
import { api } from "@/lib/api";
import {
  getNoteStrokesManifest,
  hardDeleteNoteLocal,
  markNoteSyncStatusLocal,
  markStrokesServerSyncedLocal,
} from "@/db/repositories/notes";
import { readStrokesFile } from "@/db/strokesStore";

type NoteCreatePayload = { id: string; title: string; contentHtml: string };
type NoteUpdatePayload = { id: string; title?: string; contentHtml?: string };
type StrokesUpdatePayload = { noteId: string };

function isDuplicateKeyError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /duplicate key value|already exists|23505/i.test(err.message);
}

registerHandler("notes", "create", async (_rowId, payload) => {
  const p = payload as NoteCreatePayload;
  try {
    await api("/notes", {
      method: "POST",
      json: { id: p.id, title: p.title, contentHtml: p.contentHtml },
    });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }
  await markNoteSyncStatusLocal(p.id, "synced");
});

registerHandler("notes", "update", async (_rowId, payload) => {
  const p = payload as NoteUpdatePayload;
  const body: Record<string, unknown> = {};
  if (p.title !== undefined) body.title = p.title;
  if (p.contentHtml !== undefined) body.contentHtml = p.contentHtml;
  if (Object.keys(body).length === 0) return;
  await api(`/notes/${p.id}`, { method: "PATCH", json: body });
  await markNoteSyncStatusLocal(p.id, "synced");
});

registerHandler("notes", "delete", async (rowId, _payload) => {
  await api(`/notes/${rowId}`, { method: "DELETE" });
  await hardDeleteNoteLocal(rowId);
});

registerHandler("note_strokes", "update", async (_rowId, payload) => {
  const p = payload as StrokesUpdatePayload;
  const manifest = await getNoteStrokesManifest(p.noteId);
  if (!manifest) return;
  if (manifest.strokesDirtyAt === null) return;
  const expectedDirtyAt = manifest.strokesDirtyAt;
  const strokes =
    (await readStrokesFile(manifest.userId, p.noteId)) ?? [];
  await api(`/notes/${p.noteId}`, {
    method: "PATCH",
    json: { drawingStrokes: strokes },
  });
  await markStrokesServerSyncedLocal(p.noteId, expectedDirtyAt, Date.now());
});
