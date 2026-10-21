# require-idempotency

Require a duplicate-event check (using `event.id`) before a webhook handler performs side effects.

💼 `recommended` (warn), `strict` (error)

## Why

Stripe delivers events **at least once**. It retries on timeouts and non-2xx responses and
sometimes sends the same event twice. Stripe's docs say to log processed event ids and skip
ones you have already handled. Without that, users get double credits, double emails and double refunds.

## What it reports

A `constructEvent(...)` result that is stored in a variable (or destructured) when the enclosing
function never reads `event.id`.

It stays silent when:

- the whole `event` is passed to another function (`handleStripeEvent(event)`), which may dedupe;
- a call's name looks like a dedupe helper (`/idempot|dedup|processed|alreadyHandled|seenEvent/i`);
- the call is listed in `idempotencyFunctions`.

## Options

```js
'webhook-safety/require-idempotency': ['warn', { idempotencyFunctions: ['once'] }]
```

## Examples

❌ Incorrect

```js
const event = stripe.webhooks.constructEvent(req.body, sig, secret);
if (event.type === 'checkout.session.completed') {
  await db.user.update({ where: { id: userId }, data: { credits: { increment: 100 } } });
}
```

✅ Correct

```js
const event = stripe.webhooks.constructEvent(req.body, sig, secret);
const fresh = await db.processedEvent.createMany({
  data: [{ id: event.id }],
  skipDuplicates: true,
});
if (fresh.count === 0) return res.json({ duplicate: true });
await db.user.update(/* ... */);
```

`webhook-crash-lab` checks this at runtime (`duplicate-delivery`, `concurrent-duplicates` scenarios).
