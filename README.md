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
  3:1  error    `app.use(express.json())` on line 1 runs before this webhook route and parses the body ...  webhook-safety/require-raw-body
  4:17 warning  Stripe retries and duplicates webhook deliveries, but this handler never uses `event.id` ...   webhook-safety/require-idempotency
  5:9  warning  Webhook deliveries are retried, so this queue.add() will enqueue the same work twice ...      webhook-safety/bullmq-require-job-id
```

## Rules

| Rule                                                                           | What it catches                                                            | recommended | strict | 💡  |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------- | ------ | --- |
| [require-raw-body](docs/rules/require-raw-body.md)                             | `express.json()` / `req.json()` / `JSON.stringify` before `constructEvent` | error       | error  | ✅  |
| [require-signature-verification](docs/rules/require-signature-verification.md) | webhook route or Next.js `POST` with no signature check                    | error       | error  |     |
| [require-idempotency](docs/rules/require-idempotency.md)                       | `constructEvent` result whose `event.id` is never used for dedupe          | warn        | error  |     |
| [bullmq-require-job-id](docs/rules/bullmq-require-job-id.md)                   | `queue.add()` in a webhook handler without `jobId`                         | warn        | error  | ✅  |

The rules are tuned for **low false positives**. When in doubt (custom middleware, the event passed to a
helper, options passed as a variable) they stay quiet. Each rule doc lists exactly what triggers it.

Supports Express, Hono, Fastify-style routers and the Next.js App Router, in JavaScript and TypeScript
(use `typescript-eslint`'s parser as usual).

### Legacy `.eslintrc` (ESLint 8)

```json
{ "extends": ["plugin:webhook-safety/legacy-recommended"] }
```

## Requirements

ESLint ≥ 8.57 (flat config) and Node ≥ 20.

## License

MIT © Krrish Kumar
