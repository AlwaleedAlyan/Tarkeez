import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";

import { useAuth } from "./AuthContext";
import { api, fileUrl } from "@/lib/api";

export type Material = {
  id: string;
  title: string;
  fileName: string;
  totalPages?: number;
  currentPage: number;
  createdAt: number;
  sizeBytes: number;
};

export type Collection = {
  id: string;
  name: string;
  createdAt: number;
};

export type CMRow = {
  collectionId: string;
  materialId: string | null;
  noteId: string | null;
  addedAt: number;
};

export type Note = {
  id: string;
  title: string;
  contentHtml: string;
  drawingStrokes: Stroke[];
  createdAt: number;
  updatedAt: number;
};

export type Session = {
  id: string;
  materialId: string | null;
  noteId: string | null;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  pausedSec?: number;
  pagesRead?: number;
  pageTimes?: Record<number, number>;
  selections?: number;
  wordsAdded?: number;
  keystrokes?: number;
  strokesAdded?: number;
  pendingSync?: boolean;
};

export type Stroke = {
  color: string;
  width: number;
  points: { x: number; y: number }[];
  kind?: "pen" | "highlighter";
};

export type Highlight = {
  color: string;
  rects: { x: number; y: number; w: number; h: number }[];
};

export type PageAnnotations = {
  strokes: Stroke[];
  highlights: Highlight[];
};

export type AnnotationsByPage = Record<string, PageAnnotations>;

