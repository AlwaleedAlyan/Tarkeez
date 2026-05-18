jest.mock('@/db/client', () => {
  const { createTestDb } = require('../helpers/createTestDb');
  return createTestDb();
});

import { db, schema } from '@/db/client';
import {
  loadAnnotationsByMaterial,
  replaceAnnotationsForMaterial,
  upsertAnnotations,
} from '@/db/repositories/annotations';

const USER_A = 'user-a';
const USER_B = 'user-b';
const MAT_1 = 'mat-1';
const MAT_2 = 'mat-2';

beforeEach(async () => {
  await db!.delete(schema.annotations);
});

describe('loadAnnotationsByMaterial', () => {
  it('returns an empty object when no annotations exist', async () => {
    const result = await loadAnnotationsByMaterial(USER_A, MAT_1);
    expect(result).toEqual({});
  });

  it('returns a string-keyed map of page data', async () => {
    await upsertAnnotations([
      { userId: USER_A, materialId: MAT_1, pageNumber: 3, pageData: { color: 'yellow' } },
    ]);
    const result = await loadAnnotationsByMaterial(USER_A, MAT_1);
    expect(result['3']).toEqual({ color: 'yellow' });
  });

  it('keys are page-number strings, not numbers', async () => {
    await upsertAnnotations([
      { userId: USER_A, materialId: MAT_1, pageNumber: 7, pageData: { x: 1 } },
    ]);
    const result = await loadAnnotationsByMaterial(USER_A, MAT_1);
    expect(Object.keys(result)).toEqual(['7']);
  });

  it('isolates annotations by userId', async () => {
    await upsertAnnotations([
      { userId: USER_A, materialId: MAT_1, pageNumber: 1, pageData: { owner: 'A' } },
      { userId: USER_B, materialId: MAT_1, pageNumber: 1, pageData: { owner: 'B' } },
    ]);
    const resultA = await loadAnnotationsByMaterial(USER_A, MAT_1);
    const resultB = await loadAnnotationsByMaterial(USER_B, MAT_1);
    expect((resultA['1'] as { owner: string }).owner).toBe('A');
    expect((resultB['1'] as { owner: string }).owner).toBe('B');
  });
});

describe('upsertAnnotations', () => {
  it('inserts a new annotation row', async () => {
    await upsertAnnotations([
      { userId: USER_A, materialId: MAT_1, pageNumber: 5, pageData: { highlight: true } },
    ]);
    const result = await loadAnnotationsByMaterial(USER_A, MAT_1);
    expect(result['5']).toEqual({ highlight: true });
  });

  it('updates an existing row on (userId, materialId, pageNumber) conflict', async () => {
    await upsertAnnotations([
      { userId: USER_A, materialId: MAT_1, pageNumber: 2, pageData: { v: 1 } },
    ]);
    await upsertAnnotations([
      { userId: USER_A, materialId: MAT_1, pageNumber: 2, pageData: { v: 2 } },
    ]);
    const result = await loadAnnotationsByMaterial(USER_A, MAT_1);
    expect(result['2']).toEqual({ v: 2 });
    const all = await db!.select().from(schema.annotations);
    expect(all).toHaveLength(1);
  });
});

describe('replaceAnnotationsForMaterial', () => {
  it('deletes old pages and writes the new set', async () => {
    await upsertAnnotations([
      { userId: USER_A, materialId: MAT_1, pageNumber: 1, pageData: { old: true } },
      { userId: USER_A, materialId: MAT_1, pageNumber: 2, pageData: { old: true } },
    ]);
    await replaceAnnotationsForMaterial(USER_A, MAT_1, { '10': { new: true } });
    const result = await loadAnnotationsByMaterial(USER_A, MAT_1);
    expect(Object.keys(result)).toEqual(['10']);
    expect(result['10']).toEqual({ new: true });
  });

  it('deletes all rows when given an empty map', async () => {
    await upsertAnnotations([
      { userId: USER_A, materialId: MAT_1, pageNumber: 1, pageData: {} },
    ]);
    await replaceAnnotationsForMaterial(USER_A, MAT_1, {});
    expect(await loadAnnotationsByMaterial(USER_A, MAT_1)).toEqual({});
  });

  it('does not touch annotations for other materials', async () => {
    await upsertAnnotations([
      { userId: USER_A, materialId: MAT_2, pageNumber: 9, pageData: { keep: true } },
    ]);
    await replaceAnnotationsForMaterial(USER_A, MAT_1, {});
    const otherResult = await loadAnnotationsByMaterial(USER_A, MAT_2);
    expect(otherResult['9']).toEqual({ keep: true });
  });
});
