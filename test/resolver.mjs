import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Mapuje `@/lib/x` → `<root>/src/lib/x` a doplní příponu .ts/.tsx. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = path.join(ROOT, 'src', specifier.slice(2));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      try {
        const url = pathToFileURL(candidate).href;
        return await nextResolve(url, context);
      } catch {
        // zkusíme další variantu přípony
      }
    }
  }

  // Node 22 se v jednotlivých minor verzích liší v tom, zda při strip-types
  // doplní příponu u relativního TS importu. Aplikace ji díky bundleru
  // nepotřebuje, ale test runner ano. Resolver proto sjednocuje chování CI.
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const parentPath = fileURLToPath(context.parentURL);
    if (parentPath.startsWith(path.join(ROOT, 'src') + path.sep)) {
      const base = path.resolve(path.dirname(parentPath), specifier);
      for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
        try {
          return await nextResolve(pathToFileURL(candidate).href, context);
        } catch {
          // zkusíme další variantu přípony
        }
      }
    }
  }
  return nextResolve(specifier, context);
}
