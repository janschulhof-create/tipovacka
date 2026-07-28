#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { ROOT, testArgsFor } from './test-suite.mjs';

const suite = process.argv[2] ?? 'green';
const watch = process.argv.includes('--watch');

let args;
try {
  args = testArgsFor(suite, { watch });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const result = spawnSync(process.execPath, args, {
  cwd: ROOT,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
