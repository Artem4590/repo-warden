# repo-warden deployment guide

This guide covers the full path from a fresh server to a working GitHub webhook that can wake an OpenClaw agent through `repo-warden`.

It is written for the current deployment shape used by this project:

- `repo-warden` runs as a **user-level systemd service**
- public HTTPS is terminated by **Caddy**
- hostname is based on **sslip.io**
- OpenClaw accepts incoming hook requests on `POST /hooks/agent`
- a known-good allowed repository is `Artem4590/openclaw-maintenance`
- the trigger mention is `@openclaw`

All secrets below use placeholders. Do not copy real secrets into git.

---

## 1. What repo-warden is for

`repo-warden` is a small Node/TypeScript webhook bridge between GitHub and OpenClaw.

Its job is:

1. receive GitHub webhook deliveries
2. verify the GitHub signature
3. normalize supported PR-related events
4. apply simple policy checks:
   - repository allowlist
   - sender allowlist
   - required trigger mention in the comment body
5. forward accepted events to OpenClaw via `POST /hooks/agent`
6. let OpenClaw create or wake an agent run for that PR session

In short: **GitHub comments/reviews mention `@openclaw` → repo-warden validates them → OpenClaw gets a hook request → the agent handles the PR workflow**.

---

## 2. End-to-end architecture

```text
GitHub Webhook
  -> HTTPS endpoint on your public host
  -> Caddy reverse proxy
  -> repo-warden (/github/webhooks)
  -> signature verification + normalization + policy
  -> OpenClaw hook endpoint (/hooks/agent)
  -> agent run / existing PR session wake-up
```

Concrete request flow:

1. GitHub sends a webhook delivery to `https://<host>/github/webhooks`
2. Caddy accepts TLS and forwards the request to local `repo-warden`
3. `repo-warden` verifies `X-Hub-Signature-256`
4. `repo-warden` only processes supported events
5. `repo-warden` rejects deliveries that do not match policy
6. accepted deliveries are converted into an OpenClaw hook payload
7. OpenClaw receives the payload on `/hooks/agent`
8. OpenClaw routes it to the configured agent, usually `main`

Useful local endpoints:

- GitHub webhook ingress: `POST /github/webhooks`
- health check: `GET /healthz`
- OpenClaw hook target: `POST /hooks/agent`

---

## 3. Supported GitHub events

At the moment `repo-warden` listens for exactly these GitHub webhook event names:

- `issue_comment`
- `pull_request_review`
- `pull_request_review_comment`

Important behavior details:

### `issue_comment`

Only **issue comments that belong to a pull request** are accepted by the normalizer.

If GitHub sends an `issue_comment` for a regular issue, `repo-warden` ignores it because there is no PR context.

### `pull_request_review`

Review submissions are supported. The review body is checked for the trigger mention.

### `pull_request_review_comment`

Inline review comments are supported. File path, line, and diff hunk are forwarded into the OpenClaw prompt when present.

---

## 4. Policy checks before forwarding

Even when the signature is valid, `repo-warden` only forwards events that pass policy.

Current checks:

1. **Repository allowlist** via `GITHUB_ALLOWED_REPOS`
2. **Sender allowlist** via `GITHUB_ALLOWED_SENDERS`
3. **Trigger mention** in the comment/review body via `GITHUB_TRIGGER_MENTION`

Typical current values:

- allowed repo: `Artem4590/openclaw-maintenance`
- trigger mention: `@openclaw`

If any check fails, the delivery is skipped and logged with a reason such as:

- `repository_not_allowed`
- `sender_not_allowed`
- `trigger_mention_missing`

---

## 5. Server preparation

This guide assumes a Linux host with:

- systemd
- a public IP address
- outbound access to GitHub and whatever OpenClaw needs
- Caddy installed
- Node.js 20+ available

Recommended packages on Ubuntu/Debian-like hosts:

```bash
sudo apt update
sudo apt install -y git curl caddy
```

Install Node.js 20+ using your preferred method. For example with NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

You should also ensure your user has lingering enabled if you want the **user-level systemd service** to stay up after logout:

```bash
sudo loginctl enable-linger "$USER"
```

---

## 6. Choose the public hostname with sslip.io

A practical pattern is to use your server IP with `sslip.io`.

If your public IP is `203.0.113.10`, a usable hostname is:

```text
repo-warden.203-0-113-10.sslip.io
```

Check DNS resolution from anywhere:

```bash
getent hosts repo-warden.203-0-113-10.sslip.io
```

You will use this hostname both in Caddy and in the GitHub webhook settings.

---

## 7. Clone and build repo-warden

```bash
cd ~
git clone https://github.com/Artem4590/repo-warden.git
cd repo-warden
npm install
npm run test
npm run check
npm run build
```

The project currently requires Node.js `>=20`.

