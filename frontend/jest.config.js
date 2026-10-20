module.exports = {
  preset: 'jest-preset-angular',
  setupFiles: ['<rootDir>/src/jest-globals.ts'],
  // e2e/ — спеки Playwright (тот же суффикс *.spec.ts, но другой раннер).
  testPathIgnorePatterns: ['<rootDir>/e2e/'],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: '<rootDir>/test-results', outputName: 'junit.xml' }],
  ],
};
