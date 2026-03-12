export type SupportedGitHubEventName =
  | "issue_comment"
  | "pull_request_review"
  | "pull_request_review_comment";

export interface GitHubWebhookEvent {
  id: string;
  name: SupportedGitHubEventName;
  payload: Record<string, unknown>;
}

export interface NormalizedGitHubEvent {
  deliveryId: string;
  eventName: SupportedGitHubEventName;
  action: string;
  repository: {
    fullName: string;
    htmlUrl?: string;
  };
  sender: {
    login: string;
    type?: string;
    htmlUrl?: string;
  };
  pullRequest: {
    number: number;
    title?: string;
    htmlUrl?: string;
    state?: string;
    draft?: boolean;
    baseRef?: string;
    headRef?: string;
  };
  comment: {
    kind: "issue_comment" | "pull_request_review" | "pull_request_review_comment";
    id: number;
    body: string;
    htmlUrl?: string;
    path?: string;
    line?: number;
    side?: string;
    diffHunk?: string;
    reviewState?: string;
  };
}

export type PolicyDecision =
  | { accepted: true }
  | { accepted: false; reason: string };

export interface OpenClawAgentRequest {
  name: string;
  agentId: string;
  sessionKey: string;
  wakeMode: "now" | "next-heartbeat";
  deliver: boolean;
  message: string;
  timeoutSeconds?: number;
  model?: string;
  thinking?: string;
  channel?: string;
  to?: string;
}
