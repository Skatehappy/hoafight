// npm test runner: runs every standalone test script in a child process, prints pass/fail counts, exits nonzero on any failure.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const list = (dir, re) => readdirSync(path.join(root, dir)).filter(f => re.test(f)).sort().map(f => dir + '/' + f);
const files = [...list('scripts', /^test-.*\.mjs$/), ...list('tests', /\.test\.(m?js)$/)];
let pass = 0; const failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [f], { cwd: root, encoding: 'utf8', timeout: 300000 });
  const ok = r.status === 0;
  console.log((ok ? 'PASS ' : 'FAIL ') + f);
  if (ok) pass++; else { failed.push(f); process.stdout.write((r.stdout || '') + (r.stderr || '')); }
}
console.log(`\nTest files: ${files.length}  passed: ${pass}  failed: ${failed.length}`);
process.exit(failed.length ? 1 : 0);
