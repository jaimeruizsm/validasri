import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * La lista de builtins de Vite todavia no incluye `node:sqlite`, asi que hay que
 * marcarlo como externo explicitamente para que no intente resolverlo como paquete.
 */
const externalizeNodeSqlite = {
  name: 'externalize-node-sqlite',
  enforce: 'pre' as const,
  resolveId(id: string) {
    // Vite quita el prefijo `node:` antes de contrastar contra su lista de
    // builtins, por lo que hay que interceptar las dos formas.
    if (id === 'node:sqlite' || id === 'sqlite') {
      return { id: 'node:sqlite', external: true as const };
    }
    return null;
  },
};

export default defineConfig({
  plugins: [externalizeNodeSqlite],
  resolve: {
    alias: {
      '@validasri/shared': resolvePath('./packages/shared/src/index.ts'),
      '@validasri/validation': resolvePath('./packages/validation/src/index.ts'),
      '@validasri/sri-client': resolvePath('./packages/sri-client/src/index.ts'),
      '@validasri/database': resolvePath('./packages/database/src/index.ts'),
      '@validasri/export': resolvePath('./packages/export/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/tests/**/*.test.ts', 'apps/worker/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
    },
  },
});
