# Changelog

## 0.1.0 (2026-10-22)

- Rules: `require-raw-body`, `require-signature-verification`, `require-idempotency`, `bullmq-require-job-id`.
- Configs: `recommended`, `strict`, `legacy-recommended`, `legacy-strict`.
- Tested on 8 open-source apps (Stripe/BullMQ users). False positives fixed before release:
  - `require-signature-verification` ignores authenticated endpoints (e.g. CRUD APIs that manage webhook subscriptions).
  - `require-idempotency` ignores verify-and-return wrappers that return the event to the caller.
