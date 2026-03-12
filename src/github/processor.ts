import type { FastifyBaseLogger } from "fastify";

import type { AppConfig } from "../config.js";
import { normalizeGitHubEvent } from "./normalize.js";
import { sendToOpenClaw } from "../openclaw/client.js";
import { buildOpenClawRequest } from "../openclaw/prompt.js";
import { evaluatePolicy } from "../policy.js";
import type { GitHubWebhookEvent } from "../shared/types.js";

export async function processGitHubEvent(
  event: GitHubWebhookEvent,
  config: AppConfig,
  log: FastifyBaseLogger,
): Promise<void> {
  const normalized = normalizeGitHubEvent(event);
  if (!normalized) {
    log.info({ deliveryId: event.id, eventName: event.name }, "GitHub event ignored by normalizer");
    return;
  }

  const decision = evaluatePolicy(normalized, config);
  if (!decision.accepted) {
    log.info(
      {
        deliveryId: normalized.deliveryId,
        repo: normalized.repository.fullName,
        sender: normalized.sender.login,
        reason: decision.reason,
      },
      "GitHub event skipped by policy",
    );
    return;
  }

  const request = buildOpenClawRequest(normalized, config);
  const response = await sendToOpenClaw(request, config);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenClaw hook failed with ${response.status}: ${body}`);
  }

  log.info(
    {
      deliveryId: normalized.deliveryId,
      repo: normalized.repository.fullName,
      prNumber: normalized.pullRequest.number,
      sender: normalized.sender.login,
      sessionKey: request.sessionKey,
    },
    "GitHub event forwarded to OpenClaw",
  );
}
