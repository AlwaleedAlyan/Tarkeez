import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

export type Session = {
  id: string;
  materialId: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  pausedSec?: number;
  pagesRead: number;
  pageTimes?: Record<number, number>;
  selections?: number;
};

export type Stroke = {
  color: string;
  width: number;
  points: { x: number; y: number }[];
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

type AddMaterialInput = {
  title: string;
  fileUri: string;
  fileName: string;
  mimeType?: string;
};

type LibraryContextType = {
  materials: Material[];
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
};

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

function genId() {
  return Date.now().toString() + Math.random().toString(36).slice(2, 9);
}

function sessionsKey(userId: string) {
  return `@Stymer/sessions/${userId}`;
}
function annotationsKey(userId: string, materialId: string) {
  return `@Stymer/annos/${userId}/${materialId}`;
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

async function downloadToCache(materialId: string, dest: string) {
  const url = await fileUrl(materialId);
  const result = await FileSystem.downloadAsync(url, dest);
  if (result.status >= 400) {
    throw new Error(`Could not download file (${result.status})`);
  }
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshMaterials = useCallback(async () => {
    const res = await api<{ materials: ApiMaterial[] }>("/materials/${id}");
    setMaterials(res.materials.map(fromApi));
  }, []);

  useEffect(() => {
    if (!user) {
      setMaterials([]);
      setSessions([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [_, sRaw] = await Promise.all([
          refreshMaterials(),
          AsyncStorage.getItem(sessionsKey(user.id)),
        ]);
        if (cancelled) return;
        setSessions(sRaw ? (JSON.parse(sRaw) as Session[]) : []);
      } catch {
        if (!cancelled) {
          setMaterials([]);
          setSessions([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, refreshMaterials]);

  const persistSessions = useCallback(
    async (next: Session[]) => {
      if (!user) return;
      setSessions(next);
      await AsyncStorage.setItem(sessionsKey(user.id), JSON.stringify(next));
    },
    [user],
  );

  const addMaterial = useCallback(
    async ({ title, fileUri, fileName, mimeType }: AddMaterialInput) => {
      const form = new FormData();
      form.append("title", title.trim() || fileName.replace(/\.pdf$/i, ""));
      // React Native FormData accepts { uri, name, type } objects
      form.append("file", {
        uri: fileUri,
        name: fileName,
        type: mimeType || "application/pdf",
      } as unknown as Blob);

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
      const session: Session = { ...s, id: genId() };
      await persistSessions([session, ...sessions]);
    },
    [sessions, persistSessions],
  );

  const getMaterial = useCallback(
    (id: string) => materials.find((m) => m.id === id),
    [materials],
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
    }),
    [
      materials,
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
