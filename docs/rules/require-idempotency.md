# require-idempotency

Suggest a duplicate-event check (using `event.id`) when a webhook handler writes directly.

💼 `recommended` (warn), `strict` (error)

## Why

Stripe delivers events **at least once**. It retries on timeouts and non-2xx responses and
sometimes sends the same event twice. Stripe's docs say to log processed event ids and skip
ones you have already handled. Without that, users get double credits, double emails and double refunds.

## What ## What it reports

A `constructEvent(...)` result (stored or destructured) when the same function then performs a
**direct side effect** and never reads `event.id`. Direct side effects are method calls such as
`db.x.create/update/upsert/delete/increment`, `queue.add`, `resend.emails.send`,
`transporter.sendMail` and `stripe.refunds.create`. The report points at the first such write.

It is deliberately conservative and stays silent when:

- the whole `event` is passed to another function (`handleStripeEvent(event)`), which may dedupe;
- processing happens in **helpers** (local or imported), even if they receive data derived from the event
  (`recordTrialCard({ subscriptionId })`), because they are often idempotent by design
  (for example by checking state already stored in Stripe);
- a call's name looks like a dedupe helper (`/idempot|dedup|processed|alreadyHandled|seenEvent/i`), or is listed in `idempotencyFunctions`;
- the function only verifies and returns the event.

If a write is idempotent on its own (an upsert keyed by the Stripe object id), it is fine to ignore the warning.

## Options

```js
'webhook-safety/require-idempotency': ['warn', {
  idempotencyFunctions: ['once'], // calls that dedupe
  strict: false,                  // true: helper calls with arguments also count as side effects
}]
```

les

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
