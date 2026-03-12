# repo-warden

Minimal event-driven webhook bridge for GitHub → OpenClaw.

## What it does

`repo-warden` receives GitHub webhook events, filters the ones that mention `@openclaw`,
and forwards them to OpenClaw Gateway via `POST /hooks/agent`.

Current v1 scope:
- `issue_comment`
- `pull_request_review`
- `pull_request_review_comment`
- optional repo/sender allowlists
- trigger mention match anywhere in the comment body
- OpenClaw forwarding through a simple HTTP bridge
- in-memory duplicate delivery protection

## Architecture

```text
GitHub Webhook
  -> repo-warden (/github/webhooks)
  -> @octokit/webhooks signature verification + routing
  -> normalize + policy
  -> OpenClaw Gateway (/hooks/agent)
  -> isolated agent run
  -> model / tools / GitHub actions
```

## Environment

Copy `.env.example` to `.env` and fill in the secrets.

```bash
cp .env.example .env
```

## Development

```bash
npm install
npm run test
npm run check
npm run dev
```

## Build

```bash
npm run build
npm start
```

## OpenClaw side

OpenClaw Gateway must expose hooks and accept `/hooks/agent` requests, for example:

```json5
{
  hooks: {
    enabled: true,
    token: "replace-me",
    path: "/hooks",
    allowRequestSessionKey: true,
    allowedSessionKeyPrefixes: ["hook:"],
    allowedAgentIds: ["main"]
  }
}
```

## GitHub side

Configure the repository webhook to send `application/json` payloads to:

- `POST /github/webhooks`

Recommended events:
- Issue comments
- Pull request reviews
- Pull request review comments

Use the same secret value as `GITHUB_WEBHOOK_SECRET`.
