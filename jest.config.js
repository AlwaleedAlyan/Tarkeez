/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  testMatch: [
    '**/db/__tests__/**/*.test.ts',
    '**/features/**/__tests__/**/*.test.ts',
    '**/lib/__tests__/**/*.test.ts',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/db/__tests__/helpers/setup.ts'],
};
