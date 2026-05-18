jest.mock('@/db/client', () => {
  const { createTestDb } = require('../helpers/createTestDb');
  return createTestDb();
});

// After the mock is registered, this import resolves to the mocked values.
import { db, schema } from '@/db/client';
import { getMeta, setMeta } from '@/db/repositories/meta';

beforeEach(async () => {
  await db!.delete(schema.meta);
});

describe('getMeta', () => {
  it('returns null for a missing key', async () => {
    expect(await getMeta('nonexistent')).toBeNull();
  });

  it('returns the stored value after setMeta', async () => {
    await setMeta('theme', 'dark');
    expect(await getMeta('theme')).toBe('dark');
  });
});

describe('setMeta', () => {
  it('inserts a new key–value pair', async () => {
    await setMeta('last_pulled_at', '1234567890');
    const rows = await db!.select().from(schema.meta);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('last_pulled_at');
    expect(rows[0].value).toBe('1234567890');
  });

  it('overwrites an existing key with the new value', async () => {
    await setMeta('foo', 'first');
    await setMeta('foo', 'second');
    expect(await getMeta('foo')).toBe('second');
    const rows = await db!.select().from(schema.meta);
    expect(rows).toHaveLength(1);
  });
});
