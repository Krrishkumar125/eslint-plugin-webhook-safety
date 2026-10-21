import express from 'express';

const app = express();
app.use(express.json());

app.post('/webhooks/stripe', async (req, res) => {
  const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  await emailQueue.add('receipt', { to: event.data.object.customer_email });
  res.json({ received: true });
});

app.post('/webhooks/github', (req, res) => {
  res.sendStatus(200);
});
