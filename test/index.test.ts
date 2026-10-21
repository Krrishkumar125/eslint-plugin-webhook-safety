import { ESLint, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import plugin from '../src/index.js';

describe('plugin', () => {
  it('exposes rules with docs urls and both configs', () => {
    expect(Object.keys(plugin.rules).sort()).toEqual([
      'bullmq-require-job-id',
      'require-idempotency',
      'require-raw-body',
      'require-signature-verification',
    ]);
    for (const rule of Object.values(plugin.rules))
      expect(rule.meta?.docs?.url).toMatch(/^https:\/\//);
    expect(plugin.configs.recommended.rules['webhook-safety/require-raw-body']).toBe('error');
    expect(plugin.configs.recommended.rules['webhook-safety/require-idempotency']).toBe('warn');
    expect(Object.values(plugin.configs.strict.rules).every((v) => v === 'error')).toBe(true);
    expect(plugin.configs['legacy-recommended'].plugins).toEqual(['webhook-safety']);
  });

  it('works end to end in a flat config', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [plugin.configs.recommended],
    });
    const [result] = await eslint.lintText(
      `app.use(express.json());
       app.post('/webhook', async (req, res) => {
         const event = stripe.webhooks.constructEvent(req.body, sig, secret);
         await db.credits.increment(event.data.object.userId);
       });`,
    );
    expect(result?.messages.map((m) => m.ruleId)).toEqual([
      'webhook-safety/require-raw-body',
      'webhook-safety/require-idempotency',
    ]);
  });

  it('flat config objects are valid for Linter', () => {
    const linter = new Linter();
    expect(linter.verify('const a = 1;', [plugin.configs.strict])).toEqual([]);
  });
});
