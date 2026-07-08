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

import { useAuth } from "./AuthContext";
import { runBackfillForUser } from "@/db/backfill";
import { db } from "@/db/client";
import {
  insertPendingCMRowLocal,
  softDeleteCMRowLocal,
  softDeleteCMRowsByCollectionLocal,
  softDeleteCMRowsByMaterialLocal,
  softDeleteCMRowsByNoteLocal,
  syntheticCMId,
  upsertCMRowsFromServer,
  useLiveCMRows,
} from "@/db/repositories/collectionMaterials";
import {
  insertPendingCollectionLocal,
  softDeleteCollectionLocal,
  updateCollectionLocalPending,
  upsertCollectionsFromServer,
  useLiveCollections,
} from "@/db/repositories/collections";
import {
  getMaterialLocal,
  insertPendingMaterialLocal,
  softDeleteMaterialLocal,
  updateMaterialLocalPending,
  upsertMaterialsFromServer,
  useLiveMaterials,
} from "@/db/repositories/materials";
import {
  findNotesWithDirtyStrokes,
  insertPendingNoteLocal,
  setNoteStrokesManifest,
  softDeleteNoteLocal,
  updateNoteLocalPending,
  upsertNotesFromServer,
  useLiveNotes,
} from "@/db/repositories/notes";
import {
  loadAnnotationsByMaterial,
  replaceAnnotationsForMaterial,
} from "@/db/repositories/annotations";
import {
  deleteStrokesFile,
  readStrokesFile,
  writeStrokesFile,
} from "@/db/strokesStore";
import {
  deleteSessionsByMaterialLocal,
  deleteSessionsByNoteLocal,
  insertPendingSessionLocal,
  upsertSessionsFromServer,
  useLiveSessions,
} from "@/db/repositories/sessions";
import { startPull, stopPull } from "@/db/pull";
import {
  enqueue as enqueueOutbox,
  enqueueOutboxIfNoPending,
} from "@/db/sync";
import { MAX_MATERIAL_BYTES, api, fileUrl } from "@/lib/api";

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
  externalUrl?: string | null;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  pausedSec?: number;
  pagesRead?: number;
  pageTimes?: Record<number, number>;
  selections?: number;
  wordsAdded?: number;
  strokesAdded?: number;
  pendingSync?: boolean;
};

export type PenType =
  | "ballpoint"
  | "pencil"
  | "marker"
  | "brush"
  | "fountain";

export type Stroke = {
  color: string;
  width: number;
  points: { x: number; y: number }[];
  kind?: "pen" | "highlighter";
  penType?: PenType;
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
  externalUrl: string | null;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  pausedSec: number;
  pagesRead: number | null;
  pageTimes: Record<number, number> | null;
  selections: number | null;
  wordsAdded: number | null;
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
    externalUrl: s.externalUrl ?? null,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    durationSec: s.durationSec,
    pausedSec: s.pausedSec ?? 0,
    pagesRead: s.pagesRead ?? undefined,
    pageTimes: s.pageTimes ?? undefined,
    selections: s.selections ?? undefined,
    wordsAdded: s.wordsAdded ?? undefined,
    strokesAdded: s.strokesAdded ?? undefined,
  };
}