If you are updating an existing deployment:

```bash
cd ~/repo-warden
git pull --ff-only
npm install
npm run test
npm run check
npm run build
```

---

## 8. Configure repo-warden `.env`

Start from the example file:

```bash
cd ~/repo-warden
cp .env.example .env
```

Example `.env` for a practical deployment:

```dotenv
HOST=127.0.0.1
PORT=3000
LOG_LEVEL=info

GITHUB_WEBHOOK_SECRET=<github-webhook-secret>
GITHUB_TRIGGER_MENTION=@openclaw
GITHUB_ALLOWED_REPOS=Artem4590/openclaw-maintenance
GITHUB_ALLOWED_SENDERS=Artem4590

OPENCLAW_HOOK_URL=http://127.0.0.1:18789/hooks/agent
OPENCLAW_HOOK_TOKEN=<openclaw-hook-token>
OPENCLAW_AGENT_ID=main
OPENCLAW_SESSION_PREFIX=hook:github
OPENCLAW_WAKE_MODE=now
OPENCLAW_DELIVER=false
# OPENCLAW_TIMEOUT_SECONDS=600
# OPENCLAW_MODEL=<model-name>
# OPENCLAW_THINKING=high
# OPENCLAW_CHANNEL=telegram
# OPENCLAW_TO=<target-id>
```

### Variable notes

#### Listener

- `HOST=127.0.0.1` is recommended when Caddy is on the same machine
- `PORT=3000` is the local Fastify port
- `LOG_LEVEL=info` is a sensible default

#### GitHub side

- `GITHUB_WEBHOOK_SECRET` must exactly match the secret configured in the GitHub webhook
- `GITHUB_TRIGGER_MENTION` is the string that must appear in the review/comment body
- `GITHUB_ALLOWED_REPOS` is a comma-separated allowlist
- `GITHUB_ALLOWED_SENDERS` is also comma-separated; leave empty if you do not want sender filtering

#### OpenClaw side

- `OPENCLAW_HOOK_URL` should usually point at local OpenClaw, for example `http://127.0.0.1:18789/hooks/agent`
- `OPENCLAW_HOOK_TOKEN` must match OpenClaw hook config
- `OPENCLAW_AGENT_ID` is usually `main`
- `OPENCLAW_SESSION_PREFIX` defaults to `hook:github`
- `OPENCLAW_WAKE_MODE` can be `now` or `next-heartbeat`
- `OPENCLAW_DELIVER` controls direct delivery behavior for the hook-created run

### Important security note

Do not bind repo-warden directly to a public interface unless you specifically need that.
A local bind such as `127.0.0.1` plus Caddy in front is the safer default.

---

## 9. Enable hooks in OpenClaw

`repo-warden` forwards accepted GitHub events into OpenClaw through `/hooks/agent`, so OpenClaw must have hooks enabled.

Edit:

```bash
~/.openclaw/openclaw.json
```

Example configuration:

```json
{
  "hooks": {
    "enabled": true,
    "token": "<openclaw-hook-token>",
    "path": "/hooks",
    "allowRequestSessionKey": true,
    "allowedSessionKeyPrefixes": ["hook:"],
    "allowedAgentIds": ["main"]
  }
}
```

What matters here:

- `enabled: true` turns hooks on
- `token` must match `OPENCLAW_HOOK_TOKEN` in `repo-warden`
- `path: "/hooks"` means the effective agent endpoint becomes `/hooks/agent`
- `allowRequestSessionKey: true` allows repo-warden to supply a stable session key per PR
- `allowedSessionKeyPrefixes` should include the prefix used by `OPENCLAW_SESSION_PREFIX`
- `allowedAgentIds` should include the agent id used by `OPENCLAW_AGENT_ID`

After updating config, restart OpenClaw gateway if needed.

If you manage OpenClaw through the CLI, the relevant commands are:

```bash
openclaw gateway status
openclaw gateway restart
```

---

## 10. Smoke-test OpenClaw locally before adding repo-warden

Before putting GitHub in front, verify that OpenClaw is actually listening for hook requests.

Example:

```bash
curl -i \
  -X POST http://127.0.0.1:18789/hooks/agent \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <openclaw-hook-token>' \
  -d '{
    "name": "smoke-test",
    "agentId": "main",
    "sessionKey": "hook:smoke:test",
    "wakeMode": "now",
    "deliver": false,
    "message": "smoke test from deployment guide"
  }'
```

You should get a successful HTTP response from OpenClaw. If not, fix the hook configuration before continuing.

---

## 11. Create the user-level systemd service

Create the user unit directory if it does not exist:

```bash
mkdir -p ~/.config/systemd/user
```

Create `~/.config/systemd/user/repo-warden.service`:

