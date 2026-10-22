import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('README badges', () => {
  it('shows npm version and monthly downloads for the published name', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    expect(readme).toContain('img.shields.io/npm/v/eslint-plugin-webhook-safety)');
    expect(readme).toContain('img.shields.io/npm/dm/eslint-plugin-webhook-safety)');
  });
});
