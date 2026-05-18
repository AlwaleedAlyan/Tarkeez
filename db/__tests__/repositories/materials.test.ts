jest.mock('@/db/client', () => {
  const { createTestDb } = require('../helpers/createTestDb');
  return createTestDb();
});

import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import {
  getMaterialLocal,
  insertPendingMaterialLocal,
  markMaterialSyncStatusLocal,
  softDeleteMaterialLocal,
  tombstoneMissingMaterials,
  updateMaterialLocalPending,
  upsertMaterialsFromServer,
} from '@/db/repositories/materials';

const USER = 'user-1';

const BASE_MAT = {
  id: 'mat-1',
  userId: USER,
  title: 'Test PDF',
  fileName: 'test.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  totalPages: 10,
  currentPage: 1,
  localFilePath: '/local/test.pdf',
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
};

const SERVER_MAT = {
  id: BASE_MAT.id,
  userId: USER,
  title: BASE_MAT.title,
  fileName: BASE_MAT.fileName,
  mimeType: BASE_MAT.mimeType,
  sizeBytes: BASE_MAT.sizeBytes,
  totalPages: BASE_MAT.totalPages,
  currentPage: BASE_MAT.currentPage,
  createdAt: BASE_MAT.createdAt,
  updatedAt: BASE_MAT.updatedAt,
};

beforeEach(async () => {
  await db!.delete(schema.materials);
  await db!.delete(schema.collectionMaterials);
});

describe('insertPendingMaterialLocal', () => {
  it('inserts a row with syncStatus=pending_create', async () => {
    await insertPendingMaterialLocal(BASE_MAT);
    const rows = await db!
      .select({ syncStatus: schema.materials.syncStatus })
      .from(schema.materials)
      .where(eq(schema.materials.id, BASE_MAT.id));
    expect(rows[0].syncStatus).toBe('pending_create');
  });

  it('is idempotent — second call does not overwrite', async () => {
    await insertPendingMaterialLocal(BASE_MAT);
    await insertPendingMaterialLocal({ ...BASE_MAT, title: 'Other' });
    const row = await getMaterialLocal(BASE_MAT.id);
    expect(row?.title).toBe('Test PDF');
  });
});

describe('upsertMaterialsFromServer', () => {
  it('inserts an unknown row with syncStatus=synced', async () => {
    await upsertMaterialsFromServer([SERVER_MAT]);
    const rows = await db!
      .select({ syncStatus: schema.materials.syncStatus })
      .from(schema.materials)
      .where(eq(schema.materials.id, BASE_MAT.id));
    expect(rows[0].syncStatus).toBe('synced');
  });

  it('skips overwriting a pending_create row (LWW guard)', async () => {
    await insertPendingMaterialLocal(BASE_MAT);
    await upsertMaterialsFromServer([{ ...SERVER_MAT, title: 'Server Title' }]);
    const row = await getMaterialLocal(BASE_MAT.id);
    expect(row?.title).toBe('Test PDF');
    const rows = await db!
      .select({ syncStatus: schema.materials.syncStatus })
      .from(schema.materials)
      .where(eq(schema.materials.id, BASE_MAT.id));
    expect(rows[0].syncStatus).toBe('pending_create');
  });
});

describe('updateMaterialLocalPending', () => {
  it('changes syncStatus to pending_update', async () => {
    await insertPendingMaterialLocal(BASE_MAT);
    await markMaterialSyncStatusLocal(BASE_MAT.id, 'synced');
    await updateMaterialLocalPending({ id: BASE_MAT.id, title: 'New Title', updatedAt: 2_000_000 });
    const row = await getMaterialLocal(BASE_MAT.id);
    expect(row?.title).toBe('New Title');
    const rows = await db!
      .select({ syncStatus: schema.materials.syncStatus })
      .from(schema.materials)
      .where(eq(schema.materials.id, BASE_MAT.id));
    expect(rows[0].syncStatus).toBe('pending_update');
  });
});

describe('softDeleteMaterialLocal', () => {
  it('sets deletedAt and syncStatus=pending_delete', async () => {
    await insertPendingMaterialLocal(BASE_MAT);
    await softDeleteMaterialLocal(BASE_MAT.id);
    const rows = await db!
      .select({ deletedAt: schema.materials.deletedAt, syncStatus: schema.materials.syncStatus })
      .from(schema.materials)
      .where(eq(schema.materials.id, BASE_MAT.id));
    expect(rows[0].deletedAt).not.toBeNull();
    expect(rows[0].syncStatus).toBe('pending_delete');
  });
});

describe('markMaterialSyncStatusLocal', () => {
  it('sets syncStatus to the given value', async () => {
    await insertPendingMaterialLocal(BASE_MAT);
    await markMaterialSyncStatusLocal(BASE_MAT.id, 'synced');
    const rows = await db!
      .select({ syncStatus: schema.materials.syncStatus })
      .from(schema.materials)
      .where(eq(schema.materials.id, BASE_MAT.id));
    expect(rows[0].syncStatus).toBe('synced');
  });
});

describe('tombstoneMissingMaterials', () => {
  it('hard-deletes a synced row absent from the server set', async () => {
    await upsertMaterialsFromServer([SERVER_MAT]);
    await tombstoneMissingMaterials(USER, new Set());
    const rows = await db!
      .select()
      .from(schema.materials)
      .where(eq(schema.materials.id, BASE_MAT.id));
    expect(rows).toHaveLength(0);
  });

  it('does NOT delete a pending_create row', async () => {
    await insertPendingMaterialLocal(BASE_MAT);
    await tombstoneMissingMaterials(USER, new Set());
    const rows = await db!
      .select()
      .from(schema.materials)
      .where(eq(schema.materials.id, BASE_MAT.id));
    expect(rows).toHaveLength(1);
  });

  it('keeps rows that are present in the server set', async () => {
    await upsertMaterialsFromServer([SERVER_MAT]);
    await tombstoneMissingMaterials(USER, new Set([BASE_MAT.id]));
    const rows = await db!
      .select()
      .from(schema.materials)
      .where(eq(schema.materials.id, BASE_MAT.id));
    expect(rows).toHaveLength(1);
  });
});
