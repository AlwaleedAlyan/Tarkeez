// Silence native-only modules that would crash in the Node.js test environment.
// Repository tests mock @/db/client individually; these mocks only prevent
// import-time crashes from modules that are transitively required.

jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('drizzle-orm/expo-sqlite/query', () => ({
  useLiveQuery: jest.fn(() => ({ data: [] })),
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));
jest.mock('@react-native-community/netinfo', () => ({
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));
jest.mock('@/lib/api', () => ({ api: jest.fn() }));
jest.mock('@/db/strokesStore', () => ({
  readStrokesFile: jest.fn().mockResolvedValue(null),
  writeStrokesFile: jest.fn().mockResolvedValue({ path: '/mock', byteSize: 0 }),
  deleteStrokesFile: jest.fn().mockResolvedValue(undefined),
  strokesPath: jest.fn().mockReturnValue('/mock/path'),
  ensureStrokesDir: jest.fn().mockResolvedValue(undefined),
}));
