# Changelog

## 0.2.2 (2026-10-25)

- README: npm weekly downloads badge (docs only, no code changes).

## 0.2.1 (2026-10-23)

- npm metadata: shorter description, focused keywords, homepage/bugs links; README links sibling packages.

## 0.2.0 (2026-10-22)

- `require-idempotency` is now conservative: it reports only **direct** writes in the handler (DB, queue, email,
  payment calls) with no `event.id` use, and points at that write. Helper calls that receive event-derived data
  are treated as possibly idempotent (false positive found on twentyhq/twenty). New `strict` option restores
  the broader check. The message now reads as a suggestion and links the docs.
- `require-signature-verification` no longer reports handlers that pass the request to a helper (verification in another file).
- `require-raw-body` ignores `express.json({ verify })` and handlers that verify something other than `req.body` (e.g. `req.rawBody`).
- README: correct example output and a TypeScript setup section.
- Release smoke test now covers ESLint 8.57 (flat and legacy), 9, 10 and `@typescript-eslint/parser`. CI adds Windows.

## 0.1.0 (2026-10-22)

- Rules: `require-raw-body`, `require-signature-verification`, `require-idempotency`, `bullmq-require-job-id`.
- Configs: `recommended`, `strict`, `legacy-recommended`, `legacy-strict`.
- Tested on 8 open-source apps (Stripe/BullMQ users). False positives fixed before release:
  - `require-signature-verification` ignores authenticated endpoints (e.g. CRUD APIs that manage webhook subscriptions).
  - `require-idempotency` ignores verify-and-return wrappers that return the event to the caller.