```ini
[Unit]
Description=repo-warden GitHub webhook bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/repo-warden
Environment=NODE_ENV=production
EnvironmentFile=%h/repo-warden/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

If `npm` is installed elsewhere on your machine, replace `/usr/bin/npm` with the actual path from:

```bash
command -v npm
```

Load and start the unit:

```bash
systemctl --user daemon-reload
systemctl --user enable --now repo-warden.service
systemctl --user status repo-warden.service
```

Useful commands later:

```bash
systemctl --user restart repo-warden.service
systemctl --user stop repo-warden.service
systemctl --user status repo-warden.service
journalctl --user -u repo-warden.service -f
```

---

## 12. Verify repo-warden locally

Check the health endpoint before adding Caddy:

```bash
curl -i http://127.0.0.1:3000/healthz
```

Expected result:

```json
{"ok":true}
```

If this fails:

- inspect `systemctl --user status repo-warden.service`
- inspect `journalctl --user -u repo-warden.service -n 100 --no-pager`
- make sure `.env` exists and is readable
- make sure `npm run build` produced `dist/server.js`

---

## 13. Configure HTTPS with Caddy

Point Caddy at the local repo-warden port.

Example `/etc/caddy/Caddyfile`:

```caddy
repo-warden.203-0-113-10.sslip.io {
    encode gzip

    reverse_proxy 127.0.0.1:3000
}
```

Validate and reload Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy
```

Now test from the public hostname:

```bash
curl -i https://repo-warden.203-0-113-10.sslip.io/healthz
```

You should again get `{"ok":true}`.

### Firewall notes

Caddy needs inbound access on:

- `80/tcp` for ACME HTTP challenge and redirect
- `443/tcp` for HTTPS

The repo-warden process itself only needs local access to `127.0.0.1:3000` if you keep it behind Caddy.

---

## 14. Configure the GitHub webhook

In GitHub:

1. open the target repository
2. go to **Settings → Webhooks**
3. click **Add webhook**

Use these values:

- **Payload URL:** `https://repo-warden.203-0-113-10.sslip.io/github/webhooks`
- **Content type:** `application/json`
- **Secret:** the same value as `GITHUB_WEBHOOK_SECRET`
- **SSL verification:** enabled

### Which events to subscribe to

Choose **Let me select individual events**, then enable:

- **Issue comments**
- **Pull request reviews**
- **Pull request review comments**

That matches the event types that `repo-warden` actually handles.

### Why not “Just the push event” or “Send me everything”?

- push events are irrelevant here
- sending everything adds noise and unnecessary load
- this bridge is specifically designed for PR comment/review driven automation

---

## 15. First real end-to-end test

After the webhook is configured, test the whole path with a comment in an allowed repository and PR.

### Recommended test case

1. open a PR in `Artem4590/openclaw-maintenance`
2. add a PR comment, review body, or inline review comment containing `@openclaw`
3. wait for GitHub to deliver the webhook
4. confirm the delivery in GitHub and the forward in your logs

Example comment body:

```text
@openclaw please inspect this PR and suggest or apply the next fix.
```

### What success looks like

You should see all of the following:

1. **GitHub webhook delivery shows success** (2xx) in the GitHub UI
2. `repo-warden` logs something like **accepted** / **forwarded to OpenClaw**
3. OpenClaw receives a hook request for the configured agent
4. the target agent run appears under a stable session key for that PR

Internally, repo-warden uses a session key in this form:

```text
hook:github:<owner>:<repo>:pr:<number>
```

More precisely, `/` and `:` are normalized, so a repo such as `Artem4590/openclaw-maintenance` becomes a `hook:github:...:pr:<number>` session namespace tied to that PR.

---

## 16. Observability and where to look

### repo-warden health

```bash
curl -i https://repo-warden.203-0-113-10.sslip.io/healthz
```

### repo-warden logs

```bash
journalctl --user -u repo-warden.service -f
```

### GitHub delivery history

In the repository webhook page, GitHub shows:

- each delivery attempt
- response code
- headers
- request body
- redelivery option

This is the first place to check whether GitHub could reach your server at all.

### Caddy logs

Depending on your system setup:

```bash
sudo journalctl -u caddy -f
```

### OpenClaw side

Check the OpenClaw gateway/service logs for hook handling and agent wake-up if repo-warden says it forwarded successfully.

---

## 17. Interpreting common outcomes

### Case: GitHub says delivery failed

Likely causes:

- wrong public URL
- DNS/sslip.io hostname typo
- ports 80/443 blocked
- Caddy not running or not reloaded
- TLS issuance failure

Start with:

```bash
curl -i https://<your-host>/healthz
sudo systemctl status caddy
sudo journalctl -u caddy -n 100 --no-pager
```

### Case: GitHub delivery returns 400 from repo-warden

Likely causes:

- wrong webhook secret
- malformed or missing GitHub headers
- unsupported payload shape

