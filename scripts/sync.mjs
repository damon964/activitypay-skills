// Generates the skills package manifests and copies shared references into
// every skill, mirroring the layout of https://github.com/payroc/skills.
//
//   node scripts/sync.mjs   (or: npm run sync)
//
// Edit references only in _shared/references/, then run this.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SHARED = join(ROOT, '_shared/references');
const PLUGINS_DIR = join(ROOT, 'plugins/activitypay');
const VERSION = '0.1.0';
const REPO = 'https://github.com/damon964/activitypay-skills';

const DESCRIPTIONS = {
  checkout: 'Skills for booking checkout, deposits with balance due, and phone bookings by payment link',
  refunds: 'Skills for cancellations, voids, and refunds',
  vault: 'Skills for saving guest cards and charging them later',
  notifications: 'Skills for receiving and verifying gateway webhooks',
};

const json = (v) => JSON.stringify(v, null, 2) + '\n';
const write = (path, content) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
};

const plugins = readdirSync(PLUGINS_DIR).filter((p) => existsSync(join(PLUGINS_DIR, p, 'skills')));

for (const plugin of plugins) {
  const dir = join(PLUGINS_DIR, plugin);
  const skills = readdirSync(join(dir, 'skills')).filter((s) => existsSync(join(dir, 'skills', s, 'SKILL.md')));
  const description = DESCRIPTIONS[plugin] ?? `ActivityPay ${plugin} skills`;

  for (const skill of skills) {
    const md = readFileSync(join(dir, 'skills', skill, 'SKILL.md'), 'utf8');
    if (!md.startsWith('---\n') || !md.includes(`\nname: ${skill}\n`)) {
      throw new Error(`${plugin}/${skill}/SKILL.md must start with frontmatter whose name is "${skill}"`);
    }
    cpSync(SHARED, join(dir, 'skills', skill, 'references'), { recursive: true });
  }

  const skillPaths = skills.map((s) => `./skills/${s}`);
  write(join(dir, 'plugin.json'), json({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: plugin,
    version: VERSION,
    description,
    author: { name: 'ActivityPay' },
    repository: REPO,
    license: 'MIT',
  }));
  write(join(dir, '.claude-plugin/plugin.json'), json({ name: plugin, description, skills: skillPaths }));
  write(join(dir, '.cursor-plugin/plugin.json'), json({ name: plugin, description, version: VERSION, author: { name: 'ActivityPay' }, skills: skillPaths }));
  console.log(`${plugin}: ${skills.join(', ')}`);
}

const entries = plugins.map((p) => ({ name: p, source: `./plugins/activitypay/${p}`, description: DESCRIPTIONS[p], version: VERSION }));
write(join(ROOT, '.claude-plugin/marketplace.json'), json({
  name: 'activitypay-skills',
  owner: { name: 'ActivityPay' },
  metadata: { description: 'Claude Code skills for developers integrating booking software with the ActivityPay payment gateway' },
  plugins: entries,
}));
write(join(ROOT, '.cursor-plugin/marketplace.json'), json({
  name: 'activitypay-skills',
  description: 'Cursor plugins for developers integrating booking software with the ActivityPay payment gateway',
  author: { name: 'ActivityPay' },
  plugins: entries,
}));
