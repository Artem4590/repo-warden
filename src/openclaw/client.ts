import type { AppConfig } from "../config.js";
import type { OpenClawAgentRequest } from "../shared/types.js";

export async function sendToOpenClaw(
  payload: OpenClawAgentRequest,
  config: AppConfig,
): Promise<Response> {
  return fetch(config.OPENCLAW_HOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.OPENCLAW_HOOK_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
}
