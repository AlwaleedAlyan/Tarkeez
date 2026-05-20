/**
 * Tests for db/sync.ts — the outbox push engine.
 *
 * Design note: `enqueue()` fires `void drain()` as a side effect, which starts
 * drain asynchronously. To avoid the race condition where the test's `await
 * drain()` returns early because `draining = true`, the drain tests insert
 * outbox rows directly via `db!.insert()` and then call `await drain()`
 * explicitly. The enqueue-specific tests verify the row is inserted correctly.
 */

jest.mock('@/db/client', () => {
  const { createTestDb } = require('./helpers/createTestDb');
  return createTestDb();
});

import { db, schema } from '@/db/client';
import {
  _nextDelay,
  _resetForTest,
  drain,
  enqueue,
  enqueueOutboxIfNoPending,
  registerHandler,
} from '@/db/sync';

function insertOutboxRow(overrides: Partial<typeof schema.syncOutbox.$inferInsert> = {}) {
  const now = Date.now();
  return db!.insert(schema.syncOutbox).values({
    id: `ob_test_${Math.random().toString(36).slice(2)}`,
    tableName: 'notes',
    rowId: 'row-1',
    operation: 'create',
    payloadJson: '{}',
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    ...overrides,
  });
}

beforeEach(async () => {
  _resetForTest();
  await db!.delete(schema.syncOutbox);
});

// ─── _nextDelay (backoff schedule) ──────────────────────────────────────────

describe('_nextDelay (backoff schedule)', () => {
  it('attempt 0 → 1 000 ms', () => expect(_nextDelay(0)).toBe(1_000));
  it('attempt 1 → 2 000 ms', () => expect(_nextDelay(1)).toBe(2_000));
  it('attempt 2 → 4 000 ms', () => expect(_nextDelay(2)).toBe(4_000));
  it('attempt 3 → 16 000 ms', () => expect(_nextDelay(3)).toBe(16_000));
  it('attempt 4 → 300 000 ms', () => expect(_nextDelay(4)).toBe(300_000));
  it('attempt 99 → capped at 300 000 ms', () => expect(_nextDelay(99)).toBe(300_000));
});

// ─── enqueue ─────────────────────────────────────────────────────────────────

describe('enqueue', () => {
  it('inserts a row with correct tableName, rowId, operation, and payload', async () => {
    await enqueue('materials', 'mat-1', 'create', { title: 'Test' });
    // Give the auto-triggered drain() time to complete (it has no handler, so
    // it bumps attempts and stops). The row should still exist.
    await new Promise<void>((r) => setTimeout(r, 20));
    const rows = await db!.select().from(schema.syncOutbox);
    expect(rows).toHaveLength(1);
    expect(rows[0].tableName).toBe('materials');
    expect(rows[0].rowId).toBe('mat-1');
    expect(rows[0].operation).toBe('create');
    expect(JSON.parse(rows[0].payloadJson)).toEqual({ title: 'Test' });
  });
});

// ─── drain ───────────────────────────────────────────────────────────────────

