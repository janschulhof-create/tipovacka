import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');

const SUITES = {
  green: ['test/charakterizacni', 'test/jednotkove'],
  red: ['test/regresni-red'],
  contract: ['test/kontraktni'],
  all: ['test'],
};

function collect(dir) {
  const absolute = path.join(ROOT, dir);
  const out = [];
  for (const name of readdirSync(absolute).sort()) {
    const full = path.join(absolute, name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (statSync(full).isDirectory()) out.push(...collect(rel));
    else if (name.endsWith('.test.ts')) out.push(rel);
  }
  return out;
}

export function testFilesFor(suite) {
  const dirs = SUITES[suite];
  if (!dirs) throw new Error(`Neznámá testovací sada: ${suite}`);
  return dirs.flatMap(collect).sort();
}

export function testArgsFor(suite, { reporter, watch = false } = {}) {
  const files = testFilesFor(suite);
  if (files.length === 0) throw new Error(`Testovací sada ${suite} neobsahuje žádné testy.`);
  const args = [
    '--test',
    '--experimental-strip-types',
    '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
    '--import', './test/register.mjs',
  ];
  if (reporter) args.push(`--test-reporter=${reporter}`);
  if (watch) args.push('--watch');
  return [...args, ...files];
}
