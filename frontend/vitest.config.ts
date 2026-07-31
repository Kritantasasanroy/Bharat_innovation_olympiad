import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Frontend unit tests.
 *
 * Scoped deliberately to pure logic and small components. The pages themselves
 * are covered by `next build` (which type-checks and server-renders every route)
 * and by the end-to-end pass — mounting a page that opens a webcam, a socket and
 * face-api.js under jsdom would test the mocks, not the product.
 */
export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
    resolve: {
        // Mirrors the `@/*` path alias in tsconfig.json.
        alias: { '@': path.resolve(__dirname, './src') },
    },
});
