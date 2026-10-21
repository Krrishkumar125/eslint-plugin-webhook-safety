// Packs the plugin, installs the tarball into a throwaway project, lints a fixture and
// checks the expected rules fire. Usage: node smoke/run.mjs
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const expected = [
  'webhook-safety/require-raw-body',
  'webhook-safety/bullmq-require-job-id',
  'webhook-safety/require-idempotency',
  'webhook-safety/require-signature-verification',
];

const work = mkdtempSync(join(tmpdir(), 'eslint-plugin-smoke-'));
execFileSync('npm', ['pack', '--pack-destination', work], { cwd: root, stdio: 'inherit' });
const tgz = readdirSync(work).find((f) => f.endsWith('.tgz'));
cpSync(join(root, 'smoke/fixture'), work, { recursive: true });
writeFileSync(
  join(work, 'package.json'),
  JSON.stringify({ name: 'smoke', private: true, type: 'module' }),
);
execFileSync('npm', ['i', '--no-audit', '--no-fund', '-s', `./${tgz}`, 'eslint@10'], {
  cwd: work,
  stdio: 'inherit',
});

let out = '';
try {
  execFileSync('npx', ['eslint', '-f', 'json', 'server.js'], { cwd: work, encoding: 'utf8' });
  throw new Error('eslint exited 0, expected lint errors');
} catch (err) {
  if (!err.stdout) throw err;
  out = err.stdout;
}
const ids = JSON.parse(out).flatMap((f) => f.messages.map((m) => m.ruleId));
const missing = expected.filter((id) => !ids.includes(id));
if (missing.length) throw new Error(`missing rules in output: ${missing.join(', ')}\n${out}`);
console.log(`smoke ok: ${ids.join(', ')}`);
