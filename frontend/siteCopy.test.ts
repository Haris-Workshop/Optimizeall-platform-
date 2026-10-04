import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyDefaultsByPrefix, copyPrefixesUsed } from './siteCopy';

const catalog = JSON.parse(readFileSync('src/features/public/site/siteCopy.json', 'utf8')) as Parameters<
  typeof copyDefaultsByPrefix
>[0];
const byPrefix = copyDefaultsByPrefix(catalog);
const known = new Set(byPrefix.keys());

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('site copy split by key prefix', () => {
  it('puts every catalog key in exactly one prefix bucket', () => {
    const keys = catalog.groups.flatMap((g) => g.entries.map((e) => e.key));
    const bucketed = [...byPrefix.values()].flatMap((bucket) => Object.keys(bucket));
    expect(bucketed.sort()).toEqual([...keys].sort());
    for (const [prefix, bucket] of byPrefix)
      for (const key of Object.keys(bucket)) expect(key.startsWith(`${prefix}.`)).toBe(true);
  });

  it('gives every module the prefixes of the keys it reads', () => {
    let modules = 0;
    for (const file of sourceFiles('src')) {
      const code = readFileSync(file, 'utf8');
      const literal = [...code.matchAll(/copy\.(?:text|list|pairs)\('([^']+)'/g)].map(
        (m) => m[1].split('.')[0],
      );
      if (literal.length === 0) continue;
      modules++;
      const prefixes = copyPrefixesUsed(code, known);
      for (const prefix of literal) expect(prefixes, `${file} reads ${prefix}.*`).toContain(prefix);
    }
    expect(modules).toBeGreaterThan(20);
  });

  it('finds computed keys by their literal prefix and ignores modules that do not read copy', () => {
    expect(
      copyPrefixesUsed(
        "import { useSiteCopy } from '../site/copy';\nconst k = `partners.kit.${slug}.title`;",
        known,
      ),
    ).toEqual(['partners']);
    expect(copyPrefixesUsed("const x = 'home.hero.title';", known)).toEqual([]);
  });
});
