import rule from '../src/rules/bullmq-require-job-id.js';
import { ruleTester } from './helpers.js';

ruleTester.run('bullmq-require-job-id', rule, {
  valid: [
    `app.post('/webhook', async (req, res) => {
       const event = stripe.webhooks.constructEvent(req.body, sig, secret);
       await emailQueue.add('receipt', event.data, { jobId: event.id });
     });`,
    `async function h() {
       const event = stripe.webhooks.constructEvent(raw, sig, secret);
       await queue.add('x', {}, { deduplication: { id: event.id } });
       await queue.add('y', {}, opts);
       await queue.add('z', {}, { ...defaults });
     }`,
    // not in a webhook handler
    `async function signup() { await emailQueue.add('welcome', { userId }); }`,
    // not a queue
    `async function h() { stripe.webhooks.constructEvent(raw, sig, secret); set.add('x'); items.add(a, b); }`,
  ],
  invalid: [
    {
      code: `async function h(req) {
               const event = stripe.webhooks.constructEvent(raw, sig, secret);
               await receiptsQueue.add('send', { to: event.data.object.email });
             }`,
      errors: [
        {
          messageId: 'missing',
          suggestions: [
            {
              messageId: 'addJobId',
              output: `async function h(req) {
               const event = stripe.webhooks.constructEvent(raw, sig, secret);
               await receiptsQueue.add('send', { to: event.data.object.email }, { jobId: event.id });
             }`,
            },
          ],
        },
      ],
    },
    {
      code: `const q = new Queue('emails');
             app.post('/webhooks/stripe', async (req, res) => {
               const e = stripe.webhooks.constructEvent(req.body, sig, secret);
               await q.add('send', {}, { attempts: 3 });
             });`,
      errors: [
        {
          messageId: 'missing',
          suggestions: [
            {
              messageId: 'addJobId',
              output: `const q = new Queue('emails');
             app.post('/webhooks/stripe', async (req, res) => {
               const e = stripe.webhooks.constructEvent(req.body, sig, secret);
               await q.add('send', {}, { attempts: 3, jobId: e.id });
             });`,
            },
          ],
        },
      ],
    },
    {
      code: `export async function POST(req) { await this.jobsQueue.add('x', {}); }`,
      filename: '/app/api/webhooks/route.ts',
      errors: [{ messageId: 'missing', suggestions: [] }],
    },
  ],
});
