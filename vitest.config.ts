import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run in Node — no DOM, no WebGL. Compiler.ts is pure TS logic.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
