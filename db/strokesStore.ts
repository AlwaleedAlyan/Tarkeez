import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import type { Stroke } from "@/contexts/LibraryContext";

export type WriteResult = {
  path: string;
  byteSize: number;
};

// ─── Native backend (expo-file-system) ──────────────────────────────────────

function nativeBaseDir(userId: string): string | null {
  if (!FileSystem.documentDirectory) return null;
  return `${FileSystem.documentDirectory}Tarkeez/${userId}/strokes`;
}

function nativePath(userId: string, noteId: string): string | null {
  const dir = nativeBaseDir(userId);
  if (!dir) return null;
  return `${dir}/${noteId}.json`;
}

async function nativeEnsureDir(userId: string): Promise<void> {
  const dir = nativeBaseDir(userId);
  if (!dir) return;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    /* already exists */
  }
}

async function nativeRead(
  userId: string,
  noteId: string,
): Promise<Stroke[] | null> {
  const path = nativePath(userId, noteId);
  if (!path) return null;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw) as Stroke[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function nativeWrite(
  userId: string,
  noteId: string,
  strokes: Stroke[],
): Promise<WriteResult | null> {
  const path = nativePath(userId, noteId);
  if (!path) return null;
  await nativeEnsureDir(userId);
  const payload = JSON.stringify(strokes);
  const tmp = `${path}.tmp`;
  await FileSystem.writeAsStringAsync(tmp, payload);
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    /* ignore */
  }
  await FileSystem.moveAsync({ from: tmp, to: path });
  return { path, byteSize: payload.length };
}

async function nativeDelete(userId: string, noteId: string): Promise<void> {
  const path = nativePath(userId, noteId);
  if (!path) return;
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    /* ignore */
  }
}

// ─── Web backend (OPFS preferred, IndexedDB fallback) ───────────────────────

// The path stored in `notes.strokes_file_path` on web is a logical handle.
// We don't resolve it back; readers always go through `readStrokesFile(userId,
// noteId)`. Kept stable so the value is recognizable in DevTools.
function webHandle(userId: string, noteId: string): string {
  return `web:Tarkeez/${userId}/strokes/${noteId}.json`;
}

type StorageManagerWithOpfs = {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

function getOpfsRoot(): Promise<FileSystemDirectoryHandle> | null {
  if (typeof navigator === "undefined") return null;
  const storage = navigator.storage as unknown as
    | StorageManagerWithOpfs
    | undefined;
  if (!storage?.getDirectory) return null;
  try {
    return storage.getDirectory();
  } catch {
    return null;
  }
}

let opfsAvailable: boolean | null = null;
async function probeOpfs(): Promise<boolean> {
  if (opfsAvailable !== null) return opfsAvailable;
  const root = getOpfsRoot();
  if (!root) {
    opfsAvailable = false;
    return false;
  }
  try {
    await root;
    opfsAvailable = true;
  } catch {
    opfsAvailable = false;
  }
  return opfsAvailable;
}

async function opfsStrokesDir(
  userId: string,
): Promise<FileSystemDirectoryHandle | null> {
  const rootPromise = getOpfsRoot();
  if (!rootPromise) return null;
  try {
    const root = await rootPromise;
    const tarkeez = await root.getDirectoryHandle("Tarkeez", { create: true });
    const userDir = await tarkeez.getDirectoryHandle(userId, { create: true });
    return await userDir.getDirectoryHandle("strokes", { create: true });
  } catch {
    return null;
  }
}

async function opfsRead(
  userId: string,
  noteId: string,
): Promise<Stroke[] | null> {
  const dir = await opfsStrokesDir(userId);
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(`${noteId}.json`, { create: false });
    const file = await handle.getFile();
    const raw = await file.text();
    const parsed = JSON.parse(raw) as Stroke[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function opfsWrite(
  userId: string,
  noteId: string,
  strokes: Stroke[],
): Promise<WriteResult | null> {
  const dir = await opfsStrokesDir(userId);
  if (!dir) return null;
  const payload = JSON.stringify(strokes);
  try {
    const handle = await dir.getFileHandle(`${noteId}.json`, { create: true });
    const writable = await handle.createWritable();
    await writable.write(payload);
    await writable.close();
    return { path: webHandle(userId, noteId), byteSize: payload.length };
  } catch {
    return null;
  }
}

async function opfsDelete(userId: string, noteId: string): Promise<void> {
  const dir = await opfsStrokesDir(userId);
  if (!dir) return;
  try {
    await dir.removeEntry(`${noteId}.json`);
  } catch {
    /* not found is fine */
  }
}

// IndexedDB fallback — used only when OPFS is unavailable.
const IDB_NAME = "tarkeez_strokes";
const IDB_STORE = "strokes";
const IDB_VERSION = 1;

function idbKey(userId: string, noteId: string): string {
  return `${userId}/${noteId}`;
}

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function idbRun<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openIdb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        const tx = db.transaction(IDB_STORE, mode);
        const store = tx.objectStore(IDB_STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      }),
  );
}

async function idbRead(
  userId: string,
  noteId: string,
): Promise<Stroke[] | null> {
  const raw = await idbRun<string | undefined>("readonly", (s) =>
    s.get(idbKey(userId, noteId)) as IDBRequest<string | undefined>,
  );
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Stroke[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function idbWrite(
  userId: string,
  noteId: string,
  strokes: Stroke[],
): Promise<WriteResult | null> {
  const payload = JSON.stringify(strokes);
  const ok = await idbRun<IDBValidKey>(
    "readwrite",
    (s) =>
      s.put(payload, idbKey(userId, noteId)) as IDBRequest<IDBValidKey>,
  );
  if (ok === null) return null;
  return { path: webHandle(userId, noteId), byteSize: payload.length };
}

async function idbDelete(userId: string, noteId: string): Promise<void> {
  await idbRun<undefined>(
    "readwrite",
    (s) => s.delete(idbKey(userId, noteId)) as IDBRequest<undefined>,
  );
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function strokesPath(userId: string, noteId: string): string | null {
  if (Platform.OS === "web") return webHandle(userId, noteId);
  return nativePath(userId, noteId);
}

export async function ensureStrokesDir(userId: string): Promise<void> {
  if (Platform.OS === "web") {
    // OPFS creates lazily on first write. Pre-touch the directory so a write
    // path failure surfaces earlier — but swallow if unsupported.
    if (await probeOpfs()) {
      await opfsStrokesDir(userId);
    }
    return;
  }
  await nativeEnsureDir(userId);
}

export async function readStrokesFile(
  userId: string,
  noteId: string,
): Promise<Stroke[] | null> {
  if (Platform.OS === "web") {
    if (await probeOpfs()) return opfsRead(userId, noteId);
    return idbRead(userId, noteId);
  }
  return nativeRead(userId, noteId);
}

export async function writeStrokesFile(
  userId: string,
  noteId: string,
  strokes: Stroke[],
): Promise<WriteResult | null> {
  if (Platform.OS === "web") {
    if (await probeOpfs()) return opfsWrite(userId, noteId, strokes);
    return idbWrite(userId, noteId, strokes);
  }
  return nativeWrite(userId, noteId, strokes);
}

export async function deleteStrokesFile(
  userId: string,
  noteId: string,
): Promise<void> {
  if (Platform.OS === "web") {
    if (await probeOpfs()) {
      await opfsDelete(userId, noteId);
      return;
    }
    await idbDelete(userId, noteId);
    return;
  }
  await nativeDelete(userId, noteId);
}