type ApiMaterial = {
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

type ApiCollection = {
  id: string;
  name: string;
  createdAt: string;
};

type ApiCMRow = {
  collectionId: string;
  materialId: string | null;
  noteId: string | null;
  addedAt: string;
};

type ApiNote = {
  id: string;
  title: string;
  contentHtml: string;
  drawingStrokes?: Stroke[];
  createdAt: string;
  updatedAt: string;
};

type ApiSession = {
  id: string;
  materialId: string | null;
  noteId: string | null;
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

function fromApi(m: ApiMaterial): Material {
  return {
    id: m.id,
    title: m.title,
    fileName: m.fileName,
    totalPages: m.totalPages ?? undefined,
    currentPage: m.currentPage,
    createdAt: new Date(m.createdAt).getTime(),
    sizeBytes: m.sizeBytes,
  };
}

function collectionFromApi(c: ApiCollection): Collection {
  return {
    id: c.id,
    name: c.name,
    createdAt: new Date(c.createdAt).getTime(),
  };
}

function cmRowFromApi(r: ApiCMRow): CMRow {
  return {
    collectionId: r.collectionId,
    materialId: r.materialId ?? null,
    noteId: r.noteId ?? null,
    addedAt: new Date(r.addedAt).getTime(),
  };
}

function sessionFromApi(s: ApiSession): Session {
  return {
    id: s.id,
    materialId: s.materialId ?? null,
    noteId: s.noteId ?? null,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    durationSec: s.durationSec,
    pausedSec: s.pausedSec ?? 0,
    pagesRead: s.pagesRead ?? undefined,
    pageTimes: s.pageTimes ?? undefined,
    selections: s.selections ?? undefined,
    wordsAdded: s.wordsAdded ?? undefined,
    keystrokes: s.keystrokes ?? undefined,
    strokesAdded: s.strokesAdded ?? undefined,
  };
}

function sessionToApi(s: Session): Omit<ApiSession, "createdAt"> {
  return {
    id: s.id,
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
  };
}

function noteFromApi(n: ApiNote): Note {
  return {
    id: n.id,
    title: n.title,
    contentHtml: n.contentHtml ?? "",
    drawingStrokes: Array.isArray(n.drawingStrokes) ? n.drawingStrokes : [],
    createdAt: new Date(n.createdAt).getTime(),
    updatedAt: new Date(n.updatedAt).getTime(),
  };
}

type AddMaterialInput = {
  title: string;
  fileUri: string;
  fileName: string;
  mimeType?: string;
};

type LibraryContextType = {
  materials: Material[];
  collections: Collection[];
  cmRows: CMRow[];
  notes: Note[];
  sessions: Session[];
  isLoading: boolean;
  addMaterial: (input: AddMaterialInput) => Promise<Material>;
  updateMaterial: (id: string, patch: Partial<Material>) => Promise<void>;
  deleteMaterial: (id: string) => Promise<void>;
  recordSession: (s: Omit<Session, "id">) => Promise<void>;
  getMaterial: (id: string) => Material | undefined;
  ensureLocalFile: (materialId: string) => Promise<string>;
  loadAnnotations: (materialId: string) => Promise<AnnotationsByPage>;
  saveAnnotations: (
    materialId: string,
    annos: AnnotationsByPage,
  ) => Promise<void>;
  refreshMaterials: () => Promise<void>;
  refreshCollections: () => Promise<void>;
  refreshNotes: () => Promise<void>;
  createCollection: (name: string) => Promise<Collection>;
  updateCollection: (id: string, name: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  addMaterialToCollection: (
    materialId: string,
    collectionId: string,
  ) => Promise<void>;
  removeMaterialFromCollection: (
    materialId: string,
    collectionId: string,
  ) => Promise<void>;
  materialsInCollection: (collectionId: string) => Material[];
  uncategorizedMaterials: Material[];
  collectionsContainingMaterial: (materialId: string) => Collection[];
  createNote: (title?: string, contentHtml?: string) => Promise<Note>;
  updateNote: (
    id: string,
    patch: {
      title?: string;
      contentHtml?: string;
      drawingStrokes?: Stroke[];
    },
  ) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  loadNoteStrokes: (noteId: string) => Promise<Stroke[]>;
  saveNoteStrokes: (noteId: string, strokes: Stroke[]) => Promise<void>;
  flushNoteStrokes: (noteId: string) => Promise<void>;
  getNote: (id: string) => Note | undefined;
  addNoteToCollection: (noteId: string, collectionId: string) => Promise<void>;
  removeNoteFromCollection: (
    noteId: string,
    collectionId: string,
  ) => Promise<void>;
  notesInCollection: (collectionId: string) => Note[];
  uncategorizedNotes: Note[];
  collectionsContainingNote: (noteId: string) => Collection[];
};

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

function genId() {
  return Date.now().toString() + Math.random().toString(36).slice(2, 9);
}

function uuidV4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function sessionsKey(userId: string) {
  return `@Stymer/sessions/${userId}`;
}
function annotationsKey(userId: string, materialId: string) {
  return `@Stymer/annos/${userId}/${materialId}`;
}
function noteStrokesKey(userId: string, noteId: string) {
  return `@Stymer/note_strokes/${userId}/${noteId}`;
}

function cachePath(userId: string, materialId: string): string | null {
  if (!FileSystem.cacheDirectory) return null;
  return `${FileSystem.cacheDirectory}Stymer/${userId}/${materialId}.pdf`;
}

async function ensureCacheDir(userId: string) {
  if (!FileSystem.cacheDirectory) return;
  const dir = `${FileSystem.cacheDirectory}Stymer/${userId}`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    /* exists */
  }
}

const DOWNLOAD_TIMEOUT_MS = 30_000;

async function downloadToCache(materialId: string, dest: string) {
  const url = await fileUrl(materialId);
  const dl = FileSystem.downloadAsync(url, dest);
  const result = await Promise.race([
    dl,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error("Download timed out — check your connection and retry."),
          ),
        DOWNLOAD_TIMEOUT_MS,
      ),
    ),
  ]);
  if (result.status >= 400) {
    throw new Error(
      `Could not download file (HTTP ${result.status}). The storage object may not exist at the expected path, or the materials bucket policy is blocking it.`,
    );
  }
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [cmRows, setCmRows] = useState<CMRow[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshMaterials = useCallback(async () => {
    const res = await api<{ materials: ApiMaterial[] }>("/materials");
    setMaterials(res.materials.map(fromApi));
  }, []);

  const refreshCollections = useCallback(async () => {
    const [collectionsRes, cmRes] = await Promise.all([
      api<{ collections: ApiCollection[] }>("/collections"),
      api<{ rows: ApiCMRow[] }>("/collection-materials"),
    ]);
    setCollections(collectionsRes.collections.map(collectionFromApi));
    setCmRows(cmRes.rows.map(cmRowFromApi));
  }, []);

  const refreshNotes = useCallback(async () => {
    const res = await api<{ notes: ApiNote[] }>("/notes");
    setNotes(res.notes.map(noteFromApi));
  }, []);

  useEffect(() => {
    if (!user) {
      setMaterials([]);
      setCollections([]);
      setCmRows([]);
      setNotes([]);
      setSessions([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [_, __, ___, sRaw] = await Promise.all([
          refreshMaterials(),
          refreshCollections(),
          refreshNotes(),
          AsyncStorage.getItem(sessionsKey(user.id)),
        ]);
        if (cancelled) return;
        const cached = sRaw ? (JSON.parse(sRaw) as Session[]) : [];
        setSessions(cached);
      } catch {
        if (!cancelled) {
          setMaterials([]);
          setCollections([]);
          setCmRows([]);
          setNotes([]);
          setSessions([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, refreshMaterials, refreshCollections, refreshNotes]);

  // After initial hydrate, fetch sessions from DB and reconcile with the local
  // cache. DB rows are authoritative; any local session with `pendingSync` is
  // retried in the background.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      let dbSessions: Session[] = [];
      try {
        const res = await api<{ sessions: ApiSession[] }>("/sessions");
        dbSessions = res.sessions.map(sessionFromApi);
      } catch {
        return; // offline — keep local cache
      }
      if (cancelled) return;
      setSessions((prev) => {
        const dbIds = new Set(dbSessions.map((s) => s.id));
        const pending = prev.filter(
          (s) => s.pendingSync && !dbIds.has(s.id),
        );
        const merged = [...dbSessions, ...pending].sort(
          (a, b) => b.startedAt - a.startedAt,
        );
        AsyncStorage.setItem(
          sessionsKey(user.id),
          JSON.stringify(merged),
        ).catch(() => {});
        return merged;
      });
      // Retry pending in background.
      const stillPending = dbSessions.length
        ? []
        : []; // computed below from current state asynchronously
      void stillPending;
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const persistSessions = useCallback(
    async (next: Session[]) => {
      if (!user) return;
      setSessions(next);
      await AsyncStorage.setItem(sessionsKey(user.id), JSON.stringify(next));
    },
    [user],
  );

  // Best-effort retry of any pendingSync sessions whenever we re-hydrate or
  // recordSession completes. Drains pending entries one at a time.
  const retryPendingSessions = useCallback(async () => {
    if (!user) return;
    const queue = sessions.filter((s) => s.pendingSync);
    if (queue.length === 0) return;
    let changed = false;
    const updated = [...sessions];
    for (const s of queue) {
      try {
        await api<{ session: ApiSession }>("/sessions", {
          method: "POST",
          json: { session: sessionToApi(s) },
        });
        const idx = updated.findIndex((x) => x.id === s.id);
        if (idx !== -1) {
          const { pendingSync: _drop, ...rest } = updated[idx];
          updated[idx] = rest;
          changed = true;
        }
      } catch {
        /* leave pendingSync set; try again next time */
      }
    }
    if (changed) {
      setSessions(updated);
      AsyncStorage.setItem(
        sessionsKey(user.id),
        JSON.stringify(updated),
      ).catch(() => {});
    }
  }, [user, sessions]);

  useEffect(() => {
    if (!user) return;
    if (!sessions.some((s) => s.pendingSync)) return;
    const t = setTimeout(() => retryPendingSessions(), 4000);
    return () => clearTimeout(t);
  }, [user, sessions, retryPendingSessions]);

  const addMaterial = useCallback(
    async ({ title, fileUri, fileName, mimeType }: AddMaterialInput) => {
      const form = new FormData();
      form.append("title", title.trim() || fileName.replace(/\.pdf$/i, ""));
      if (Platform.OS === "web") {
        // Browser FormData needs a real Blob/File — the picker hands us a
        // `blob:` URL we fetch back into bytes, wrapped in a File so .name
        // and .type survive the upload handler.
        const blob = await (await fetch(fileUri)).blob();
        const webFile = new File([blob], fileName, {
          type: mimeType || "application/pdf",
        });
        form.append("file", webFile);
      } else {
        // React Native FormData accepts { uri, name, type } objects.
        form.append("file", {
          uri: fileUri,
          name: fileName,
          type: mimeType || "application/pdf",
        } as unknown as Blob);
      }

      const res = await api<{ material: ApiMaterial }>("/materials", {
        method: "POST",
        formData: form,
      });
      const m = fromApi(res.material);

      // Seed local cache from the just-picked file so we don't re-download
      if (user && Platform.OS !== "web") {
        const dest = cachePath(user.id, m.id);
        if (dest) {
          try {
            await ensureCacheDir(user.id);
            await FileSystem.copyAsync({ from: fileUri, to: dest });
          } catch {
            /* will re-download on demand */
          }
        }
      }

      setMaterials((prev) => [m, ...prev]);
      return m;
    },
    [user],
  );

  const updateMaterial = useCallback(
    async (id: string, patch: Partial<Material>) => {
      const body: Record<string, unknown> = {};
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.totalPages !== undefined) body.totalPages = patch.totalPages;
      if (patch.currentPage !== undefined) body.currentPage = patch.currentPage;
      if (Object.keys(body).length === 0) return;
      const res = await api<{ material: ApiMaterial }>(`/materials/${id}`, {
        method: "PATCH",
        json: body,
      });
      const updated = fromApi(res.material);
      setMaterials((prev) => prev.map((m) => (m.id === id ? updated : m)));
    },
    [],
  );

  const deleteMaterial = useCallback(
    async (id: string) => {
      await api(`/materials/${id}`, { method: "DELETE" });
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      // FK cascade handles the DB; mirror it locally so the UI is consistent.
      setCmRows((prev) => prev.filter((r) => r.materialId !== id));
      const nextSessions = sessions.filter((s) => s.materialId !== id);
      await persistSessions(nextSessions);
      if (user) {
        const dest = cachePath(user.id, id);
        if (dest) {
          try {
            await FileSystem.deleteAsync(dest, { idempotent: true });
          } catch {
            /* ignore */
          }
        }
      }
    },
    [sessions, persistSessions, user],
  );

  const recordSession = useCallback(
    async (s: Omit<Session, "id">) => {
      const session: Session = { ...s, id: uuidV4() };
      // Optimistic local write — always succeeds.
      const localFirst: Session = { ...session, pendingSync: true };
      const next = [localFirst, ...sessions];
      await persistSessions(next);
      // Cloud write — best effort. Clear pendingSync on success.
      try {
        await api<{ session: ApiSession }>("/sessions", {
          method: "POST",
          json: { session: sessionToApi(session) },
        });
        setSessions((prev) => {
          const updated = prev.map((x) =>
            x.id === session.id ? { ...x, pendingSync: undefined } : x,
          );
          if (user) {
            AsyncStorage.setItem(
              sessionsKey(user.id),
              JSON.stringify(updated),
            ).catch(() => {});
          }
          return updated;
        });
      } catch {
        /* leave pendingSync flag; the retry effect will pick it up */
      }
    },
    [sessions, persistSessions, user],
  );

  const getMaterial = useCallback(
    (id: string) => materials.find((m) => m.id === id),
    [materials],
  );

  const createCollection = useCallback(async (name: string) => {
    const res = await api<{ collection: ApiCollection }>("/collections", {
      method: "POST",
      json: { name },
    });
    const c = collectionFromApi(res.collection);
    setCollections((prev) => [c, ...prev]);
    return c;
  }, []);

  const updateCollection = useCallback(async (id: string, name: string) => {
    const res = await api<{ collection: ApiCollection }>(`/collections/${id}`, {
      method: "PATCH",
      json: { name },
    });
    const updated = collectionFromApi(res.collection);
    setCollections((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }, []);

  const deleteCollection = useCallback(async (id: string) => {
    await api(`/collections/${id}`, { method: "DELETE" });
    setCollections((prev) => prev.filter((c) => c.id !== id));
    setCmRows((prev) => prev.filter((r) => r.collectionId !== id));
  }, []);

  const addMaterialToCollection = useCallback(
    async (materialId: string, collectionId: string) => {
      await api("/collection-materials", {
        method: "POST",
        json: { collectionId, materialId },
      });
      setCmRows((prev) => {
        if (
          prev.some(
            (r) => r.collectionId === collectionId && r.materialId === materialId,
          )
        ) {
          return prev;
        }
        return [
          ...prev,
          { collectionId, materialId, noteId: null, addedAt: Date.now() },
        ];
      });
    },
    [],
  );

  const removeMaterialFromCollection = useCallback(
    async (materialId: string, collectionId: string) => {
      await api(
        `/collection-materials/material/${collectionId}/${materialId}`,
        {
          method: "DELETE",
        },
      );
      setCmRows((prev) =>
        prev.filter(
          (r) =>
            !(r.collectionId === collectionId && r.materialId === materialId),
        ),
      );
    },
    [],
  );

  const materialsInCollection = useCallback(
    (collectionId: string) => {
      const ids = new Set(
        cmRows
          .filter((r) => r.collectionId === collectionId && r.materialId)
          .map((r) => r.materialId as string),
      );
      return materials.filter((m) => ids.has(m.id));
    },
    [materials, cmRows],
  );

  const uncategorizedMaterials = useMemo(() => {
    const filed = new Set(
      cmRows.filter((r) => r.materialId).map((r) => r.materialId as string),
    );
    return materials.filter((m) => !filed.has(m.id));
  }, [materials, cmRows]);

  const collectionsContainingMaterial = useCallback(
    (materialId: string) => {
      const ids = new Set(
        cmRows
          .filter((r) => r.materialId === materialId)
          .map((r) => r.collectionId),
      );
      return collections.filter((c) => ids.has(c.id));
    },
    [collections, cmRows],
  );

  const createNote = useCallback(
    async (title?: string, contentHtml?: string) => {
      const res = await api<{ note: ApiNote }>("/notes", {
        method: "POST",
        json: { title, contentHtml },
      });
      const n = noteFromApi(res.note);
      setNotes((prev) => [n, ...prev]);
      return n;
    },
    [],
  );

  const updateNote = useCallback(
    async (
      id: string,
      patch: {
        title?: string;
        contentHtml?: string;
        drawingStrokes?: Stroke[];
      },
    ): Promise<void> => {
      const body: Record<string, unknown> = {};
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.contentHtml !== undefined) body.contentHtml = patch.contentHtml;
      if (patch.drawingStrokes !== undefined)
        body.drawingStrokes = patch.drawingStrokes;
      if (Object.keys(body).length === 0) return;
      const res = await api<{ note: ApiNote }>(`/notes/${id}`, {
        method: "PATCH",
        json: body,
      });
      const updated = noteFromApi(res.note);
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
    },
    [],
  );

  const noteStrokesSyncTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const noteStrokesPending = useRef(new Map<string, Stroke[]>());

  const flushNoteStrokes = useCallback(
    async (noteId: string) => {
      const timer = noteStrokesSyncTimers.current.get(noteId);
      if (timer) {
        clearTimeout(timer);
        noteStrokesSyncTimers.current.delete(noteId);
      }
      const pending = noteStrokesPending.current.get(noteId);
      if (!pending) return;
      noteStrokesPending.current.delete(noteId);
      try {
        await updateNote(noteId, { drawingStrokes: pending });
      } catch {
        /* keep local copy; next save will retry */
      }
    },
    [updateNote],
  );

  const saveNoteStrokes = useCallback(
    async (noteId: string, strokes: Stroke[]) => {
      if (!user) return;
      await AsyncStorage.setItem(
        noteStrokesKey(user.id, noteId),
        JSON.stringify(strokes),
      );
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId ? { ...n, drawingStrokes: strokes } : n,
        ),
      );
      noteStrokesPending.current.set(noteId, strokes);
      const existing = noteStrokesSyncTimers.current.get(noteId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        noteStrokesSyncTimers.current.delete(noteId);
        flushNoteStrokes(noteId);
      }, 1500);
      noteStrokesSyncTimers.current.set(noteId, timer);
    },
    [user, flushNoteStrokes],
  );

  const loadNoteStrokes = useCallback(
    async (noteId: string): Promise<Stroke[]> => {
      if (!user) return [];
      const raw = await AsyncStorage.getItem(noteStrokesKey(user.id, noteId));
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Stroke[];
          if (Array.isArray(parsed)) return parsed;
        } catch {
          /* fall through to DB hydrate */
        }
      }
      const fromDb = notes.find((n) => n.id === noteId)?.drawingStrokes ?? [];
      try {
        await AsyncStorage.setItem(
          noteStrokesKey(user.id, noteId),
          JSON.stringify(fromDb),
        );
      } catch {
        /* cache best-effort */
      }
      return fromDb;
    },
    [user, notes],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      const timer = noteStrokesSyncTimers.current.get(id);
      if (timer) clearTimeout(timer);
      noteStrokesSyncTimers.current.delete(id);
      noteStrokesPending.current.delete(id);
      await api(`/notes/${id}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setCmRows((prev) => prev.filter((r) => r.noteId !== id));
      // FK cascade removes sessions DB-side; mirror locally so the UI is in sync.
      setSessions((prev) => {
        const next = prev.filter((s) => s.noteId !== id);
        if (user) {
          AsyncStorage.setItem(
            sessionsKey(user.id),
            JSON.stringify(next),
          ).catch(() => {});
        }
        return next;
      });
      if (user) {
        try {
          await AsyncStorage.removeItem(noteStrokesKey(user.id, id));
        } catch {
          /* ignore */
        }
      }
    },
    [user],
  );

  const getNote = useCallback(
    (id: string) => notes.find((n) => n.id === id),
    [notes],
  );

  const addNoteToCollection = useCallback(
    async (noteId: string, collectionId: string) => {
      await api("/collection-materials", {
        method: "POST",
        json: { collectionId, noteId },
      });
      setCmRows((prev) => {
        if (
          prev.some(
            (r) => r.collectionId === collectionId && r.noteId === noteId,
          )
        ) {
          return prev;
        }
        return [
          ...prev,
          { collectionId, materialId: null, noteId, addedAt: Date.now() },
        ];
      });
    },
    [],
  );

  const removeNoteFromCollection = useCallback(
    async (noteId: string, collectionId: string) => {
      await api(`/collection-materials/note/${collectionId}/${noteId}`, {
        method: "DELETE",
      });
      setCmRows((prev) =>
        prev.filter(
          (r) => !(r.collectionId === collectionId && r.noteId === noteId),
        ),
      );
    },
    [],
  );

  const notesInCollection = useCallback(
    (collectionId: string) => {
      const ids = new Set(
        cmRows
          .filter((r) => r.collectionId === collectionId && r.noteId)
          .map((r) => r.noteId as string),
      );
      return notes.filter((n) => ids.has(n.id));
    },
    [notes, cmRows],
  );

  const uncategorizedNotes = useMemo(() => {
    const filed = new Set(
      cmRows.filter((r) => r.noteId).map((r) => r.noteId as string),
    );
    return notes.filter((n) => !filed.has(n.id));
  }, [notes, cmRows]);

  const collectionsContainingNote = useCallback(
    (noteId: string) => {
      const ids = new Set(
        cmRows
          .filter((r) => r.noteId === noteId)
          .map((r) => r.collectionId),
      );
      return collections.filter((c) => ids.has(c.id));
    },
    [collections, cmRows],
  );

  const ensureLocalFile = useCallback(
    async (materialId: string): Promise<string> => {
      if (!user) throw new Error("Not signed in.");
      const dest = cachePath(user.id, materialId);
      if (!dest) throw new Error("File system not available.");
      const info = await FileSystem.getInfoAsync(dest);
      if (info.exists && info.size > 0) return dest;
      await ensureCacheDir(user.id);
      await downloadToCache(materialId, dest);
      return dest;
    },
    [user],
  );

  const loadAnnotations = useCallback(
    async (materialId: string): Promise<AnnotationsByPage> => {
      if (!user) return {};
      const raw = await AsyncStorage.getItem(annotationsKey(user.id, materialId));
      if (!raw) return {};
      try {
        return JSON.parse(raw) as AnnotationsByPage;
      } catch {
        return {};
      }
    },
    [user],
  );

  const saveAnnotations = useCallback(
    async (materialId: string, annos: AnnotationsByPage) => {
      if (!user) return;
      await AsyncStorage.setItem(
        annotationsKey(user.id, materialId),
        JSON.stringify(annos),
      );
    },
    [user],
  );

  const value = useMemo(
    () => ({
      materials,
      collections,
      cmRows,
      notes,
      sessions,
      isLoading,
      addMaterial,
      updateMaterial,
      deleteMaterial,
      recordSession,
      getMaterial,
      ensureLocalFile,
      loadAnnotations,
      saveAnnotations,
      refreshMaterials,
      refreshCollections,
      refreshNotes,
      createCollection,
      updateCollection,
      deleteCollection,
      addMaterialToCollection,
      removeMaterialFromCollection,
      materialsInCollection,
      uncategorizedMaterials,
      collectionsContainingMaterial,
      createNote,
      updateNote,
      deleteNote,
      getNote,
      loadNoteStrokes,
      saveNoteStrokes,
      flushNoteStrokes,
      addNoteToCollection,
      removeNoteFromCollection,
      notesInCollection,
      uncategorizedNotes,
      collectionsContainingNote,
    }),
    [
      materials,
      collections,
      cmRows,
      notes,
      sessions,
      isLoading,
      addMaterial,
      updateMaterial,
      deleteMaterial,
      recordSession,
      getMaterial,
      ensureLocalFile,
      loadAnnotations,
      saveAnnotations,
      refreshMaterials,
      refreshCollections,
      refreshNotes,
      createCollection,
      updateCollection,
      deleteCollection,
      addMaterialToCollection,
      removeMaterialFromCollection,
      materialsInCollection,
      uncategorizedMaterials,
      collectionsContainingMaterial,
      createNote,
      updateNote,
      deleteNote,
      getNote,
      loadNoteStrokes,
      saveNoteStrokes,
      flushNoteStrokes,
      addNoteToCollection,
      removeNoteFromCollection,
      notesInCollection,
      uncategorizedNotes,
      collectionsContainingNote,
    ],
  );

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}
