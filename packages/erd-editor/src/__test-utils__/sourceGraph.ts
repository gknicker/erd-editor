import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import { transformWithOxc } from 'vite-plus';

const SOURCE_ROOT = join(process.cwd(), 'src');

/** A static import or re-export in emitted JavaScript, or a bare side effect import. */
const IMPORT_FORM =
  /(?:^|\n)\s*(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

const posix = (path: string) =>
  relative(SOURCE_ROOT, path).split(sep).join('/');

function resolveSource(base: string): string {
  const found = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ].find(path => existsSync(path) && statSync(path).isFile());
  if (!found) throw new Error(`Unresolved import: ${base}`);
  return found;
}

const specifiers = new Map<string, string[]>();

/**
 * What a module imports once oxc has transpiled it, as the build does: an
 * import whose bindings are read only as types is gone by then, whether or not
 * it was spelled with the type keyword.
 */
async function importsOf(file: string): Promise<string[]> {
  const cached = specifiers.get(file);
  if (cached) return cached;

  const { code } = await transformWithOxc(readFileSync(file, 'utf8'), file, {
    jsx: 'preserve',
  });
  const found = [...code.matchAll(IMPORT_FORM)].map(
    match => match[1] ?? match[2]
  );
  specifiers.set(file, found);
  return found;
}

/**
 * Every source module an entry evaluates, as paths under src. It follows what
 * chunking follows, every value import in reach, and not what tree shaking
 * keeps, so a module named here may still be shaken out of a bundle.
 *
 * @example
 * (await reach('engine/index.ts')).includes('engine/store.ts');
 */
export async function reach(entry: string): Promise<string[]> {
  const seen = new Set<string>();
  const pending = [join(SOURCE_ROOT, entry)];

  while (pending.length) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    for (const specifier of await importsOf(file)) {
      if (specifier.startsWith('@/')) {
        pending.push(resolveSource(join(SOURCE_ROOT, specifier.slice(2))));
      } else if (specifier.startsWith('.')) {
        pending.push(resolveSource(join(dirname(file), specifier)));
      }
    }
  }

  return [...seen].map(posix).sort();
}

/** The source of a module named as reach names it. */
export const readSource = (path: string) =>
  readFileSync(join(SOURCE_ROOT, path), 'utf8');
