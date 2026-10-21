# require-raw-body

Require the raw request body for Stripe signature verification.

💼 `recommended` (error), `strict` (error) · 💡 has suggestions

## Why

`stripe.webhooks.constructEvent()` checks an HMAC over the **exact bytes** Stripe sent. If
`express.json()` (or Next.js `req.json()`) parsed the body first, the bytes are gone and every
event fails with `No signatures found matching the expected signature for payload`. This is the
single most common Stripe webhook bug (see the
[Stripe docs](https://docs.stripe.com/webhooks/signature) and
[stripe-node#2078](https://github.com/stripe/stripe-node/issues/2078)). Re-serializing with
`JSON.stringify(req.body)` does not help: key order and whitespace differ.

## What it reports

- `express.json()` / `bodyParser.json()` passed as middleware to a route whose handler calls `constructEvent`.
- `app.use(express.json())` registered on the same app **before** such a route, when the route has no `express.raw()`/`express.text()` of its own.
- `await req.json()` (or Hono's `c.req.json()`) before `constructEvent` in the same function.
- `constructEvent(JSON.stringify(...), ...)`.

The middleware checks only fire when `constructEvent` is given `req.body`. `express.json({ verify })`, which keeps
the raw bytes (for example on `req.rawBody`), is not reported.

## Examples

❌ Incorrect

```js
app.use(express.json());
app.post('/webhooks/stripe', (req, res) => {
  const event = stripe.webhooks.constructEvent(req.body, sig, secret);
});

export async function POST(req) {
  const body = await req.json();
  const event = stripe.webhooks.constructEvent(JSON.stringify(body), sig, secret);
}
```

✅ Correct

```js
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const event = stripe.webhooks.constructEvent(req.body, sig, secret);
});
app.use(express.json()); // after the webhook route

export async function POST(req) {
  const body = await req.text();
  const event = stripe.webhooks.constructEvent(body, req.headers.get('stripe-signature'), secret);
}
```

## Suggestions

- Replace the inline `express.json()` with `express.raw({ type: 'application/json' })`.
- Replace `req.json()` with `req.text()`.

These are suggestions, not autofixes, because the handler may read parsed fields afterwards.

Try it for real: [`npx webhook-crash-lab demo`](https://github.com/Krrishkumar125/webhook-crash-lab) shows this failure (`raw-body` scenario) against a running server.