function sessionToApi(s: Session): Omit<ApiSession, "createdAt"> {
  return {
    id: s.id,
    materialId: s.materialId,
    noteId: s.noteId,
    externalUrl: s.externalUrl ?? null,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    durationSec: s.durationSec,
    pausedSec: s.pausedSec ?? 0,
    pagesRead: s.pagesRead ?? null,
    pageTimes: s.pageTimes ?? null,
    selections: s.selections ?? null,
    wordsAdded: s.wordsAdded ?? null,
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
  refreshAll: () => Promise<void>;
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
  return `@Tarkeez/sessions/${userId}`;
}
function annotationsKey(userId: string, materialId: string) {
  return `@Tarkeez/annos/${userId}/${materialId}`;
}
function noteStrokesKey(userId: string, noteId: string) {
  return `@Tarkeez/note_strokes/${userId}/${noteId}`;
}

function cachePath(userId: string, materialId: string): string | null {
  if (!FileSystem.cacheDirectory) return null;
  return `${FileSystem.cacheDirectory}Tarkeez/${userId}/${materialId}.pdf`;
}

async function ensureCacheDir(userId: string) {
  if (!FileSystem.cacheDirectory) return;
  const dir = `${FileSystem.cacheDirectory}Tarkeez/${userId}`;
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
  // React state — drives web (no SQLite) and holds note drawingStrokes the
  // strokes-fallback path consults. On native the exposed lists below come
  // from SQLite via useLiveQuery; this state is still maintained for the
  // strokes fallback and removed in M9.
  const [webMaterials, setWebMaterials] = useState<Material[]>([]);
  const [webCollections, setWebCollections] = useState<Collection[]>([]);
  const [webCmRows, setWebCmRows] = useState<CMRow[]>([]);
  const [webNotes, setWebNotes] = useState<Note[]>([]);
  const [webSessions, setWebSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Live SQLite views — return [] on web (no DB) and on logout (no user).
  const liveMaterials = useLiveMaterials(user?.id);
  const liveCollections = useLiveCollections(user?.id);
  const liveCmRows = useLiveCMRows(user?.id);
  const liveNotes = useLiveNotes(user?.id);
  const liveSessions = useLiveSessions(user?.id);

  // Selectors — what the rest of the provider and the context consumers see.
  // For materials/notes/collections we merge the live SQLite query with the
  // optimistic webX state: addMaterial / createNote / createCollection
  // populate webX synchronously before navigation, but useLiveQuery has an
  // async re-evaluation gap. Without the merge, a freshly-created row is
  // briefly invisible to getMaterial/getNote/getCollection and the next
  // screen renders "not found". Once the live query catches up, the Set
  // filter drops the pending entry so the live row (with any server
  // corrections) wins.
  const materials = useMemo(() => {
    if (!db) return webMaterials;
    if (webMaterials.length === 0) return liveMaterials;
    const liveIds = new Set(liveMaterials.map((m) => m.id));
    const pending = webMaterials.filter((m) => !liveIds.has(m.id));
    return pending.length === 0 ? liveMaterials : [...pending, ...liveMaterials];
  }, [liveMaterials, webMaterials]);
  const collections = useMemo(() => {
    if (!db) return webCollections;
    if (webCollections.length === 0) return liveCollections;
    const liveIds = new Set(liveCollections.map((c) => c.id));
    const pending = webCollections.filter((c) => !liveIds.has(c.id));
    return pending.length === 0
      ? liveCollections
      : [...pending, ...liveCollections];
  }, [liveCollections, webCollections]);
  const cmRows = db ? liveCmRows : webCmRows;
  const notes = useMemo(() => {
    if (!db) return webNotes;
    if (webNotes.length === 0) return liveNotes;
    const liveIds = new Set(liveNotes.map((n) => n.id));
    const pending = webNotes.filter((n) => !liveIds.has(n.id));
    return pending.length === 0 ? liveNotes : [...pending, ...liveNotes];
  }, [liveNotes, webNotes]);
  const sessions = db ? liveSessions : webSessions;

  const refreshMaterials = useCallback(async () => {
    const res = await api<{ materials: ApiMaterial[] }>("/materials");
    setWebMaterials(res.materials.map(fromApi));
    if (user) {
      try {
        await upsertMaterialsFromServer(
          res.materials.map((m) => ({
            id: m.id,
            userId: user.id,
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
      } catch (err) {
        console.warn("[db] materials dual-write failed", err);
      }
    }
  }, [user]);

  const refreshCollections = useCallback(async () => {
    const [collectionsRes, cmRes] = await Promise.all([
      api<{ collections: ApiCollection[] }>("/collections"),
      api<{ rows: ApiCMRow[] }>("/collection-materials"),
    ]);
    setWebCollections(collectionsRes.collections.map(collectionFromApi));
    setWebCmRows(cmRes.rows.map(cmRowFromApi));
    if (user) {
      try {
        await upsertCollectionsFromServer(
          collectionsRes.collections.map((c) => ({
            id: c.id,
            userId: user.id,
            name: c.name,
            createdAt: new Date(c.createdAt).getTime(),
            updatedAt: new Date(c.createdAt).getTime(),
          })),
        );
        await upsertCMRowsFromServer(
          cmRes.rows.map((r) => ({
            collectionId: r.collectionId,
            materialId: r.materialId ?? null,
            noteId: r.noteId ?? null,
            addedAt: new Date(r.addedAt).getTime(),
          })),
        );
      } catch (err) {
        console.warn("[db] collections dual-write failed", err);
      }
    }
  }, [user]);

  const refreshNotes = useCallback(async () => {
    const res = await api<{ notes: ApiNote[] }>("/notes");
    setWebNotes(res.notes.map(noteFromApi));
    if (user) {
      try {
        await upsertNotesFromServer(
          res.notes.map((n) => ({
            id: n.id,
            userId: user.id,
            title: n.title,
            contentHtml: n.contentHtml ?? "",
            createdAt: new Date(n.createdAt).getTime(),
            updatedAt: new Date(n.updatedAt).getTime(),
          })),
        );
      } catch (err) {
        console.warn("[db] notes dual-write failed", err);
      }
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setWebMaterials([]);
      setWebCollections([]);
      setWebCmRows([]);
      setWebNotes([]);
      setWebSessions([]);
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
          // AsyncStorage session cache hydrates only the !db Safari/Firefox
          // path; when SQLite is available `useLiveSessions` is canonical.
          db
            ? Promise.resolve<string | null>(null)
            : AsyncStorage.getItem(sessionsKey(user.id)),
        ]);
        if (cancelled) return;
        if (!db) {
          const cached = sRaw ? (JSON.parse(sRaw) as Session[]) : [];
          setWebSessions(cached);
        }
      } catch {
        if (!cancelled) {
          setWebMaterials([]);
          setWebCollections([]);
          setWebCmRows([]);
          setWebNotes([]);
          setWebSessions([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
      if (cancelled) return;
      try {
        await runBackfillForUser(user.id);
      } catch (err) {
        console.warn("[db] backfill failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, refreshMaterials, refreshCollections, refreshNotes]);

  // After initial hydrate, fetch sessions from DB and reconcile with the local
  // cache. DB rows are authoritative; any local session with `pendingSync` is
  // retried in the background.
  const refreshSessions = useCallback(async () => {
    if (!user) return;
    const res = await api<{ sessions: ApiSession[] }>("/sessions");
    const dbSessions = res.sessions.map(sessionFromApi);
    // !db (Safari/Firefox fallback) keeps React state + AsyncStorage in sync
    // since useLiveSessions returns []. When SQLite is available, the post-
    // API upsert below feeds the live query and we skip the legacy mirror.
    if (!db) {
      setWebSessions((prev) => {
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
    }
    try {
      await upsertSessionsFromServer(
        dbSessions
          .filter(
            (s) =>
              (s.materialId != null ? 1 : 0) +
                (s.noteId != null ? 1 : 0) +
                (s.externalUrl != null ? 1 : 0) ===
              1,
          )
          .map((s) => ({
            id: s.id,
            userId: user.id,
            materialId: s.materialId,
            noteId: s.noteId,
            externalUrl: s.externalUrl ?? null,
            startedAt: s.startedAt,
            endedAt: s.endedAt,
            durationSec: s.durationSec,
            pausedSec: s.pausedSec ?? 0,
            pagesRead: s.pagesRead ?? null,
            pageTimes: s.pageTimes ?? null,
            selections: s.selections ?? null,
            wordsAdded: s.wordsAdded ?? null,
            strokesAdded: s.strokesAdded ?? null,
            createdAt: s.endedAt,
            pendingSync: false,
          })),
      );
    } catch (err) {
      console.warn("[db] sessions dual-write failed", err);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      try {
        await refreshSessions();
      } catch {
        // offline — keep local cache
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, refreshSessions]);

  const refreshAll = useCallback(async () => {
    const results = await Promise.allSettled([
      refreshMaterials(),
      refreshCollections(),
      refreshNotes(),
      refreshSessions(),
    ]);
    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    if (failures.length > 0) {
      throw failures[0].reason;
    }
  }, [refreshMaterials, refreshCollections, refreshNotes, refreshSessions]);

  // Periodic pull: on app foreground, network reconnect, and a 60s
  // heartbeat. The LWW guard inside `upsertXFromServer` protects local
  // pending mutations from being overwritten. Tombstone detection deletes
  // synced rows that the server no longer has.
  useEffect(() => {
    if (!user || !db) return;
    startPull(user.id);
    return () => stopPull();
  }, [user]);

  // Boot-time recovery for the strokes pipeline: scan for notes with
  // strokes_dirty_at set (backfill, killed-mid-debounce, or a previous failed
  // push) and enqueue one outbox row per dirty note. Runs on every SQLite
  // platform (native + Chromium web); the !db Safari/Firefox path keeps
  // strokes in AsyncStorage and never reaches this scan.
  useEffect(() => {
    if (!user || !db) return;
    let cancelled = false;
    (async () => {
      try {
        const dirty = await findNotesWithDirtyStrokes(user.id);
        if (cancelled) return;
        for (const row of dirty) {
          if (cancelled) break;
          try {
            await enqueueOutboxIfNoPending(
              "note_strokes",
              row.id,
              "update",
              { noteId: row.id },
            );
          } catch (err) {
            console.warn("[db] enqueue dirty strokes failed", err);
          }
        }
      } catch (err) {
        console.warn("[db] dirty strokes scan failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Mirrors session list state to React state + AsyncStorage only when
  // SQLite is unavailable (Safari/Firefox legacy path). When db != null the
  // SQLite row plus `useLiveSessions` is canonical; AsyncStorage is unused.
  const persistSessions = useCallback(
    async (next: Session[]) => {
      if (!user) return;
      if (db) return;
      setWebSessions(next);
      await AsyncStorage.setItem(sessionsKey(user.id), JSON.stringify(next));
    },
    [user],
  );

  const addMaterial = useCallback(
    async ({ title, fileUri, fileName, mimeType }: AddMaterialInput) => {
      if (!user) throw new Error("Not signed in");
      const id = uuidV4();
      const now = Date.now();
      const cleanTitle = title.trim() || fileName.replace(/\.pdf$/i, "");
      const mt = mimeType || "application/pdf";

      // Web fallback: no SQLite, no outbox. Keep the synchronous FormData
      // upload path until M8 enables wa-sqlite on web.
      if (!db) {
        const form = new FormData();
        form.append("title", cleanTitle);
        const blob = await (await fetch(fileUri)).blob();
        const webFile = new File([blob], fileName, { type: mt });
        form.append("file", webFile);
        const res = await api<{ material: ApiMaterial }>("/materials", {
          method: "POST",
          formData: form,
        });
        const m = fromApi(res.material);
        setWebMaterials((prev) => [m, ...prev]);
        return m;
      }

      // 1. Copy PDF into our cache at the canonical path (keyed by the
      //    client-generated materialId, not the user-supplied fileName).
      const dest = cachePath(user.id, id);
      if (!dest) throw new Error("File system unavailable");
      try {
        await ensureCacheDir(user.id);
        await FileSystem.copyAsync({ from: fileUri, to: dest });
      } catch (err) {
        throw new Error(`Could not copy PDF into local cache: ${String(err)}`);
      }

      // 2. Read size from the local copy (picker URI may not have provided it).
      let sizeBytes = 0;
      try {
        const info = await FileSystem.getInfoAsync(dest);
        if (info.exists) {
          const maybeSize = (info as { size?: number }).size;
          sizeBytes = maybeSize ?? 0;
        }
      } catch {
        /* leave 0 */
      }
      if (sizeBytes > MAX_MATERIAL_BYTES) {
        try {
          await FileSystem.deleteAsync(dest, { idempotent: true });
        } catch {
          /* ignore */
        }
        throw new Error(
          `This PDF is too large. Materials must be ${
            MAX_MATERIAL_BYTES / (1024 * 1024)
          } MB or less.`,
        );
      }

      // 3. Optimistic library state.
      const material: Material = {
        id,
        title: cleanTitle,
        fileName,
        totalPages: undefined,
        currentPage: 1,
        createdAt: now,
        sizeBytes,
      };
      setWebMaterials((prev) => [material, ...prev]);
      try {
        await insertPendingMaterialLocal({
          id,
          userId: user.id,
          title: cleanTitle,
          fileName,
          mimeType: mt,
          sizeBytes,
          totalPages: null,
          currentPage: 1,
          localFilePath: dest,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        console.warn("[db] addMaterial local write failed", err);
      }

      // 4. Outbox push: handler uploads to Storage + inserts metadata.
      try {
        await enqueueOutbox("materials", id, "create", { id });
      } catch (err) {
        console.warn("[db] enqueue material create failed", err);
      }
      return material;
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
      const now = Date.now();

      if (!db) {
        const res = await api<{ material: ApiMaterial }>(`/materials/${id}`, {
          method: "PATCH",
          json: body,
        });
        const updated = fromApi(res.material);
        setWebMaterials((prev) =>
          prev.map((m) => (m.id === id ? updated : m)),
        );
        return;
      }

      setWebMaterials((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );
      try {
        await updateMaterialLocalPending({
          id,
          title: patch.title,
          totalPages: patch.totalPages ?? undefined,
          currentPage: patch.currentPage,
          updatedAt: now,
        });
      } catch (err) {
        console.warn("[db] updateMaterial local write failed", err);
      }
      try {
        await enqueueOutboxIfNoPending("materials", id, "update", { id });
      } catch (err) {
        console.warn("[db] enqueue material update failed", err);
      }
    },
    [],
  );

  const deleteMaterial = useCallback(
    async (id: string) => {
      if (!user) return;

      if (!db) {
        await api(`/materials/${id}`, { method: "DELETE" });
        setWebMaterials((prev) => prev.filter((m) => m.id !== id));
        setWebCmRows((prev) => prev.filter((r) => r.materialId !== id));
        const dest = cachePath(user.id, id);
        if (dest) {
          try {
            await FileSystem.deleteAsync(dest, { idempotent: true });
          } catch {
            /* ignore */
          }
        }
        const nextSessions = sessions.filter((s) => s.materialId !== id);
        await persistSessions(nextSessions);
        return;
      }

      // Capture fileName BEFORE soft-delete so the handler payload is
      // self-contained even if the local row is later hard-deleted.
      const local = await getMaterialLocal(id);
      const fileName = local?.fileName ?? null;

      setWebMaterials((prev) => prev.filter((m) => m.id !== id));
      setWebCmRows((prev) => prev.filter((r) => r.materialId !== id));
      try {
        await softDeleteMaterialLocal(id);
        await softDeleteCMRowsByMaterialLocal(id);
        await deleteSessionsByMaterialLocal(id);
      } catch (err) {
        console.warn("[db] deleteMaterial local write failed", err);
      }

      // Cached PDF is dead weight after soft-delete; free disk now.
      const dest = cachePath(user.id, id);
      if (dest) {
        try {
          await FileSystem.deleteAsync(dest, { idempotent: true });
        } catch {
          /* ignore */
        }
      }

      // SQLite + useLiveSessions is canonical when db != null;
      // deleteSessionsByMaterialLocal above already removed the rows.

      try {
        await enqueueOutbox("materials", id, "delete", {
          userId: user.id,
          fileName,
        });
      } catch (err) {
        console.warn("[db] enqueue material delete failed", err);
      }
    },
    [sessions, persistSessions, user],
  );

  const recordSession = useCallback(
    async (s: Omit<Session, "id">) => {
      if (!user) return;
      // 3-way XOR pre-flight: study_sessions.ss_one_target_chk requires
      // exactly one of (material_id, note_id, external_url) to be non-null.
      // Failing this in SQLite throws a CHECK violation that we swallow in
      // the catch below; surfacing it here makes the cause visible.
      const targetCount =
        (s.materialId ? 1 : 0) +
        (s.noteId ? 1 : 0) +
        (s.externalUrl ? 1 : 0);
      if (targetCount !== 1) {
        console.warn(
          "[session] skipped — XOR constraint would fail",
          {
            materialId: s.materialId,
            noteId: s.noteId,
            externalUrl: s.externalUrl,
          },
        );
        return;
      }
      const session: Session = { ...s, id: uuidV4() };
      const localFirst: Session = { ...session, pendingSync: true };
      // !db (Safari/Firefox legacy): persist to React state + AsyncStorage
      // and return. When db != null persistSessions is a no-op and we fall
      // through to the SQLite + outbox path.
      const next = [localFirst, ...sessions];
      await persistSessions(next);
      if (!db) return;
      // Optimistic SQLite insert with pending_create status.
      try {
        await insertPendingSessionLocal({
          id: session.id,
          userId: user.id,
          materialId: session.materialId,
          noteId: session.noteId,
          externalUrl: session.externalUrl ?? null,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          durationSec: session.durationSec,
          pausedSec: session.pausedSec ?? 0,
          pagesRead: session.pagesRead ?? null,
          pageTimes: session.pageTimes ?? null,
          selections: session.selections ?? null,
          wordsAdded: session.wordsAdded ?? null,
          strokesAdded: session.strokesAdded ?? null,
          createdAt: session.endedAt,
          pendingSync: true,
        });
      } catch (err) {
        // A failed insert means the session is lost — surface it loudly so a
        // schema mismatch (e.g. missing external_url) can't fail silently.
        console.error("[db] insertPendingSession failed", err);
      }
      // Enqueue outbox row — push worker POSTs and flips status to synced.
      try {
        await enqueueOutbox(
          "study_sessions",
          session.id,
          "create",
          sessionToApi(session),
        );
      } catch (err) {
        console.error("[db] enqueue session failed", err);
      }
    },
    [sessions, persistSessions, user],
  );

  const getMaterial = useCallback(
    (id: string) => materials.find((m) => m.id === id),
    [materials],
  );

  const createCollection = useCallback(
    async (name: string) => {
      if (!user) throw new Error("Not signed in");
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const id = uuidV4();
      const now = Date.now();
      const c: Collection = { id, name: trimmed, createdAt: now };

      // Web fallback: no SQLite — call server directly and store the
      // canonical row in React state. Used until M8 enables wa-sqlite.
      if (!db) {
        const res = await api<{ collection: ApiCollection }>("/collections", {
          method: "POST",
          json: { id, name: trimmed },
        });
        const fromServer = collectionFromApi(res.collection);
        setWebCollections((prev) => [fromServer, ...prev]);
        return fromServer;
      }

      setWebCollections((prev) => [c, ...prev]);
      try {
        await insertPendingCollectionLocal({
          id,
          userId: user.id,
          name: trimmed,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        console.warn("[db] createCollection local write failed", err);
      }
      try {
        await enqueueOutbox("collections", id, "create", {
          id,
          name: trimmed,
        });
      } catch (err) {
        console.warn("[db] enqueue collection create failed", err);
      }
      return c;
    },
    [user],
  );

  const updateCollection = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const now = Date.now();

      if (!db) {
        const res = await api<{ collection: ApiCollection }>(
          `/collections/${id}`,
          { method: "PATCH", json: { name: trimmed } },
        );
        const updated = collectionFromApi(res.collection);
        setWebCollections((prev) =>
          prev.map((c) => (c.id === id ? updated : c)),
        );
        return;
      }

      setWebCollections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
      );
      try {
        await updateCollectionLocalPending({ id, name: trimmed, updatedAt: now });
      } catch (err) {
        console.warn("[db] updateCollection local write failed", err);
      }
      try {
        await enqueueOutbox("collections", id, "update", { id, name: trimmed });
      } catch (err) {
        console.warn("[db] enqueue collection update failed", err);
      }
    },
    [],
  );

  const deleteCollection = useCallback(async (id: string) => {
    if (!db) {
      await api(`/collections/${id}`, { method: "DELETE" });
      setWebCollections((prev) => prev.filter((c) => c.id !== id));
      setWebCmRows((prev) => prev.filter((r) => r.collectionId !== id));
      return;
    }

    setWebCollections((prev) => prev.filter((c) => c.id !== id));
    setWebCmRows((prev) => prev.filter((r) => r.collectionId !== id));
    try {
      await softDeleteCollectionLocal(id);
      await softDeleteCMRowsByCollectionLocal(id);
    } catch (err) {
      console.warn("[db] deleteCollection local write failed", err);
    }
    try {
      await enqueueOutbox("collections", id, "delete", { id });
    } catch (err) {
      console.warn("[db] enqueue collection delete failed", err);
    }
  }, []);

  const addMaterialToCollection = useCallback(
    async (materialId: string, collectionId: string) => {
      const addedAt = Date.now();
      const cmPayload = { collectionId, materialId, noteId: null };

      if (!db) {
        await api("/collection-materials", {
          method: "POST",
          json: { collectionId, materialId },
        });
        setWebCmRows((prev) => {
          if (
            prev.some(
              (r) =>
                r.collectionId === collectionId && r.materialId === materialId,
            )
          ) {
            return prev;
          }
          return [...prev, { collectionId, materialId, noteId: null, addedAt }];
        });
        return;
      }

      setWebCmRows((prev) => {
        if (
          prev.some(
            (r) => r.collectionId === collectionId && r.materialId === materialId,
          )
        ) {
          return prev;
        }
        return [...prev, { collectionId, materialId, noteId: null, addedAt }];
      });
      try {
        await insertPendingCMRowLocal({
          collectionId,
          materialId,
          noteId: null,
          addedAt,
        });
      } catch (err) {
        console.warn("[db] addMaterialToCollection local write failed", err);
      }
      try {
        await enqueueOutbox(
          "collection_materials",
          syntheticCMId(collectionId, { materialId }),
          "create",
          cmPayload,
        );
      } catch (err) {
        console.warn("[db] enqueue CM create failed", err);
      }
    },
    [],
  );

  const removeMaterialFromCollection = useCallback(
    async (materialId: string, collectionId: string) => {
      if (!db) {
        await api(
          `/collection-materials/material/${collectionId}/${materialId}`,
          { method: "DELETE" },
        );
        setWebCmRows((prev) =>
          prev.filter(
            (r) =>
              !(r.collectionId === collectionId && r.materialId === materialId),
          ),
        );
        return;
      }

      setWebCmRows((prev) =>
        prev.filter(
          (r) =>
            !(r.collectionId === collectionId && r.materialId === materialId),
        ),
      );
      try {
        await softDeleteCMRowLocal(collectionId, { materialId });
      } catch (err) {
        console.warn(
          "[db] removeMaterialFromCollection local write failed",
          err,
        );
      }
      try {
        await enqueueOutbox(
          "collection_materials",
          syntheticCMId(collectionId, { materialId }),
          "delete",
          { collectionId, materialId, noteId: null },
        );
      } catch (err) {
        console.warn("[db] enqueue CM delete failed", err);
      }
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
      if (!user) throw new Error("Not signed in");
      const id = uuidV4();
      const now = Date.now();
      const note: Note = {
        id,
        title: title ?? "Untitled",
        contentHtml: contentHtml ?? "",
        drawingStrokes: [],
        createdAt: now,
        updatedAt: now,
      };

      if (!db) {
        const res = await api<{ note: ApiNote }>("/notes", {
          method: "POST",
          json: {
            id,
            title: note.title,
            contentHtml: note.contentHtml,
          },
        });
        const fromServer = noteFromApi(res.note);
        setWebNotes((prev) => [fromServer, ...prev]);
        return fromServer;
      }

      setWebNotes((prev) => [note, ...prev]);
      try {
        await insertPendingNoteLocal({
          id,
          userId: user.id,
          title: note.title,
          contentHtml: note.contentHtml,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        console.warn("[db] createNote local write failed", err);
      }
      try {
        await enqueueOutbox("notes", id, "create", {
          id,
          title: note.title,
          contentHtml: note.contentHtml,
        });
      } catch (err) {
        console.warn("[db] enqueue note create failed", err);
      }
      return note;
    },
    [user],
  );

  const updateNote = useCallback(
    async (
      id: string,
      patch: {
        title?: string;
        contentHtml?: string;
      },
    ): Promise<void> => {
      const body: Record<string, unknown> = {};
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.contentHtml !== undefined) body.contentHtml = patch.contentHtml;
      if (Object.keys(body).length === 0) return;
      const now = Date.now();

      if (!db) {
        const res = await api<{ note: ApiNote }>(`/notes/${id}`, {
          method: "PATCH",
          json: body,
        });
        const updated = noteFromApi(res.note);
        setWebNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
        return;
      }

      setWebNotes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, ...patch, updatedAt: now } : n,
        ),
      );
      try {
        await updateNoteLocalPending({
          id,
          title: patch.title,
          contentHtml: patch.contentHtml,
          updatedAt: now,
        });
      } catch (err) {
        console.warn("[db] updateNote local write failed", err);
      }
      try {
        await enqueueOutbox("notes", id, "update", { id, ...patch });
      } catch (err) {
        console.warn("[db] enqueue note update failed", err);
      }
    },
    [],
  );

  const noteStrokesSyncTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const noteStrokesPending = useRef(new Map<string, Stroke[]>());

  // Strokes flush:
  //   - When SQLite is available (native + Chromium web): enqueue one outbox
  //     row per note. The handler reads the current file at send time so
  //     a single queued row absorbs subsequent edits.
  //   - When db is null (Safari/Firefox): keep the legacy PATCH path so
  //     those browsers keep working until they reach SQLite.
  const flushNoteStrokes = useCallback(
    async (noteId: string) => {
      const timer = noteStrokesSyncTimers.current.get(noteId);
      if (timer) {
        clearTimeout(timer);
        noteStrokesSyncTimers.current.delete(noteId);
      }

      if (db) {
        try {
          await enqueueOutboxIfNoPending(
            "note_strokes",
            noteId,
            "update",
            { noteId },
          );
        } catch (err) {
          console.warn("[db] enqueue strokes flush failed", err);
        }
        noteStrokesPending.current.delete(noteId);
        return;
      }

      const pending = noteStrokesPending.current.get(noteId);
      if (!pending) return;
      noteStrokesPending.current.delete(noteId);
      try {
        const res = await api<{ note: ApiNote }>(`/notes/${noteId}`, {
          method: "PATCH",
          json: { drawingStrokes: pending },
        });
        const updated = noteFromApi(res.note);
        setWebNotes((prev) =>
          prev.map((n) => (n.id === noteId ? updated : n)),
        );
      } catch {
        /* leave AsyncStorage copy; next save will retry */
      }
    },
    [],
  );

  const saveNoteStrokes = useCallback(
    async (noteId: string, strokes: Stroke[]) => {
      if (!user) return;
      setWebNotes((prev) =>
        prev.map((n) =>
          n.id === noteId ? { ...n, drawingStrokes: strokes } : n,
        ),
      );

      // No-SQLite fallback (Safari/Firefox without SAB): keep the legacy
      // AsyncStorage + debounced PATCH path.
      if (!db) {
        try {
          await AsyncStorage.setItem(
            noteStrokesKey(user.id, noteId),
            JSON.stringify(strokes),
          );
        } catch {
          /* best effort */
        }
        noteStrokesPending.current.set(noteId, strokes);
        const existing = noteStrokesSyncTimers.current.get(noteId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          noteStrokesSyncTimers.current.delete(noteId);
          void flushNoteStrokes(noteId);
        }, 1500);
        noteStrokesSyncTimers.current.set(noteId, timer);
        return;
      }

      // Native + Chromium web: write strokes file (FS on native, OPFS on web)
      // immediately, update the manifest, debounce the outbox enqueue.
      const writeResult = await writeStrokesFile(user.id, noteId, strokes);
      if (!writeResult) return;
      const dirtyAt = Date.now();
      try {
        await setNoteStrokesManifest(noteId, {
          strokesFilePath: writeResult.path,
          strokesByteSize: writeResult.byteSize,
          strokesDirtyAt: dirtyAt,
        });
      } catch (err) {
        console.warn("[db] strokes manifest update failed", err);
      }

      const existing = noteStrokesSyncTimers.current.get(noteId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        noteStrokesSyncTimers.current.delete(noteId);
        void enqueueOutboxIfNoPending(
          "note_strokes",
          noteId,
          "update",
          { noteId },
        ).catch((err) =>
          console.warn("[db] enqueue strokes failed", err),
        );
      }, 1500);
      noteStrokesSyncTimers.current.set(noteId, timer);
    },
    [user, flushNoteStrokes],
  );

  const loadNoteStrokes = useCallback(
    async (noteId: string): Promise<Stroke[]> => {
      if (!user) return [];

      if (db) {
        const fromFile = await readStrokesFile(user.id, noteId);
        if (fromFile) return fromFile;
      }

      // AsyncStorage cache (pre-backfill rows that haven't yet been moved
      // to the strokes store, plus the !db Safari/Firefox fallback path).
      try {
        const raw = await AsyncStorage.getItem(
          noteStrokesKey(user.id, noteId),
        );
        if (raw) {
          const parsed = JSON.parse(raw) as Stroke[];
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {
        /* fall through */
      }

      // React state — holds server-pulled strokes that haven't been
      // written to the strokes store yet.
      const fromDb =
        webNotes.find((n) => n.id === noteId)?.drawingStrokes ?? [];
      if (db && fromDb.length > 0) {
        // Persist to the strokes store so subsequent reads are fast and
        // the outbox push has somewhere to read from on reconnect.
        const writeResult = await writeStrokesFile(user.id, noteId, fromDb);
        if (writeResult) {
          try {
            await setNoteStrokesManifest(noteId, {
              strokesFilePath: writeResult.path,
              strokesByteSize: writeResult.byteSize,
              strokesDirtyAt: null,
            });
          } catch {
            /* best effort */
          }
        }
      }
      return fromDb;
    },
    [user, webNotes],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      if (!user) return;
      const timer = noteStrokesSyncTimers.current.get(id);
      if (timer) clearTimeout(timer);
      noteStrokesSyncTimers.current.delete(id);
      noteStrokesPending.current.delete(id);

      if (!db) {
        await api(`/notes/${id}`, { method: "DELETE" });
        setWebNotes((prev) => prev.filter((n) => n.id !== id));
        setWebCmRows((prev) => prev.filter((r) => r.noteId !== id));
        setWebSessions((prev) => {
          const next = prev.filter((s) => s.noteId !== id);
          AsyncStorage.setItem(
            sessionsKey(user.id),
            JSON.stringify(next),
          ).catch(() => {});
          return next;
        });
        try {
          await AsyncStorage.removeItem(noteStrokesKey(user.id, id));
        } catch {
          /* ignore */
        }
        return;
      }

      // Evict from the webNotes cache so loadNoteStrokes can't resurrect the
      // deleted note's drawingStrokes; useLiveNotes / useLiveCMRows are the
      // authoritative read source when db != null.
      setWebNotes((prev) => prev.filter((n) => n.id !== id));
      setWebCmRows((prev) => prev.filter((r) => r.noteId !== id));
      try {
        await softDeleteNoteLocal(id);
        await softDeleteCMRowsByNoteLocal(id);
        await deleteSessionsByNoteLocal(id);
      } catch (err) {
        console.warn("[db] deleteNote local write failed", err);
      }
      try {
        await deleteStrokesFile(user.id, id);
      } catch {
        /* idempotent */
      }
      try {
        // Defensive cleanup of any legacy AsyncStorage strokes key from
        // pre-M9 installs that the backfill may not have drained yet.
        await AsyncStorage.removeItem(noteStrokesKey(user.id, id));
      } catch {
        /* ignore */
      }
      try {
        await enqueueOutbox("notes", id, "delete", { id });
      } catch (err) {
        console.warn("[db] enqueue note delete failed", err);
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
      const addedAt = Date.now();
      const cmPayload = { collectionId, materialId: null, noteId };

      if (!db) {
        await api("/collection-materials", {
          method: "POST",
          json: { collectionId, noteId },
        });
        setWebCmRows((prev) => {
          if (
            prev.some(
              (r) => r.collectionId === collectionId && r.noteId === noteId,
            )
          ) {
            return prev;
          }
          return [...prev, { collectionId, materialId: null, noteId, addedAt }];
        });
        return;
      }

      setWebCmRows((prev) => {
        if (
          prev.some(
            (r) => r.collectionId === collectionId && r.noteId === noteId,
          )
        ) {
          return prev;
        }
        return [...prev, { collectionId, materialId: null, noteId, addedAt }];
      });
      try {
        await insertPendingCMRowLocal({
          collectionId,
          materialId: null,
          noteId,
          addedAt,
        });
      } catch (err) {
        console.warn("[db] addNoteToCollection local write failed", err);
      }
      try {
        await enqueueOutbox(
          "collection_materials",
          syntheticCMId(collectionId, { noteId }),
          "create",
          cmPayload,
        );
      } catch (err) {
        console.warn("[db] enqueue CM create failed", err);
      }
    },
    [],
  );

  const removeNoteFromCollection = useCallback(
    async (noteId: string, collectionId: string) => {
      if (!db) {
        await api(`/collection-materials/note/${collectionId}/${noteId}`, {
          method: "DELETE",
        });
        setWebCmRows((prev) =>
          prev.filter(
            (r) => !(r.collectionId === collectionId && r.noteId === noteId),
          ),
        );
        return;
      }

      setWebCmRows((prev) =>
        prev.filter(
          (r) => !(r.collectionId === collectionId && r.noteId === noteId),
        ),
      );
      try {
        await softDeleteCMRowLocal(collectionId, { noteId });
      } catch (err) {
        console.warn(
          "[db] removeNoteFromCollection local write failed",
          err,
        );
      }
      try {
        await enqueueOutbox(
          "collection_materials",
          syntheticCMId(collectionId, { noteId }),
          "delete",
          { collectionId, materialId: null, noteId },
        );
      } catch (err) {
        console.warn("[db] enqueue CM delete failed", err);
      }
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
      if (db) {
        const fromSqlite = await loadAnnotationsByMaterial(user.id, materialId);
        return fromSqlite as AnnotationsByPage;
      }
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
      if (db) {
        await replaceAnnotationsForMaterial(user.id, materialId, annos);
        return;
      }
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
      refreshAll,
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
      refreshAll,
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
