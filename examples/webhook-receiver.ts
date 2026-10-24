// A webhook receiver on Node's own http server. It checks each delivery's
// Pantech-Signature against the raw body before trusting it.
//
//   PANTECH_WEBHOOK_SECRET=whsec_… node examples/webhook-receiver.ts
//
// Then point a webhook at http://<your host>:8080/pantech (client.webhooks.create).
import { createServer } from "node:http";
import { verifyWebhook, type WebhookEvent, WebhookVerificationError } from "@pantechdynamic/sdk";

const secret = process.env.PANTECH_WEBHOOK_SECRET;
if (!secret) throw new Error("Set PANTECH_WEBHOOK_SECRET to the webhook's signing secret.");

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/pantech") {
    res.writeHead(404).end();
    return;
  }

  // Verify the bytes exactly as they arrived: parsed and re-serialised JSON
  // would not match the signature.
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);

  try {
    await verifyWebhook({ secret, header: req.headers["pantech-signature"] as string | undefined, body });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      res.writeHead(400).end(err.message);
      return;
    }
    throw err;
  }

  const event = JSON.parse(body.toString("utf8")) as WebhookEvent;
  console.log(`${event.type} ${event.id}`);
  // Answer quickly; do slow work after responding.
  res.writeHead(204).end();
});

server.listen(8080, () => console.log("Listening on http://localhost:8080/pantech"));
