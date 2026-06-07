import { AppState, type AppStateStatus, Platform } from "react-native";

import { db } from "@/db/client";
import { pullCMRows } from "@/db/repositories/collectionMaterials";
import { pullCollections } from "@/db/repositories/collections";
import { pullMaterials } from "@/db/repositories/materials";
import { setMeta } from "@/db/repositories/meta";
import { pullNotes } from "@/db/repositories/notes";
import { pullSessions } from "@/db/repositories/sessions";
import { logRejection } from "@/lib/logRejection";

const HEARTBEAT_MS = 60_000;

let pulling = false;
let activeUserId: string | null = null;

export async function pullAll(userId: string): Promise<void> {
  if (!db) return;
  if (pulling) return;
  pulling = true;
  try {
    const errors: unknown[] = [];
    for (const fn of [
      pullMaterials,
      pullCollections,
      pullCMRows,
      pullNotes,
      pullSessions,
    ]) {
      try {
        await fn(userId);
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length === 0) {
      try {
        await setMeta("last_pulled_at", String(Date.now()));
      } catch {
        /* best effort */
      }
    } else {
      // Route each error through logRejection so offline failures stay quiet
      // while genuine schema/server errors still surface as console.error.
      for (const e of errors) logRejection("pull", e);
    }
  } finally {
    pulling = false;
  }
}

type NetInfoUnsub = () => void;

let appStateSub: { remove: () => void } | null = null;
let netInfoUnsub: NetInfoUnsub | null = null;
let heartbeatId: ReturnType<typeof setInterval> | null = null;
let lastConnected: boolean | null = null;

async function subscribeNetInfo(): Promise<NetInfoUnsub | null> {
  if (Platform.OS === "web") return null;
  try {
    const mod = await import("@react-native-community/netinfo");
    const NetInfo = mod.default;
    return NetInfo.addEventListener((s) => {
      const connected = s.isConnected === true;
      if (lastConnected === false && connected && activeUserId) {
        void pullAll(activeUserId).catch((e) =>
          logRejection("pull:netinfo", e),
        );
      }
      lastConnected = connected;
    });
  } catch {
    return null;
  }
}

export function startPull(userId: string): void {
  if (!db) return;
  if (appStateSub || netInfoUnsub || heartbeatId) stopPull();
  activeUserId = userId;
  appStateSub = AppState.addEventListener(
    "change",
    (state: AppStateStatus) => {
      if (state === "active" && activeUserId) {
        void pullAll(activeUserId).catch((e) =>
          logRejection("pull:foreground", e),
        );
      }
    },
  );
  void subscribeNetInfo()
    .then((unsub) => {
      netInfoUnsub = unsub;
    })
    .catch((e) => logRejection("pull-netinfo-subscribe", e));
  heartbeatId = setInterval(() => {
    if (activeUserId) {
      void pullAll(activeUserId).catch((e) =>
        logRejection("pull:heartbeat", e),
      );
    }
  }, HEARTBEAT_MS);
  void pullAll(userId).catch((e) => logRejection("pull:boot", e));
}

export function stopPull(): void {
  appStateSub?.remove();
  netInfoUnsub?.();
  if (heartbeatId) clearInterval(heartbeatId);
  appStateSub = null;
  netInfoUnsub = null;
  heartbeatId = null;
  lastConnected = null;
  activeUserId = null;
}
