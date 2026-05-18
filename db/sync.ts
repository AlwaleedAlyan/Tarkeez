import { and, asc, eq, lte } from "drizzle-orm";
import { AppState, type AppStateStatus, Platform } from "react-native";

import { db, schema } from "@/db/client";

export type OutboxOp = "create" | "update" | "delete";
export type OutboxHandler = (rowId: string, payload: unknown) => Promise<void>;
type HandlerKey = `${string}:${OutboxOp}`;

const HANDLERS = new Map<HandlerKey, OutboxHandler>();

export function registerHandler(
  tableName: string,
  operation: OutboxOp,
  fn: OutboxHandler,
): void {
  HANDLERS.set(`${tableName}:${operation}`, fn);
}

const BACKOFF_MS = [1_000, 2_000, 4_000, 16_000, 300_000] as const;
function nextDelay(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 300_000;
}

function genOutboxId(): string {
  return `ob_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export async function enqueue(
  tableName: string,
  rowId: string,
  operation: OutboxOp,
  payload: unknown,
): Promise<void> {
  if (!db) return;
  const now = Date.now();
  await db.insert(schema.syncOutbox).values({
    id: genOutboxId(),
    tableName,
    rowId,
    operation,
    payloadJson: JSON.stringify(payload),
    attempts: 0,
    lastError: null,
    nextAttemptAt: now,
    createdAt: now,
  });
  void drain();
}

// Like enqueue(), but skips the insert if an outbox row already exists for
// the same (tableName, rowId, operation). Used by debounced producers
// (e.g. the strokes pipeline) where one queued row already covers any
// subsequent local edits — the handler reads current state at send time.
export async function enqueueOutboxIfNoPending(
  tableName: string,
  rowId: string,
  operation: OutboxOp,
  payload: unknown,
): Promise<void> {
  if (!db) return;
  const existing = await db
    .select({ id: schema.syncOutbox.id })
    .from(schema.syncOutbox)
    .where(
      and(
        eq(schema.syncOutbox.tableName, tableName),
        eq(schema.syncOutbox.rowId, rowId),
        eq(schema.syncOutbox.operation, operation),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    void drain();
    return;
  }
  await enqueue(tableName, rowId, operation, payload);
}

let draining = false;

export async function drain(): Promise<void> {
  if (!db || draining) return;
  draining = true;
  try {
    while (true) {
      const now = Date.now();
      const ready = await db
        .select()
        .from(schema.syncOutbox)
        .where(lte(schema.syncOutbox.nextAttemptAt, now))
        .orderBy(asc(schema.syncOutbox.nextAttemptAt))
        .limit(1);
      if (ready.length === 0) break;
      const row = ready[0];
      const handler = HANDLERS.get(
        `${row.tableName}:${row.operation as OutboxOp}`,
      );
      if (!handler) {
        const attempts = row.attempts + 1;
        await db
          .update(schema.syncOutbox)
          .set({
            attempts,
            lastError: `no handler for ${row.tableName}:${row.operation}`,
            nextAttemptAt: now + nextDelay(attempts),
          })
          .where(eq(schema.syncOutbox.id, row.id));
        break;
      }
      try {
        const payload: unknown = JSON.parse(row.payloadJson);
        await handler(row.rowId, payload);
        await db
          .delete(schema.syncOutbox)
          .where(eq(schema.syncOutbox.id, row.id));
      } catch (err) {
        const attempts = row.attempts + 1;
        const msg = err instanceof Error ? err.message : String(err);
        await db
          .update(schema.syncOutbox)
          .set({
            attempts,
            lastError: msg,
            nextAttemptAt: now + nextDelay(attempts),
          })
          .where(eq(schema.syncOutbox.id, row.id));
        break;
      }
    }
  } finally {
    draining = false;
  }
}

type NetInfoUnsub = () => void;

let appStateSub: { remove: () => void } | null = null;
let netInfoUnsub: NetInfoUnsub | null = null;
let heartbeatId: ReturnType<typeof setInterval> | null = null;
let lastConnected: boolean | null = null;
const HEARTBEAT_MS = 30_000;

async function subscribeNetInfo(): Promise<NetInfoUnsub | null> {
  if (Platform.OS === "web") return null;
  try {
    const mod = await import("@react-native-community/netinfo");
    const NetInfo = mod.default;
    const unsub = NetInfo.addEventListener((s) => {
      const connected = s.isConnected === true;
      if (lastConnected === false && connected) void drain();
      lastConnected = connected;
    });
    return unsub;
  } catch {
    return null;
  }
}

export function start(): void {
  if (!db) return;
  if (appStateSub || netInfoUnsub || heartbeatId) return;
  appStateSub = AppState.addEventListener(
    "change",
    (state: AppStateStatus) => {
      if (state === "active") void drain();
    },
  );
  void subscribeNetInfo().then((unsub) => {
    netInfoUnsub = unsub;
  });
  heartbeatId = setInterval(() => void drain(), HEARTBEAT_MS);
  void drain();
}

export function stop(): void {
  appStateSub?.remove();
  netInfoUnsub?.();
  if (heartbeatId) clearInterval(heartbeatId);
  appStateSub = null;
  netInfoUnsub = null;
  heartbeatId = null;
  lastConnected = null;
}
