module.exports = {
  preset: 'jest-preset-angular',
  setupFiles: ['<rootDir>/src/jest-globals.ts'],
  // e2e/ — спеки Playwright (тот же суффикс *.spec.ts, но другой раннер).
  testPathIgnorePatterns: ['<rootDir>/e2e/'],
  // Сгенерированный SDK (backend/test/generated/client) импортирует соседние
  // файлы в ESM-стиле './foo.js' — мапим на безрасширений путь для jest-resolve.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: '<rootDir>/test-results', outputName: 'junit.xml' }],
  ],
};
