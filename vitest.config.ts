import { defineConfig } from 'vitest/config';

// "uio-source": workspace packages resolve to TypeScript source, so a fresh clone needs no build.
export default defineConfig({
  ssr: { resolve: { conditions: ['uio-source'] } },
  test: {
    environment: 'node',
    projects: [
      { extends: true, test: { name: 'engine', root: 'packages/engine' } },
      {
        extends: true,
        test: {
          name: 'mcp',
          root: 'packages/mcp',
          globalSetup: ['./src/testing/global-setup.ts'],
        },
      },
      { extends: true, test: { name: 'web', root: 'packages/web' } },
      { extends: true, test: { name: 'tools', root: 'tools', include: ['*/src/**/*.test.ts'] } },
    ],
  },
});
