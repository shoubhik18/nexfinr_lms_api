import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tscEntry = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const tsconfigPath = join(root, 'tsconfig.json');

console.log('Building LMS API (TypeScript → dist/)...\n');

if (!existsSync(tscEntry)) {
  console.error('✖ TypeScript is not installed. Run: npm install\n');
  process.exit(1);
}

if (!existsSync(tsconfigPath)) {
  console.error('✖ tsconfig.json not found at project root.');
  console.error(`  Expected: ${tsconfigPath}\n`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [tscEntry, '-p', tsconfigPath], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error('\n✖ Backend build failed to start.');
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error('\n✖ Backend build failed. Fix the TypeScript errors above.\n');
  process.exit(result.status ?? 1);
}

const entry = join(root, 'dist', 'app.js');
if (!existsSync(entry)) {
  console.error('\n✖ Backend build finished but dist/app.js was not found.\n');
  process.exit(1);
}

console.log('✔ Backend build successful.');
console.log('  Output: dist/');
console.log('  Entry:  dist/app.js\n');
