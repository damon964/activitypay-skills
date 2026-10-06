// Points every reference to this repository at a new GitHub address, then
// regenerates the plugin manifests.
//
//   node scripts/set-repo.mjs <owner>/<name>     e.g. your-org/skills

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const next = process.argv[2];
if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(next ?? '')) {
  console.error('Usage: node scripts/set-repo.mjs <owner>/<name>');
  process.exit(1);
}

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const syncScript = join(ROOT, 'scripts/sync.mjs');
const current = readFileSync(syncScript, 'utf8').match(/const REPO = 'https:\/\/github\.com\/([^']+)'/)[1];
if (current === next) {
  console.log(`Already ${next}.`);
  process.exit(0);
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(md|mjs|json)$/.test(name)) files.push(p);
  }
})(ROOT);

let changed = 0;
for (const f of files) {
  const before = readFileSync(f, 'utf8');
  const after = before.split(current).join(next);
  if (after !== before) {
    writeFileSync(f, after);
    changed++;
  }
}
console.log(`${current} -> ${next} in ${changed} file(s). Regenerating manifests…`);
execFileSync(process.execPath, [syncScript], { stdio: 'inherit' });
