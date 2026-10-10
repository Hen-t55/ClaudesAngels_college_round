import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/sidepanel/ui/**/*.test.tsx', 'src/sidepanel/ui/**/*.test.ts'],
  },
});
