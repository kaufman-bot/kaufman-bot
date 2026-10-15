module.exports = {
  preset: 'jest-preset-angular',
  setupFiles: ['<rootDir>/src/jest-globals.ts'],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: '<rootDir>/test-results', outputName: 'junit.xml' }],
  ],
};