Look for `webhook_processing_failed` in repo-warden logs.

### Case: GitHub delivery returns 202 but nothing happens downstream

That usually means the webhook was accepted by the HTTP layer, but then either:

- the event was ignored by normalization/policy
- OpenClaw forwarding failed later

Inspect repo-warden logs for one of these messages:

- event ignored by normalizer
- skipped by policy
- forwarded to OpenClaw

---

## 18. Typical policy and workflow problems

### `repository_not_allowed`

Meaning: the event came from a repository not listed in `GITHUB_ALLOWED_REPOS`.

Fix:

- add the repository full name, for example `owner/repo`
- if multiple repos are allowed, use comma-separated values
- restart the systemd service after changing `.env`

Example:

```dotenv
GITHUB_ALLOWED_REPOS=Artem4590/openclaw-maintenance,Artem4590/repo-warden
```

Then:

```bash
systemctl --user restart repo-warden.service
```

### `trigger_mention_missing`

Meaning: the comment/review body did not include the configured trigger string.

Fix:

- include `@openclaw` in the comment body
- or change `GITHUB_TRIGGER_MENTION` if you intentionally want another trigger

Note that the current match is a simple case-insensitive substring check.

### `sender_not_allowed`

Meaning: `GITHUB_ALLOWED_SENDERS` is configured and the GitHub sender is not in that allowlist.

Fix:

- add the sender login
- or clear `GITHUB_ALLOWED_SENDERS` if you do not want sender filtering

### Regular issue comment vs PR comment

This one matters a lot:

- GitHub uses the `issue_comment` event for both issues and pull requests
- `repo-warden` only accepts `issue_comment` when it belongs to a **pull request**
- a comment on a normal issue is ignored by design

So if someone comments `@openclaw` on a plain issue, nothing will be forwarded.

### Duplicate deliveries

`repo-warden` keeps an in-memory delivery cache for duplicate protection.
Repeated deliveries with the same GitHub delivery id are ignored for about one hour.

This protects against accidental redelivery storms, but the cache is not persistent across process restarts.

---

## 19. Practical update workflow after changes

Whenever you update repo-warden on the server:

```bash
cd ~/repo-warden
git pull --ff-only
npm install
npm run test
npm run check
npm run build
systemctl --user restart repo-warden.service
systemctl --user status repo-warden.service
```

Quick verify afterward:

```bash
curl -i http://127.0.0.1:3000/healthz
curl -i https://repo-warden.203-0-113-10.sslip.io/healthz
```

---

## 20. Minimal deployment checklist

Use this as the shortest possible runbook.

### OpenClaw

- [ ] hooks enabled in `~/.openclaw/openclaw.json`
- [ ] hook token set
- [ ] `/hooks/agent` reachable locally
- [ ] allowed session key prefix includes `hook:`
- [ ] agent id `main` allowed

### repo-warden

- [ ] repo cloned
- [ ] `.env` created from `.env.example`
- [ ] `GITHUB_WEBHOOK_SECRET` set
- [ ] `GITHUB_TRIGGER_MENTION=@openclaw`
- [ ] `GITHUB_ALLOWED_REPOS=Artem4590/openclaw-maintenance`
- [ ] `OPENCLAW_HOOK_URL=http://127.0.0.1:18789/hooks/agent`
- [ ] `OPENCLAW_HOOK_TOKEN` matches OpenClaw
- [ ] `npm run test`
- [ ] `npm run check`
- [ ] `npm run build`
- [ ] user-level systemd service enabled and running

### HTTPS

- [ ] sslip.io hostname resolves to the server
- [ ] Caddy reverse proxy configured
- [ ] `https://<host>/healthz` returns `{"ok":true}`

### GitHub

- [ ] webhook URL points to `/github/webhooks`
- [ ] content type is `application/json`
- [ ] webhook secret matches `.env`
- [ ] subscribed events are limited to the three supported PR-related events
- [ ] test comment contains `@openclaw`

---

## 21. Example deployment values

Example only; replace with your own host and secrets.

```text
Public hostname: repo-warden.203-0-113-10.sslip.io
repo-warden local URL: http://127.0.0.1:3000
GitHub webhook URL: https://repo-warden.203-0-113-10.sslip.io/github/webhooks
OpenClaw hook URL: http://127.0.0.1:18789/hooks/agent
Allowed repo: Artem4590/openclaw-maintenance
Trigger mention: @openclaw
Agent id: main
Session prefix: hook:github
```

---

## 22. Final sanity check

If all pieces are correct, the shortest proof is:

1. `curl https://<host>/healthz` returns `{"ok":true}`
2. GitHub webhook delivery returns `202`
3. repo-warden logs show the event was forwarded to OpenClaw
4. OpenClaw creates or wakes the PR-specific agent session

That is the whole pipeline from public webhook ingress to agent execution.
