import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { normalizeGitHubEvent } from "../src/github/normalize.js";
import { evaluatePolicy, hasTriggerMention } from "../src/policy.js";
import { buildOpenClawRequest } from "../src/openclaw/prompt.js";

const baseEnv = {
  GITHUB_WEBHOOK_SECRET: "secret",
  OPENCLAW_HOOK_URL: "http://127.0.0.1:18789/hooks/agent",
  OPENCLAW_HOOK_TOKEN: "token",
};

const issueCommentEvent = {
  id: "delivery-1",
  name: "issue_comment",
  payload: {
    action: "created",
    repository: {
      full_name: "Artem4590/repo-warden",
      html_url: "https://github.com/Artem4590/repo-warden",
    },
    sender: {
      login: "Artem4590",
      type: "User",
      html_url: "https://github.com/Artem4590",
    },
    issue: {
      number: 12,
      title: "Build webhook bridge",
      html_url: "https://github.com/Artem4590/repo-warden/pull/12",
      state: "open",
      pull_request: {
        url: "https://api.github.com/repos/Artem4590/repo-warden/pulls/12",
      },
    },
    comment: {
      id: 501,
      body: "Looks good, please ping @openclaw to take it from here.",
      html_url: "https://github.com/Artem4590/repo-warden/pull/12#issuecomment-501",
    },
  },
} as const;

describe("policy", () => {
  it("detects the trigger mention anywhere in the body", () => {
    expect(hasTriggerMention("please ask @openclaw to act", "@openclaw")).toBe(true);
    expect(hasTriggerMention("no trigger here", "@openclaw")).toBe(false);
  });

  it("accepts allowed repo sender and mention", () => {
    const config = loadConfig({
      ...baseEnv,
      GITHUB_ALLOWED_REPOS: "Artem4590/repo-warden",
      GITHUB_ALLOWED_SENDERS: "Artem4590",
    });

    const normalized = normalizeGitHubEvent(issueCommentEvent);
    expect(normalized).not.toBeNull();

    const decision = evaluatePolicy(normalized!, config);
    expect(decision).toEqual({ accepted: true });
  });

  it("rejects comments without the trigger mention", () => {
    const config = loadConfig(baseEnv);
    const normalized = normalizeGitHubEvent({
      ...issueCommentEvent,
      payload: {
        ...issueCommentEvent.payload,
        comment: {
          ...issueCommentEvent.payload.comment,
          body: "Just an ordinary PR comment",
        },
      },
    });

    const decision = evaluatePolicy(normalized!, config);
    expect(decision).toEqual({ accepted: false, reason: "trigger_mention_missing" });
  });

  it("builds an OpenClaw request with a stable hook session key", () => {
    const config = loadConfig(baseEnv);
    const normalized = normalizeGitHubEvent(issueCommentEvent);

    const request = buildOpenClawRequest(normalized!, config);

    expect(request.sessionKey).toBe("hook:github:Artem4590:repo-warden:pr:12");
    expect(request.message).toContain("@openclaw");
    expect(request.message).toContain("Build webhook bridge");
  });
});
