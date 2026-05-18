jest.mock('@/db/client', () => {
  const { createTestDb } = require('../helpers/createTestDb');
  return createTestDb();
});

import { db, schema } from '@/db/client';
import {
  deleteSessionsByMaterialLocal,
  deleteSessionsByNoteLocal,
  insertPendingSessionLocal,
  upsertLocalPendingSessions,
  upsertSessionsFromServer,
} from '@/db/repositories/sessions';

const USER = 'user-1';
const MAT_ID = 'mat-1';
const NOTE_ID = 'note-1';

function makeSession(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: USER,
    materialId: MAT_ID as string | null,
    noteId: null as string | null,
    startedAt: 1_000_000,
    endedAt: 1_003_600,
    durationSec: 3600,
    pausedSec: 0,
    pagesRead: null,
    pageTimes: null,
    selections: null,
    wordsAdded: null,
    keystrokes: null,
    strokesAdded: null,
    createdAt: 1_000_000,
    ...overrides,
  };
}

beforeEach(async () => {
  await db!.delete(schema.studySessions);
});

describe('insertPendingSessionLocal', () => {
  it('inserts a row with syncStatus=pending_create', async () => {
    await insertPendingSessionLocal(makeSession('ss-1'));
    const rows = await db!
      .select({ syncStatus: schema.studySessions.syncStatus })
      .from(schema.studySessions);
    expect(rows[0].syncStatus).toBe('pending_create');
  });

  it('is idempotent — second call does not overwrite', async () => {
    await insertPendingSessionLocal(makeSession('ss-1'));
    await insertPendingSessionLocal(makeSession('ss-1', { durationSec: 9999 }));
    const rows = await db!.select().from(schema.studySessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].durationSec).toBe(3600);
  });
});

describe('upsertSessionsFromServer', () => {
  it('inserts a session with syncStatus=synced', async () => {
    await upsertSessionsFromServer([makeSession('ss-2', { pendingSync: false })]);
    const rows = await db!
      .select({ syncStatus: schema.studySessions.syncStatus })
      .from(schema.studySessions);
    expect(rows[0].syncStatus).toBe('synced');
  });
});

describe('deleteSessionsByMaterialLocal', () => {
  it('removes sessions for the given materialId and keeps others', async () => {
    await insertPendingSessionLocal(makeSession('ss-a', { materialId: MAT_ID, noteId: null }));
    await insertPendingSessionLocal(makeSession('ss-b', { materialId: MAT_ID, noteId: null }));
    await insertPendingSessionLocal(makeSession('ss-c', { materialId: 'mat-other', noteId: null }));
    await deleteSessionsByMaterialLocal(MAT_ID);
    const remaining = await db!.select().from(schema.studySessions);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('ss-c');
  });
});

describe('deleteSessionsByNoteLocal', () => {
  it('removes sessions for the given noteId and keeps others', async () => {
    await insertPendingSessionLocal(makeSession('ss-d', { materialId: null, noteId: NOTE_ID }));
    await insertPendingSessionLocal(makeSession('ss-e', { materialId: null, noteId: NOTE_ID }));
    await insertPendingSessionLocal(makeSession('ss-f', { materialId: null, noteId: 'note-other' }));
    await deleteSessionsByNoteLocal(NOTE_ID);
    const remaining = await db!.select().from(schema.studySessions);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('ss-f');
  });
});

describe('upsertLocalPendingSessions', () => {
  it('bulk-inserts multiple sessions', async () => {
    await upsertLocalPendingSessions([
      makeSession('ss-g'),
      makeSession('ss-h'),
      makeSession('ss-i'),
    ]);
    const rows = await db!.select().from(schema.studySessions);
    expect(rows).toHaveLength(3);
  });

  it('is idempotent for existing ids', async () => {
    await upsertLocalPendingSessions([makeSession('ss-j')]);
    await upsertLocalPendingSessions([makeSession('ss-j', { durationSec: 9999 })]);
    const rows = await db!.select().from(schema.studySessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].durationSec).toBe(3600);
  });
});
