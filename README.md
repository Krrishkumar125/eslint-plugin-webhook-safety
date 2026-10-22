# eslint-plugin-webhook-safety

[![CI](https://github.com/Krrishkumar125/eslint-plugin-webhook-safety/actions/workflows/ci.yml/badge.svg)](https://github.com/Krrishkumar125/eslint-plugin-webhook-safety/actions/workflows/ci.yml)

ESLint rules that catch the Stripe webhook bugs that only show up in production:

- the body was parsed before the signature check, so every event fails;
- the signature is never checked;
- duplicate deliveries are processed twice;
- retries enqueue the same BullMQ job twice.

The static half of [webhook-crash-lab](https://github.com/Krrishkumar125/webhook-crash-lab).
This plugin finds the bug in your editor, and crash-lab proves the fix against a running server.

## 60-second start

```sh
npm i -D eslint eslint-plugin-webhook-safety
```

```js
// eslint.config.js
import webhookSafety from 'eslint-plugin-webhook-safety';

export default [
  webhookSafety.configs.recommended, // or .strict
];
```

```js
// server.js
app.use(express.json());
app.post('/webhooks/stripe', async (req, res) => {
  const event = stripe.webhooks.constructEvent(req.body, sig, secret);
  await emailQueue.add('receipt', { to: event.data.object.customer_email });
});
```

```text
$ npx eslint server.js
  2:1  error    `app.use(express.json())` on line 1 runs before this webhook route and parses the body ...  webhook-safety/require-raw-body
  4:9  warning  Consider a duplicate-event check: Stripe can deliver `event` more than once ...                 webhook-safety/require-idempotency
  4:9  warning  Webhook deliveries are retried, so this queue.add() will enqueue the same work twice ...      webhook-safety/bullmq-require-job-id
```

## Rules

| Rule                                                                           | What it catches                                                            | recommended | strict | 💡  |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------- | ------ | --- |
| [require-raw-body](docs/rules/require-raw-body.md)                             | `express.json()` / `req.json()` / `JSON.stringify` before `constructEvent` | error       | error  | ✅  |
| [require-signature-verification](docs/rules/require-signature-verification.md) | webhook route or Next.js `POST` with no signature check                    | error       | error  |     |
| [require-idempotency](docs/rules/require-idempotency.md)                       | DB/queue/email/payment write in the handler with no `event.id` dedupe      | warn        | error  |     |
| [bullmq-require-job-id](docs/rules/bullmq-require-job-id.md)                   | `queue.add()` in a webhook handler without `jobId`                         | warn        | error  | ✅  |

The rules are tuned for **low false positives**. When in doubt (custom middleware, the event passed to a
helper, options passed as a variable) they stay quiet. Each rule doc lists exactly what triggers it.

Supports Express, Hono, Fastify-style routers and the Next.js App Router, in JavaScript and TypeScript.

### TypeScript

ESLint only lints `.ts` files that some config object matches, so pair the plugin with
`typescript-eslint` (or at least its parser):

```js
// eslint.config.js
import tseslint from 'typescript-eslint';
import webhookSafety from 'eslint-plugin-webhook-safety';

export default [...tseslint.configs.recommended, webhookSafety.configs.recommended];
```

### Legacy `.eslintrc` (ESLint 8)

```json
{ "extends": ["plugin:webhook-safety/legacy-recommended"] }
```

## Requirements

ESLint 8.57+, 9 or 10 (flat config, or `.eslintrc` via the legacy configs) and Node ≥ 20. Every release is
smoke-tested from the packed tarball against ESLint 8.57 (flat and legacy), 9, 10 and `@typescript-eslint/parser`.

## Sibling packages

Other tools by the same author:

- [secret-blast-radius](https://www.npmjs.com/package/secret-blast-radius): what a malicious npm install could steal, plus a rotation plan
- [zod-india](https://www.npmjs.com/package/zod-india): Zod schemas for GSTIN, PAN, IFSC, UPI and Aadhaar
- [create-bullmq-app](https://www.npmjs.com/package/create-bullmq-app): scaffold a production BullMQ + TypeScript service
- [webhook-crash-lab](https://www.npmjs.com/package/webhook-crash-lab): crash-test webhook handlers against duplicates and races
- [webhook-crash-lab-mcp](https://www.npmjs.com/package/webhook-crash-lab-mcp): MCP server so coding agents can run webhook-crash-lab
- [eslint-plugin-bullmq](https://www.npmjs.com/package/eslint-plugin-bullmq): lint rules for BullMQ production pitfalls

## License

MIT © Krrish Kumar
