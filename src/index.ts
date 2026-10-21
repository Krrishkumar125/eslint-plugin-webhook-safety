import type { ESLint, Linter, Rule } from 'eslint';
import bullmqRequireJobId from './rules/bullmq-require-job-id.js';
import requireIdempotency from './rules/require-idempotency.js';
import requireRawBody from './rules/require-raw-body.js';
import requireSignatureVerification from './rules/require-signature-verification.js';

const rules: Record<string, Rule.RuleModule> = {
  'require-raw-body': requireRawBody,
  'require-signature-verification': requireSignatureVerification,
  'require-idempotency': requireIdempotency,
  'bullmq-require-job-id': bullmqRequireJobId,
};

const recommendedRules: Linter.RulesRecord = {
  'webhook-safety/require-raw-body': 'error',
  'webhook-safety/require-signature-verification': 'error',
  'webhook-safety/require-idempotency': 'warn',
  'webhook-safety/bullmq-require-job-id': 'warn',
};
const strictRules: Linter.RulesRecord = Object.fromEntries(
  Object.keys(recommendedRules).map((k) => [k, 'error']),
);

const plugin = {
  meta: { name: 'eslint-plugin-webhook-safety', version: '0.1.0' },
  rules,
  configs: {} as {
    recommended: Linter.Config & { rules: Linter.RulesRecord };
    strict: Linter.Config & { rules: Linter.RulesRecord };
    'legacy-recommended': { plugins: string[]; rules: Linter.RulesRecord };
    'legacy-strict': { plugins: string[]; rules: Linter.RulesRecord };
  },
} satisfies ESLint.Plugin;

plugin.configs.recommended = {
  name: 'webhook-safety/recommended',
  plugins: { 'webhook-safety': plugin as ESLint.Plugin },
  rules: recommendedRules,
};
plugin.configs.strict = {
  name: 'webhook-safety/strict',
  plugins: { 'webhook-safety': plugin as ESLint.Plugin },
  rules: strictRules,
};
plugin.configs['legacy-recommended'] = { plugins: ['webhook-safety'], rules: recommendedRules };
plugin.configs['legacy-strict'] = { plugins: ['webhook-safety'], rules: strictRules };

export default plugin;
