# require-signature-verification

Require webhook handlers to verify the request signature.

💼 `recommended` (error), `strict` (error)

## Why

A webhook URL is public. Without a signature check, anyone who finds it can POST a fake
`checkout.session.completed` and get free credits.

## What it reports

A handler that never calls anything verification-like:

- `app.post('<path containing "webhook" or /hook>', handler)` (Express, Hono, Fastify-style routers; also `put`/`all`), and
- an exported Next.js `POST` in a file whose path contains `webhook` (e.g. `app/api/webhooks/stripe/route.ts`).

A call counts as verification when its name matches `/verif|signature|constructEvent|timingSafeEqual|unwrap/i`
(`constructEvent`, `verifySignature`, `wh.verify`, `crypto.timingSafeEqual`, `client.webhooks.unwrap` …).

To keep false positives low the rule stays silent when:

- the route has any middleware other than a body parser (it may do the verification);
- the handler passes the request object to another function (`return handleStripeWebhook(req)`), which may verify it in another file;
- the handler calls something authentication-like (`auth`, `session`, `apiKey`, `permission`, `currentUser`). Authenticated endpoints, such as an API for managing webhook subscriptions, are not webhook receivers.

## Options

```js
'webhook-safety/require-signature-verification': ['error', { verifyFunctions: ['assertFromPaddle'] }]
```

## Examples

❌ Incorrect

```js
app.post('/webhooks/stripe', express.raw({ type: '*/*' }), async (req, res) => {
  const event = JSON.parse(req.body);
  await grantCredits(event.data.object);
});
```

✅ Correct

```js
app.post('/webhooks/stripe', express.raw({ type: '*/*' }), async (req, res) => {
  const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  await grantCredits(event.data.object);
});
```
