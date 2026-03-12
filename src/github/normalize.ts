import type { GitHubWebhookEvent, NormalizedGitHubEvent } from "../shared/types.js";

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeGitHubEvent(event: GitHubWebhookEvent): NormalizedGitHubEvent | null {
  const payload = event.payload;
  const eventName = event.name;

  const repository = isRecord(payload.repository) ? payload.repository : null;
  const sender = isRecord(payload.sender) ? payload.sender : null;

  if (!repository || !sender) {
    return null;
  }

  const repositoryFullName = getString(repository.full_name);
  const senderLogin = getString(sender.login);

  if (!repositoryFullName || !senderLogin) {
    return null;
  }

  if (eventName === "issue_comment") {
    const issue = isRecord(payload.issue) ? payload.issue : null;
    const comment = isRecord(payload.comment) ? payload.comment : null;

    if (!issue || !comment || !isRecord(issue.pull_request)) {
      return null;
    }

    const prNumber = getNumber(issue.number);
    const commentId = getNumber(comment.id);
    if (!prNumber || !commentId) {
      return null;
    }

    return {
      deliveryId: event.id,
      eventName,
      action: getString(payload.action) ?? "unknown",
      repository: {
        fullName: repositoryFullName,
        htmlUrl: getString(repository.html_url),
      },
      sender: {
        login: senderLogin,
        type: getString(sender.type),
        htmlUrl: getString(sender.html_url),
      },
      pullRequest: {
        number: prNumber,
        title: getString(issue.title),
        htmlUrl: getString(issue.html_url),
        state: getString(issue.state),
      },
      comment: {
        kind: "issue_comment",
        id: commentId,
        body: getString(comment.body) ?? "",
        htmlUrl: getString(comment.html_url),
      },
    };
  }

  if (eventName === "pull_request_review") {
    const pullRequest = isRecord(payload.pull_request) ? payload.pull_request : null;
    const review = isRecord(payload.review) ? payload.review : null;

    if (!pullRequest || !review) {
      return null;
    }

    const prNumber = getNumber(pullRequest.number);
    const reviewId = getNumber(review.id);
    if (!prNumber || !reviewId) {
      return null;
    }

    const base = isRecord(pullRequest.base) ? pullRequest.base : null;
    const head = isRecord(pullRequest.head) ? pullRequest.head : null;

    return {
      deliveryId: event.id,
      eventName,
      action: getString(payload.action) ?? "unknown",
      repository: {
        fullName: repositoryFullName,
        htmlUrl: getString(repository.html_url),
      },
      sender: {
        login: senderLogin,
        type: getString(sender.type),
        htmlUrl: getString(sender.html_url),
      },
      pullRequest: {
        number: prNumber,
        title: getString(pullRequest.title),
        htmlUrl: getString(pullRequest.html_url),
        state: getString(pullRequest.state),
        draft: typeof pullRequest.draft === "boolean" ? pullRequest.draft : undefined,
        baseRef: base ? getString(base.ref) : undefined,
        headRef: head ? getString(head.ref) : undefined,
      },
      comment: {
        kind: "pull_request_review",
        id: reviewId,
        body: getString(review.body) ?? "",
        htmlUrl: getString(review.html_url),
        reviewState: getString(review.state),
      },
    };
  }

  if (eventName === "pull_request_review_comment") {
    const pullRequest = isRecord(payload.pull_request) ? payload.pull_request : null;
    const comment = isRecord(payload.comment) ? payload.comment : null;

    if (!pullRequest || !comment) {
      return null;
    }

    const prNumber = getNumber(pullRequest.number);
    const commentId = getNumber(comment.id);
    if (!prNumber || !commentId) {
      return null;
    }

    const base = isRecord(pullRequest.base) ? pullRequest.base : null;
    const head = isRecord(pullRequest.head) ? pullRequest.head : null;

    return {
      deliveryId: event.id,
      eventName,
      action: getString(payload.action) ?? "unknown",
      repository: {
        fullName: repositoryFullName,
        htmlUrl: getString(repository.html_url),
      },
      sender: {
        login: senderLogin,
        type: getString(sender.type),
        htmlUrl: getString(sender.html_url),
      },
      pullRequest: {
        number: prNumber,
        title: getString(pullRequest.title),
        htmlUrl: getString(pullRequest.html_url),
        state: getString(pullRequest.state),
        draft: typeof pullRequest.draft === "boolean" ? pullRequest.draft : undefined,
        baseRef: base ? getString(base.ref) : undefined,
        headRef: head ? getString(head.ref) : undefined,
      },
      comment: {
        kind: "pull_request_review_comment",
        id: commentId,
        body: getString(comment.body) ?? "",
        htmlUrl: getString(comment.html_url),
        path: getString(comment.path),
        line: getNumber(comment.line),
        side: getString(comment.side),
        diffHunk: getString(comment.diff_hunk),
      },
    };
  }

  return null;
}
