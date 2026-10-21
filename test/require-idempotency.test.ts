import rule from '../src/rules/require-idempotency.js';
import { ruleTester } from './helpers.js';

ruleTester.run('require-idempotency', rule, {
  valid: [
    `async function h(req) {
       const event = stripe.webhooks.constructEvent(raw, sig, secret);
       const inserted = await db.processedEvents.insertIgnore({ id: event.id });
       if (!inserted) return;
       await db.user.update({ where: { id: 1 }, data: {} });
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
    // regression (twentyhq/twenty): dedupe lives in a helper that receives derived data
    `export async function POST(request) {
       const event = await stripe.webhooks.constructEventAsync(payload, signature, secret);
       if (event.type !== 'checkout.session.completed') return NextResponse.json({ received: true });
       const subscriptionId = event.data.object.subscription;
       const outcome = await recordTrialCard({ stripe, subscriptionId });
       console.info(outcome);
       return NextResponse.json({ received: true });
     }`,
    // regression (vercel/nextjs-subscription-payments): side effects only via helpers
    `async function h(req) {
       const event = stripe.webhooks.constructEvent(body, sig, secret);
       switch (event.type) {
         case 'product.updated': await upsertProductRecord(event.data.object); break;
         case 'customer.subscription.updated': await manageSubscriptionStatusChange(event.data.object.id, event.data.object.customer); break;
       }
     }`,
    // only reads, no writes
    `async function h(req) {
       const event = stripe.webhooks.constructEvent(raw, sig, secret);
       const user = await db.user.findUnique({ where: { id: event.data.object.metadata.userId } });
       return Response.json({ ok: !!user });
     }`,
    // configured helper
    {
      code: `async function h(req) {
               const event = stripe.webhooks.constructEvent(raw, sig, secret);
               await once(event.type, () => db.user.update({}));
             }`,
      options: [{ idempotencyFunctions: ['once'] }],
    },
    // verify-and-return wrapper (twenty's service)
    `class S { constructEventFromPayload(sig, payload) {
       const returnValue = this.stripe.webhooks.constructEvent(payload, sig, secret);
       return returnValue;
     } }`,
    // constructEvent result not stored: nothing to analyse
    `function h() { stripe.webhooks.constructEvent(raw, sig, secret); }`,
    // side effect before verification is not the handler's processing
    `async function h(req) {
       await db.log.create({ data: { at: Date.now() } });
       const event = stripe.webhooks.constructEvent(raw, sig, secret);
       return event.type;
     }`,
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
      errors: [{ messageId: 'missing', line: 4 }],
    },
    {
      code: `app.post('/webhook', async (req, res) => {
               let evt;
               evt = await stripe.webhooks.constructEventAsync(req.body, sig, secret);
               console.log(evt);
               await emailQueue.add('receipt', { to: evt.data.object.customer_email });
               await resend.emails.send({ to: evt.data.object.customer_email });
             });`,
      errors: [{ messageId: 'missing', line: 5 }],
    },
    {
      code: `async function h(req) {
               const { type, data } = stripe.webhooks.constructEvent(raw, sig, secret);
               await stripe.refunds.create({ payment_intent: data.object.id });
             }`,
      errors: [{ messageId: 'missing' }],
    },
    // strict: helpers receiving event-derived data count as side effects
    {
      code: `async function h(req) {
               const event = stripe.webhooks.constructEvent(raw, sig, secret);
               await sendReceipt(event.data.object.customer_email);
             }`,
      options: [{ strict: true }],
      errors: [{ messageId: 'missing' }],
    },
  ],
});