describe('drain', () => {
  it('calls the registered handler with the correct rowId and parsed payload', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    registerHandler('notes', 'create', handler);
    await insertOutboxRow({
      tableName: 'notes',
      rowId: 'note-1',
      operation: 'create',
      payloadJson: JSON.stringify({ title: 'Hello' }),
    });
    await drain();
    expect(handler).toHaveBeenCalledWith('note-1', { title: 'Hello' });
  });

  it('deletes the outbox row after a successful handler', async () => {
    registerHandler('notes', 'update', jest.fn().mockResolvedValue(undefined));
    await insertOutboxRow({ tableName: 'notes', rowId: 'note-2', operation: 'update' });
    await drain();
    const rows = await db!.select().from(schema.syncOutbox);
    expect(rows).toHaveLength(0);
  });

  it('increments attempts and sets backoff on handler failure', async () => {
    registerHandler('notes', 'delete', jest.fn().mockRejectedValue(new Error('net error')));
    const before = Date.now();
    await insertOutboxRow({ tableName: 'notes', rowId: 'note-3', operation: 'delete' });
    await drain();
    const rows = await db!.select().from(schema.syncOutbox);
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].nextAttemptAt).toBeGreaterThan(before + 500);
    expect(rows[0].lastError).toMatch(/net error/);
  });

  it('skips a row whose nextAttemptAt is in the future', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    registerHandler('materials', 'update', handler);
    await insertOutboxRow({
      tableName: 'materials',
      rowId: 'mat-x',
      operation: 'update',
      nextAttemptAt: Date.now() + 999_999,
    });
    await drain();
    expect(handler).not.toHaveBeenCalled();
  });

  it('records a "no handler" error when no handler is registered', async () => {
    await insertOutboxRow({ tableName: 'unknown_table', operation: 'delete' });
    await drain();
    const rows = await db!.select().from(schema.syncOutbox);
    expect(rows[0].lastError).toMatch(/no handler/);
    expect(rows[0].attempts).toBe(1);
  });

  it('processes two ready rows sequentially, delivering each payload', async () => {
    const received: Array<{ rowId: string; payload: unknown }> = [];
    registerHandler('sessions', 'create', async (rowId, payload) => {
      received.push({ rowId, payload });
    });
    const now = Date.now();
    await db!.insert(schema.syncOutbox).values([
      { id: 'ob_first', tableName: 'sessions', rowId: 'first', operation: 'create', payloadJson: '{"n":1}', attempts: 0, nextAttemptAt: now - 2, createdAt: now },
      { id: 'ob_second', tableName: 'sessions', rowId: 'second', operation: 'create', payloadJson: '{"n":2}', attempts: 0, nextAttemptAt: now - 1, createdAt: now },
    ]);
    await drain();
    expect(received).toEqual([
      { rowId: 'first', payload: { n: 1 } },
      { rowId: 'second', payload: { n: 2 } },
    ]);
  });
});

// ─── enqueueOutboxIfNoPending ─────────────────────────────────────────────────

describe('enqueueOutboxIfNoPending', () => {
  it('inserts a row when none exists for (tableName, rowId, op)', async () => {
    await enqueueOutboxIfNoPending('notes', 'note-10', 'update', { v: 1 });
    await new Promise<void>((r) => setTimeout(r, 20)); // let auto-drain settle
    const rows = await db!.select().from(schema.syncOutbox);
    expect(rows).toHaveLength(1);
  });

  it('skips the insert when a matching pending row already exists', async () => {
    await enqueueOutboxIfNoPending('notes', 'note-11', 'update', { v: 1 });
    await new Promise<void>((r) => setTimeout(r, 20));
    await enqueueOutboxIfNoPending('notes', 'note-11', 'update', { v: 2 });
    await new Promise<void>((r) => setTimeout(r, 20));
    const rows = await db!.select().from(schema.syncOutbox);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].payloadJson)).toEqual({ v: 1 });
  });

  it('does NOT deduplicate across different operations', async () => {
    await enqueueOutboxIfNoPending('notes', 'note-12', 'update', {});
    await enqueueOutboxIfNoPending('notes', 'note-12', 'delete', {});
    await new Promise<void>((r) => setTimeout(r, 20));
    const rows = await db!.select().from(schema.syncOutbox);
    expect(rows).toHaveLength(2);
  });

  it('does NOT deduplicate across different rowIds', async () => {
    await enqueueOutboxIfNoPending('notes', 'note-13', 'update', {});
    await enqueueOutboxIfNoPending('notes', 'note-14', 'update', {});
    await new Promise<void>((r) => setTimeout(r, 20));
    const rows = await db!.select().from(schema.syncOutbox);
    expect(rows).toHaveLength(2);
  });
});
