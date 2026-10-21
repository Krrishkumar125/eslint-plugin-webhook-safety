import rule from '../src/rules/require-raw-body.js';
import { ruleTester } from './helpers.js';

ruleTester.run('require-raw-body', rule, {
  valid: [
    // express.raw on the route, json for everything else afterwards
    `app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
       const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
     });
     app.use(express.json());`,
    // global json parser, but this route re-reads raw bytes with its own raw parser
    `app.use(express.json());
     app.post('/webhook', bodyParser.raw({ type: '*/*' }), (req, res) => {
       stripe.webhooks.constructEvent(req.body, sig, secret);
     });`,
    // Next.js App Router done right
    `export async function POST(req) {
       const body = await req.text();
       const event = stripe.webhooks.constructEvent(body, req.headers.get('stripe-signature'), secret);
     }`,
    // json() in a function that never verifies a Stripe signature is out of scope
    `export async function POST(req) { const data = await req.json(); return Response.json(data); }`,
    // json parser that keeps the raw bytes, verified with req.rawBody
    `app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
     app.post('/webhook', (req, res) => { stripe.webhooks.constructEvent(req.rawBody, sig, secret); });`,
    // global json parser, but the payload comes from somewhere other than req.body
    `app.use(express.json());
     app.post('/webhook', (req, res) => { stripe.webhooks.constructEvent(req.rawBody, sig, secret); });`,
    `app.post('/webhook', express.json({ verify: keepRaw }), (req, res) => { stripe.webhooks.constructEvent(req.rawBody, sig, secret); });`,
    // a json parser on a different app instance
    `api.use(express.json());
     app.post('/webhook', (req, res) => { stripe.webhooks.constructEvent(req.body, sig, secret); });`,
  ],
  invalid: [
    {
      code: `app.post('/webhooks/stripe', express.json(), (req, res) => {
               const event = stripe.webhooks.constructEvent(req.body, sig, secret);
             });`,
      errors: [
        {
          messageId: 'jsonMiddleware',
          suggestions: [
            {
              messageId: 'useRaw',
              output: `app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
               const event = stripe.webhooks.constructEvent(req.body, sig, secret);
             });`,
            },
          ],
        },
      ],
    },
    {
      code: `app.use(express.json());
             app.post('/webhook', async (req, res) => {
               const event = stripe.webhooks.constructEvent(req.body, sig, secret);
             });`,
      errors: [{ messageId: 'globalJson', line: 2 }],
    },
    {
      code: `app.use(bodyParser.json());
             router.post('/x', h);
             app.post('/stripe', (req, res) => { stripe.webhooks.constructEventAsync(req.body, sig, secret); });`,
      errors: [{ messageId: 'globalJson', line: 3 }],
    },
    {
      code: `export async function POST(req) {
               const payload = await req.json();
               const event = stripe.webhooks.constructEvent(JSON.stringify(payload), sig, secret);
             }`,
      errors: [
        {
          messageId: 'parsedJson',
          line: 2,
          suggestions: [
            {
              messageId: 'useText',
              output: `export async function POST(req) {
               const payload = await req.text();
               const event = stripe.webhooks.constructEvent(JSON.stringify(payload), sig, secret);
             }`,
            },
          ],
        },
        { messageId: 'stringified', line: 3 },
      ],
    },
    {
      code: `app.post('/webhook', async (c) => {
               const body = await c.req.json();
               stripe.webhooks.constructEvent(body, c.req.header('stripe-signature'), secret);
             });`,
      errors: [
        {
          messageId: 'parsedJson',
          suggestions: [
            {
              messageId: 'useText',
              output: `app.post('/webhook', async (c) => {
               const body = await c.req.text();
               stripe.webhooks.constructEvent(body, c.req.header('stripe-signature'), secret);
             });`,
            },
          ],
        },
      ],
    },
  ],
});
