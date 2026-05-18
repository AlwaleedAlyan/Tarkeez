jest.mock('@/db/client', () => {
  const { createTestDb } = require('../helpers/createTestDb');
  return createTestDb();
});

import { and, eq, ne } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import {
  findNotesWithDirtyStrokes,
  getNoteStrokesManifest,
  insertPendingNoteLocal,
  setNoteStrokesManifest,
  softDeleteNoteLocal,
  tombstoneMissingNotes,
} from '@/db/repositories/notes';

const USER = 'user-1';

const BASE_NOTE = {
  id: 'note-1',
  userId: USER,
  title: 'My Note',
  contentHtml: '<p>hello</p>',
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
};

beforeEach(async () => {
  await db!.delete(schema.notes);
  await db!.delete(schema.collectionMaterials);
});

describe('insertPendingNoteLocal', () => {
  it('inserts a row with syncStatus=pending_create', async () => {
    await insertPendingNoteLocal(BASE_NOTE);
    const rows = await db!
      .select({ syncStatus: schema.notes.syncStatus })
      .from(schema.notes);
    expect(rows[0].syncStatus).toBe('pending_create');
  });

  it('is idempotent — second call does not overwrite', async () => {
    await insertPendingNoteLocal(BASE_NOTE);
    await insertPendingNoteLocal({ ...BASE_NOTE, title: 'Different' });
    const rows = await db!.select({ title: schema.notes.title }).from(schema.notes);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('My Note');
  });
});

describe('setNoteStrokesManifest / getNoteStrokesManifest', () => {
  it('stores and retrieves the strokes manifest', async () => {
    await insertPendingNoteLocal(BASE_NOTE);
    await setNoteStrokesManifest(BASE_NOTE.id, {
      strokesFilePath: '/path/to/strokes.json',
      strokesByteSize: 512,
      strokesDirtyAt: 9_999_999,
    });
    const manifest = await getNoteStrokesManifest(BASE_NOTE.id);
    expect(manifest?.strokesFilePath).toBe('/path/to/strokes.json');
    expect(manifest?.strokesByteSize).toBe(512);
    expect(manifest?.strokesDirtyAt).toBe(9_999_999);
  });

  it('returns null for a non-existent noteId', async () => {
    expect(await getNoteStrokesManifest('no-such-note')).toBeNull();
  });
});

/**
 * markStrokesServerSyncedLocal uses db.transaction(async tx => {...}).
 * better-sqlite3 does not support async transaction callbacks, so the function
 * cannot be called directly in this test environment. These tests verify the
 * same CAS SQL conditions by running the equivalent UPDATE statements directly,
 * which is what the function executes inside its transaction.
 */
describe('markStrokesServerSyncedLocal — CAS SQL semantics', () => {
  it('clears strokesDirtyAt when the update condition matches (CAS success)', async () => {
    await insertPendingNoteLocal(BASE_NOTE);
    const dirtyAt = 5_000;
    await setNoteStrokesManifest(BASE_NOTE.id, {
      strokesFilePath: '/p',
      strokesByteSize: 0,
      strokesDirtyAt: dirtyAt,
    });
    const syncedAt = Date.now();
    // Replicate the first UPDATE inside markStrokesServerSyncedLocal
    await db!
      .update(schema.notes)
      .set({ strokesServerSyncedAt: syncedAt, strokesDirtyAt: null })
      .where(and(eq(schema.notes.id, BASE_NOTE.id), eq(schema.notes.strokesDirtyAt, dirtyAt)));
    const manifest = await getNoteStrokesManifest(BASE_NOTE.id);
    expect(manifest?.strokesDirtyAt).toBeNull();
  });

  it('leaves strokesDirtyAt unchanged when the condition does not match (CAS miss)', async () => {
    await insertPendingNoteLocal(BASE_NOTE);
    const realDirtyAt = 5_000;
    await setNoteStrokesManifest(BASE_NOTE.id, {
      strokesFilePath: '/p',
      strokesByteSize: 0,
      strokesDirtyAt: realDirtyAt,
    });
    const wrongExpected = 9_999;
    // First UPDATE (clears dirty) only fires when dirty matches; with wrong value it matches nothing
    await db!
      .update(schema.notes)
      .set({ strokesServerSyncedAt: Date.now(), strokesDirtyAt: null })
      .where(and(eq(schema.notes.id, BASE_NOTE.id), eq(schema.notes.strokesDirtyAt, wrongExpected)));
    const manifest = await getNoteStrokesManifest(BASE_NOTE.id);
    expect(manifest?.strokesDirtyAt).toBe(realDirtyAt);
  });
});

describe('findNotesWithDirtyStrokes', () => {
  it('returns only notes that have strokesDirtyAt set', async () => {
    const note2 = { ...BASE_NOTE, id: 'note-2' };
    await insertPendingNoteLocal(BASE_NOTE);
    await insertPendingNoteLocal(note2);
    await setNoteStrokesManifest(BASE_NOTE.id, {
      strokesFilePath: '/p',
      strokesByteSize: 0,
      strokesDirtyAt: 1_234,
    });
    const dirty = await findNotesWithDirtyStrokes(USER);
    expect(dirty).toHaveLength(1);
    expect(dirty[0].id).toBe(BASE_NOTE.id);
    expect(dirty[0].strokesDirtyAt).toBe(1_234);
  });

  it('returns an empty array when nothing is dirty', async () => {
    await insertPendingNoteLocal(BASE_NOTE);
    expect(await findNotesWithDirtyStrokes(USER)).toHaveLength(0);
  });
});

describe('softDeleteNoteLocal', () => {
  it('sets deletedAt and syncStatus=pending_delete', async () => {
    await insertPendingNoteLocal(BASE_NOTE);
    await softDeleteNoteLocal(BASE_NOTE.id);
    const rows = await db!
      .select({ deletedAt: schema.notes.deletedAt, syncStatus: schema.notes.syncStatus })
      .from(schema.notes);
    expect(rows[0].deletedAt).not.toBeNull();
    expect(rows[0].syncStatus).toBe('pending_delete');
  });
});

describe('tombstoneMissingNotes', () => {
  it('hard-deletes a synced note absent from the server set', async () => {
    await db!.insert(schema.notes).values({
      id: BASE_NOTE.id,
      userId: USER,
      title: BASE_NOTE.title,
      contentHtml: BASE_NOTE.contentHtml,
      strokesByteSize: 0,
      createdAt: BASE_NOTE.createdAt,
      updatedAt: BASE_NOTE.updatedAt,
      syncStatus: 'synced',
    });
    await tombstoneMissingNotes(USER, new Set());
    const rows = await db!.select().from(schema.notes);
    expect(rows).toHaveLength(0);
  });

  it('does NOT delete a pending_create note', async () => {
    await insertPendingNoteLocal(BASE_NOTE);
    await tombstoneMissingNotes(USER, new Set());
    const rows = await db!.select().from(schema.notes);
    expect(rows).toHaveLength(1);
  });
});
