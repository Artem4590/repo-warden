import Fastify from "fastify";
import { Webhooks } from "@octokit/webhooks";

import { loadConfig } from "./config.js";
import { processGitHubEvent } from "./github/processor.js";

const config = loadConfig();
const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport:
      config.NODE_ENV === "development"
        ? {
            target: "pino-pretty",
            options: { translateTime: "SYS:standard", ignore: "pid,hostname" },
          }
        : undefined,
  },
  bodyLimit: 1024 * 1024,
});

const webhooks = new Webhooks({ secret: config.GITHUB_WEBHOOK_SECRET });

const seenDeliveries = new Map<string, number>();
const DELIVERY_TTL_MS = 60 * 60 * 1000;

function pruneSeenDeliveries(now = Date.now()): void {
  for (const [deliveryId, seenAt] of seenDeliveries.entries()) {
    if (now - seenAt > DELIVERY_TTL_MS) {
      seenDeliveries.delete(deliveryId);
    }
  }
}

function rememberDelivery(deliveryId: string): boolean {
  pruneSeenDeliveries();
  if (seenDeliveries.has(deliveryId)) {
    return false;
  }
  seenDeliveries.set(deliveryId, Date.now());
  return true;
}

webhooks.on("issue_comment", async (event) => {
  await processGitHubEvent(event, config, app.log);
});

webhooks.on("pull_request_review", async (event) => {
  await processGitHubEvent(event, config, app.log);
});

webhooks.on("pull_request_review_comment", async (event) => {
  await processGitHubEvent(event, config, app.log);
});

webhooks.onError((error) => {
  app.log.error({ error }, "GitHub webhook handler error");
});

app.get("/healthz", async () => ({ ok: true }));

app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (_request, body, done) => done(null, body),
);

app.post("/github/webhooks", async (request, reply) => {
  const deliveryId = request.headers["x-github-delivery"];
  const eventName = request.headers["x-github-event"];
  const signature = request.headers["x-hub-signature-256"];
  const payload = typeof request.body === "string" ? request.body : JSON.stringify(request.body);

  if (typeof deliveryId !== "string" || typeof eventName !== "string" || typeof signature !== "string") {
    return reply.code(400).send({ error: "missing_github_headers" });
  }

  if (!rememberDelivery(deliveryId)) {
    return reply.code(202).send({ status: "duplicate_ignored", deliveryId });
  }

  try {
    await webhooks.verifyAndReceive({
      id: deliveryId,
      name: eventName,
      payload,
      signature,
    });

    return reply.code(202).send({ status: "accepted", deliveryId });
  } catch (error) {
    seenDeliveries.delete(deliveryId);
    request.log.error({ err: error, deliveryId, eventName }, "GitHub webhook request failed");
    return reply.code(400).send({ error: "webhook_processing_failed" });
  }
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error({ err: error }, "Failed to start server");
  process.exit(1);
}
