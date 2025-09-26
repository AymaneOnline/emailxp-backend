module.exports = {
  testEnvironment: 'node',
  transformIgnorePatterns: [
    '/node_modules/(?!uuid/)' // allow uuid ESM to be transformed by Jest default
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  // Support both /tests/ and /__tests__/ patterns
  testMatch: ['**/tests/**/*.test.js', '**/__tests__/**/*.test.js']
};
