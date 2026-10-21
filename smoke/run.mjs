// Packs the plugin, installs the tarball into throwaway projects and lints a fixture with
// ESLint 8 (flat + legacy .eslintrc), 9 and 10, plus a TypeScript file via @typescript-eslint/parser.
// Usage: node smoke/run.mjs
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// npm/npx are .cmd shims on Windows, which execFile can only start through a shell.
const shell = process.platform === 'win32';
const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const ns = pkg.name.replace(/^eslint-plugin-/, '');
const { fixture, expected } = JSON.parse(readFileSync(join(root, 'smoke/expected.json'), 'utf8'));

const work = mkdtempSync(join(tmpdir(), 'eslint-plugin-smoke-'));
execFileSync('npm', ['pack', '--pack-destination', work], { cwd: root, stdio: 'ignore', shell });
const tgz = join(
  work,
  readdirSync(work).find((f) => f.endsWith('.tgz')),
);

const flat = (parser) =>
  `import plugin from '${pkg.name}';\n${parser ? "import parser from '@typescript-eslint/parser';\n" : ''}` +
  `export default [${parser ? "{ files: ['**/*.ts'], languageOptions: { parser } }, " : ''}plugin.configs.recommended];\n`;

const cases = [
  { name: 'eslint@10 flat', deps: ['eslint@10'], files: { 'eslint.config.js': flat(false) } },
  { name: 'eslint@9 flat', deps: ['eslint@9'], files: { 'eslint.config.js': flat(false) } },
  { name: 'eslint@8.57 flat', deps: ['eslint@8.57'], files: { 'eslint.config.js': flat(false) } },
  {
    name: 'eslint@8.57 legacy .eslintrc',
    deps: ['eslint@8.57'],
    env: { ESLINT_USE_FLAT_CONFIG: 'false' },
    files: {
      '.eslintrc.json': JSON.stringify({
        root: true,
        parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        extends: [`plugin:${ns}/legacy-recommended`],
      }),
    },
  },
  {
    name: 'eslint@10 + @typescript-eslint/parser (.ts)',
    deps: ['eslint@10', '@typescript-eslint/parser', 'typescript'],
    ts: true,
    files: { 'eslint.config.js': flat(true) },
  },
];

for (const c of cases) {
  const dir = join(work, c.name.replace(/\W+/g, '-'));
  mkdirSync(dir);
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'smoke', private: true, type: 'module' }),
  );
  for (const [f, content] of Object.entries(c.files)) writeFileSync(join(dir, f), content);
  const target = c.ts ? fixture.replace(/\.js$/, '.ts') : fixture;
  copyFileSync(join(root, 'smoke/fixture', fixture), join(dir, target));
  execFileSync('npm', ['i', '--no-audit', '--no-fund', '-s', tgz, ...c.deps], {
    cwd: dir,
    stdio: 'inherit',
    shell,
  });
  let out;
  try {
    execFileSync('npx', ['eslint', '-f', 'json', target], {
      cwd: dir,
      shell,
      encoding: 'utf8',
      env: { ...process.env, ...c.env },
    });
    throw new Error(`${c.name}: eslint exited 0, expected lint errors`);
  } catch (err) {
    if (!err.stdout) throw err;
    out = err.stdout;
  }
  const ids = JSON.parse(out).flatMap((f) =>
    f.messages.map((m) => m.ruleId ?? `FATAL ${m.message}`),
  );
  const missing = expected.filter((id) => !ids.includes(id));
  if (missing.length) throw new Error(`${c.name}: missing ${missing.join(', ')}\n${out}`);
  console.log(`smoke ok [${c.name}]: ${ids.join(', ')}`);
}
