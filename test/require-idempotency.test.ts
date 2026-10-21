import rule from '../src/rules/require-idempotency.js';
import { ruleTester } from './helpers.js';

ruleTester.run('require-idempotency', rule, {
  valid: [
    `async function h(req) {
       const event = stripe.webhooks.constructEvent(raw, sig, secret);
       const inserted = await db.processedEvents.insertIgnore({ id: event.id });
       if (!inserted) return;
       await grant(event.data.object);
     }`,
    `async function h(req) {
       const { id, type, data } = stripe.webhooks.constructEvent(raw, sig, secret);
       await queue.add(type, data, { jobId: id });
     }`,
    // processing delegated to a function that receives the whole event
    `async function h(req) {
       const event = stripe.webhooks.constructEvent(raw, sig, secret);
       await handleStripeEvent(event);
     }`,
    // configured helper
    {
      code: `async function h(req) {
               const event = stripe.webhooks.constructEvent(raw, sig, secret);
               await once(event.type, () => grant(event.data.object));
             }`,
      options: [{ idempotencyFunctions: ['once'] }],
    },
    // constructEvent result not stored: nothing to analyse
    `function h() { stripe.webhooks.constructEvent(raw, sig, secret); }`,
  ],
  invalid: [
    {
      code: `async function h(req, res) {
               const event = stripe.webhooks.constructEvent(req.body, sig, secret);
               if (event.type === 'checkout.session.completed') {
                 await db.user.update({ where: { id: event.data.object.metadata.userId }, data: { credits: { increment: 100 } } });
               }
               res.json({ received: true });
             }`,
      errors: [{ messageId: 'missing' }],
    },
    {
      code: `app.post('/webhook', async (req, res) => {
               let evt;
               evt = await stripe.webhooks.constructEventAsync(req.body, sig, secret);
               console.log(evt);
               await sendReceipt(evt.data.object.customer_email);
             });`,
      errors: [{ messageId: 'missing' }],
    },
  ],
});
