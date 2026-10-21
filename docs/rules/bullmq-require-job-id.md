# bullmq-require-job-id

Require a `jobId` (or `deduplication` id) when a webhook handler adds a BullMQ job.

💼 `recommended` (warn), `strict` (error) · 💡 has suggestions

## Why

Retried webhook deliveries run your handler again. `queue.add()` without a stable id enqueues the
work a second time. With `jobId: event.id`, BullMQ ignores the duplicate add
([docs](https://docs.bullmq.io/guide/jobs/job-ids)).

## What it reports

`<queue>.add(name, data)` or `<queue>.add(name, data, { ...no jobId/deduplication })` inside a webhook
handler (a function that calls `constructEvent`, a webhook route, or a Next.js `POST` in a webhook file).
Receivers count as queues when they were created with `new Queue(...)` in the file or their name ends in `queue`
(`emailQueue`, `this.jobsQueue`). Options passed as a variable or with a spread are not checked.

## Examples

❌ Incorrect

```js
const event = stripe.webhooks.constructEvent(raw, sig, secret);
await emailQueue.add('receipt', { to: event.data.object.email });
```

✅ Correct

```js
await emailQueue.add('receipt', { to: event.data.object.email }, { jobId: event.id });
```

Note: BullMQ job ids must not contain `:`. Stripe ids (`evt_...`) are safe. See also
[eslint-plugin-bullmq](https://github.com/Krrishkumar125/eslint-plugin-bullmq) `valid-job-id`.

## Suggestions

Adds `{ jobId: <event>.id }` using the variable that holds the `constructEvent` result.
