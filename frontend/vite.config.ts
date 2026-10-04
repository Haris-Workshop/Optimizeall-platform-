/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { seoShell, ssrTrackImports } from './seoShell';
import { devProxy } from './src/app/devProxy';

/**
 * virtual:site-copy-defaults: the shipped page copy as `{ key: default text }`, read from the same catalog file
 * (src/features/public/site/siteCopy.json, shared with the backend) but without the editor-only labels, types and
 * placeholders. Every public page reads these synchronously, so they sit in the entry; the full catalog (about 40% larger
 * on the wire) is only imported by tests.
 */
function siteCopyDefaults(): Plugin {
  const id = 'virtual:site-copy-defaults';
  const file = fileURLToPath(new URL('./src/features/public/site/siteCopy.json', import.meta.url));
  return {
    name: 'site-copy-defaults',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(loaded) {
      if (loaded !== `\0${id}`) return undefined;
      this.addWatchFile(file);
      const catalog = JSON.parse(readFileSync(file, 'utf8')) as {
        groups: { entries: { key: string; default: string }[] }[];
      };
      const defaults = Object.fromEntries(
        catalog.groups.flatMap((g) => g.entries.map((e) => [e.key, e.default])),
      );
      return `export default ${JSON.stringify(defaults)};`;
    },
  };
}

export default defineConfig(({ mode, isSsrBuild }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5080';
  const proxy = devProxy(apiTarget);

  return {
    // seoShell: every page request (GET/HEAD, not an API/proxied path, asset or file) is rendered by the API's
    // /_document endpoint and served with the app shell, exactly like nginx's @document location: real 200/301/404/410,
    // including the 301s of moved public addresses (Website → Redirects). docs/SEO_CRO.md § Rendering.
    // ssrTrackImports (server build only): the renderer learns which route modules a page used, to link their CSS.
    plugins: [react(), siteCopyDefaults(), seoShell(apiTarget), ...(isSsrBuild ? [ssrTrackImports()] : [])],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 5173, strictPort: true, proxy },
    // The server renderer (`vite build --ssr src/entry-server.tsx`, docs/SEO_CRO.md § Rendering) is one self-contained
    // bundle: the web image runs it with plain Node, without node_modules.
    ssr: { noExternal: true, target: 'node' },
    build: isSsrBuild
      ? {
          target: 'node20',
          outDir: 'dist-ssr',
          sourcemap: false,
          ssrEmitAssets: false,
          minify: false,
          copyPublicDir: false,
        }
      : {
          target: 'es2022',
          // dist/.vite/manifest.json: which stylesheets and chunks each route module needs (read by the server renderer).
          manifest: true,
          // No source maps in the production bundle: nginx serves dist/ publicly and there is no error-reporting
          // pipeline that would need them (nginx also answers 404 for *.map; CI fails if the build emits any).
          sourcemap: false,
          rollupOptions: {
            output: {
              manualChunks: {
                react: ['react', 'react-dom', 'react-router-dom'],
                query: ['@tanstack/react-query'],
              },
            },
          },
        },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'seoShell.test.ts'],
      css: false,
      // axe over full pages (e.g. the ~650 country/time-zone options on Register) needs more than the 5s default.
      testTimeout: 30_000,
      restoreMocks: true,
      unstubGlobals: true,
    },
  };
});
