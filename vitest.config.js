import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'jsdom', clearMocks: true, exclude: ['node_modules/**', 'playwright/**'] },
});
