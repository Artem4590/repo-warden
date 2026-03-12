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

Copy `.env.example` to `.env` and fill in the values before running the service.

```bash
cp .env.example .env
```

Required/important variables:
- `GITHUB_WEBHOOK_SECRET` — webhook signing secret configured in GitHub
- `GITHUB_TRIGGER_MENTION` — mention that triggers forwarding (default example: `@openclaw`)
- `GITHUB_ALLOWED_REPOS` — comma-separated allowlist of repositories
- `GITHUB_ALLOWED_SENDERS` — comma-separated allowlist of GitHub users
- `OPENCLAW_HOOK_URL` — OpenClaw Gateway hook endpoint, for example `http://127.0.0.1:18789/hooks/agent`
- `OPENCLAW_HOOK_TOKEN` — OpenClaw hook token
- `OPENCLAW_AGENT_ID` — target OpenClaw agent id, usually `main`
- `OPENCLAW_SESSION_PREFIX` — session prefix for hook-created runs

Common optional variables:
- `HOST`, `PORT`, `LOG_LEVEL`
- `OPENCLAW_WAKE_MODE`, `OPENCLAW_DELIVER`
- `OPENCLAW_TIMEOUT_SECONDS`, `OPENCLAW_MODEL`, `OPENCLAW_THINKING`
- `OPENCLAW_CHANNEL`, `OPENCLAW_TO`

## Development with npm

```bash
npm install
npm run test
npm run check
npm run dev
```

## Build and run with npm

```bash
npm install
npm run build
npm start
```

## Development with Nix flakes

Enter the development shell (Node.js 20 + npm):

```bash
nix develop
npm install
```

Then use the usual npm commands inside the shell:

```bash
npm run dev
npm run test
npm run check
npm run build
```

## Run through Nix

Minimal flake apps are provided for local workflow from the repository root.
They use the project source as-is and expect dependencies to already be installed with `npm install`.

Run the server (build + start):

```bash
nix run
```

Run individual commands:

```bash
nix run .#build
nix run .#check
nix run .#test
```

If `node_modules` is missing, the flake app will stop and ask you to run `npm install` first.

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
