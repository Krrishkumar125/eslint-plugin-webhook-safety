import rule from '../src/rules/require-signature-verification.js';
import { ruleTester } from './helpers.js';

ruleTester.run('require-signature-verification', rule, {
  valid: [
    `app.post('/webhooks/stripe', express.raw({ type: '*/*' }), (req, res) => {
       stripe.webhooks.constructEvent(req.body, sig, secret);
     });`,
    `app.post('/webhooks/github', (req, res) => { if (!verifySignature(req)) return res.sendStatus(401); });`,
    `app.post('/webhooks/svix', async (req, res) => { new Webhook(secret).verify(payload, headers); });`,
    // a custom middleware might verify, so stay quiet
    `app.post('/webhooks/stripe', checkStripeSignature, (req, res) => { grant(req.body); });`,
    // not a webhook route
    `app.post('/api/users', (req, res) => { create(req.body); });`,
    // configured custom verifier
    {
      code: `app.post('/webhook', (req, res) => { assertFromPaddle(req); });`,
      options: [{ verifyFunctions: ['assertFromPaddle'] }],
    },
    // regression (formbricks): authenticated management API for webhook subscriptions
    {
      code: `export const POST = async (request) => authenticatedApiClient({ request, handler: create });`,
      filename: '/repo/apps/web/modules/api/v2/management/webhooks/route.ts',
    },
    {
      code: `app.post('/api/webhooks', async (req, res) => { const session = await getServerSession(); save(req.body); });`,
    },
    // cross-file: request handed to a helper that may verify
    {
      code: `export async function POST(req) { return handleStripeWebhook(req); }`,
      filename: '/repo/app/api/webhooks/stripe/route.ts',
    },
    `app.post('/webhooks/stripe', (req, res) => webhookService.process(req, res));`,
    `app.post('/webhooks/stripe', async (c) => { const ok = await checkRequest(c.req); });`,
    // Next.js POST outside a webhook file
    {
      code: `export async function POST(req) { return new Response('ok'); }`,
      filename: '/app/api/users/route.ts',
    },
    {
      code: `export async function POST(req) { const e = stripe.webhooks.constructEvent(await req.text(), s, k); }`,
      filename: '/app/api/webhooks/stripe/route.ts',
    },
  ],
  invalid: [
    {
      code: `app.post('/webhooks/stripe', express.raw({ type: '*/*' }), async (req, res) => {
               const event = JSON.parse(req.body);
               await grantCredits(event.data.object);
             });`,
      errors: [{ messageId: 'missing' }],
    },
    {
      // logging the request is not verification
      code: `app.post('/webhook', (req, res) => { console.log(req); res.json(req.body); });`,
      errors: [{ messageId: 'missing' }],
    },
    {
      code: `router.post(\`/api/webhook\`, (req, res) => { res.send('ok'); });`,
      errors: [{ messageId: 'missing' }],
    },
    {
      code: `export async function POST(req) { const event = await req.json(); await grant(event); return new Response('ok'); }`,
      filename: '/repo/app/api/webhooks/stripe/route.ts',
      errors: [{ messageId: 'missing' }],
    },
    {
      code: `export const POST = async (req) => { await grant(await req.json()); };`,
      filename: 'C:\\\\repo\\\\app\\\\api\\\\stripe-webhook\\\\route.ts',
      errors: [{ messageId: 'missing' }],
    },
  ],
});
