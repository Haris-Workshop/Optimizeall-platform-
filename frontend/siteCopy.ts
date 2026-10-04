import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * The shipped page copy (src/features/public/site/siteCopy.json, shared with the backend) is about 27 KB of text, read
 * synchronously by every public page. Bundling it all into the entry costs every first visit ~12 KiB (gzip) for words of
 * pages it does not show, so it is split by key prefix (`home.`, `services.`, `academy.` …) and each module that uses a
 * prefix registers it when it loads:
 *
 *  - `virtual:site-copy/<prefix>`: registers `{ key: default text }` of that prefix (copy.ts `registerCopyDefaults`);
 *    nothing but the key → text map is bundled, not the editor's labels, types and placeholders.
 *  - this plugin's transform adds `import 'virtual:site-copy/<prefix>'` to every module under src/ (but copy.ts and the
 *    tests) that imports the copy hook and mentions a key of that prefix as a string literal. Rollup then puts a prefix
 *    where its users are: `shared.` (header, footer) in the entry, `services.` with the services pages.
 *
 * Over-inclusion (a string that only looks like a key) costs bytes, never correctness; src/features/public/site/copy.test.tsx
 * checks that every key a module reads is covered by what it imports.
 */

/** Vite and Vitest run from frontend/. */
const CATALOG = resolve(process.cwd(), 'src/features/public/site/siteCopy.json');
const PREFIX = 'virtual:site-copy/';

interface Catalog {
  groups: { entries: { key: string; default: string }[] }[];
}

/** The catalog's defaults grouped by the first segment of the key. */
export function copyDefaultsByPrefix(catalog: Catalog): Map<string, Record<string, string>> {
  const byPrefix = new Map<string, Record<string, string>>();
  for (const group of catalog.groups)
    for (const entry of group.entries) {
      const prefix = entry.key.split('.')[0];
      const bucket = byPrefix.get(prefix) ?? {};
      bucket[entry.key] = entry.default;
      byPrefix.set(prefix, bucket);
    }
  return byPrefix;
}

/** Whether a module reads copy (imports the copy hook/module). */
const USES_COPY = /from\s+['"][^'"]*\/copy['"]/;

/** The key prefixes a module's string literals mention (`'services.hero.title'`, `` `partners.kit.${slug}` ``). */
export function copyPrefixesUsed(code: string, known: ReadonlySet<string>): string[] {
  if (!USES_COPY.test(code)) return [];
  const used = new Set<string>();
  for (const match of code.matchAll(/['"`]([A-Za-z]+)\.[A-Za-z]/g))
    if (known.has(match[1])) used.add(match[1]);
  return [...used].sort();
}

export function siteCopy(): Plugin {
  let byPrefix: Map<string, Record<string, string>> | null = null;
  const load = () =>
    (byPrefix ??= copyDefaultsByPrefix(JSON.parse(readFileSync(CATALOG, 'utf8')) as Catalog));
  return {
    name: 'site-copy',
    enforce: 'pre',
    resolveId: (source) => (source.startsWith(PREFIX) ? `\0${source}` : undefined),
    load(id) {
      if (!id.startsWith(`\0${PREFIX}`)) return undefined;
      this.addWatchFile(CATALOG);
      const defaults = load().get(id.slice(PREFIX.length + 1));
      if (!defaults) this.error(`Unknown site copy prefix in ${id}`);
      return (
        `import { registerCopyDefaults } from '@/features/public/site/copy';\n` +
        `registerCopyDefaults(${JSON.stringify(defaults)});\n`
      );
    },
    transform(code, id) {
      const file = id.split('?')[0].replaceAll('\\', '/');
      if (!/\/src\/.+\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file) || file.endsWith('/site/copy.ts'))
        return undefined;
      const prefixes = copyPrefixesUsed(code, new Set(load().keys()));
      if (prefixes.length === 0) return undefined;
      return { code: prefixes.map((p) => `import '${PREFIX}${p}';\n`).join('') + code, map: null };
    },
  };
}
