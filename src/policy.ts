import type { AppConfig } from "./config.js";
import type { NormalizedGitHubEvent, PolicyDecision } from "./shared/types.js";

export function hasTriggerMention(body: string, triggerMention: string): boolean {
  return body.toLowerCase().includes(triggerMention.toLowerCase());
}

export function evaluatePolicy(event: NormalizedGitHubEvent, config: AppConfig): PolicyDecision {
  if (
    config.GITHUB_ALLOWED_REPOS.length > 0 &&
    !config.GITHUB_ALLOWED_REPOS.includes(event.repository.fullName)
  ) {
    return { accepted: false, reason: "repository_not_allowed" };
  }

  if (
    config.GITHUB_ALLOWED_SENDERS.length > 0 &&
    !config.GITHUB_ALLOWED_SENDERS.includes(event.sender.login)
  ) {
    return { accepted: false, reason: "sender_not_allowed" };
  }

  if (!hasTriggerMention(event.comment.body, config.GITHUB_TRIGGER_MENTION)) {
    return { accepted: false, reason: "trigger_mention_missing" };
  }

  return { accepted: true };
}
