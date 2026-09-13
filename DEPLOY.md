# DEPLOY.md

How to run the extension against a backend, and how the backend is
actually deployed for this hackathon. See `FEATURE_PROGRESS.md` Feature 17
for the implementation record; this file is the operational how-to.

## 1. Loading the extension (judges/teammates, no Chrome Web Store)

The Chrome Web Store review process (hours to days, unpredictable) isn't
worth the risk against a hackathon deadline — "load unpacked" is instant
and is the standard way a hackathon extension gets installed:

1. Build the extension (see §3 for which backend URL/token to build against):
   ```
   cd extension && npm run build
   ```
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select `extension/dist`.
5. Open a `leetcode.com/problems/...` page and click **Start AI Interview**.

## 2. Backend deployment: VPS, not a PaaS

Chosen over Cloud Run/Render for a concrete reason, not just preference:
this backend keeps interview session state in-memory, single-process, by
design (`architecture.md` §Q). A PaaS that runs multiple container
instances (Cloud Run's default autoscaling) risks a `session.resume`
landing on a different instance than the one holding that session in
memory — a real correctness bug, not hypothetical. A single always-on VPS
process has none of that risk, no cold starts, and no request-timeout
ceiling to remember to raise for long-lived WebSocket connections.

### Live deployment (this hackathon)

- **Host:** shared VPS at `46.250.244.213` (also runs unrelated projects —
  a landing page, a Laravel app, a trivia app — deployment below is
  additive and doesn't touch any of them).
- **Path on the box:** `/opt/ai-mock-interview/` (`backend/` source +
  `docker-compose.vps.yml`, copied verbatim from the repo — not a
  hand-edited one-off; see below).
- **Container:** `backend/Dockerfile`'s image, run via `docker compose -f
  docker-compose.vps.yml up -d --build`, bound to `127.0.0.1:8000` only (not exposed directly to the
  internet — nginx is the public front door, matching this box's existing
  convention for its other FastAPI app).
- **nginx:** a dedicated vhost (`/etc/nginx/sites-available/ai-mock-interview`,
  `listen 8080`) proxies to `127.0.0.1:8000` with WebSocket upgrade headers
  and a 3600s `proxy_read_timeout`/`proxy_send_timeout` (the default 60s
  would silently kill an idle interview connection). Deliberately a plain
  additional port rather than reusing 80/443, so it can never collide with
  the box's existing `default_server` (which returns 444 for any
  unmatched Host) or other vhosts.
- **Firewall:** `ufw allow 8080/tcp` — the one new rule added; every
  existing rule (22/80/443, and a specific prior IP block) is untouched.
- **Production URL:** `http://46.250.244.213:8080` (`/health` for a quick
  check; `/ws/interview` for the extension). No domain/TLS yet — see §4.

### Auth/rate-limit config actually set on this deployment (Feature 17)

`backend/.env` on the box has:
```
SESSION_SHARED_SECRETS=<generated join code, given separately, not committed>
MAX_CONCURRENT_SESSIONS=5
SESSION_MAX_DURATION_SECONDS=3600
USE_MOCK_PROVIDERS=true   # no real provider keys added yet — see §5
```
Verified live (not just in the test suite): a WebSocket connect with no
token or the wrong token gets rejected before the handshake completes; the
correct token connects normally.

### Reproducing this deployment on a fresh VPS

Every file this needs is checked into the repo — nothing here depends on
looking at what's already running on the live box:

- `backend/` — the app itself.
- `docker-compose.vps.yml` — loopback-only (`127.0.0.1:8000:8000`), for
  running behind an existing reverse proxy. **Not** the same as the root
  `docker-compose.yml`, which binds `8000:8000` (all interfaces) for local
  dev or a directly-exposed deployment — and deliberately a separate
  standalone file rather than a `-f base -f override` overlay: Compose
  merges list-valued keys like `ports` across `-f` files instead of
  replacing them, so combining the two would have published *both*
  bindings at once, silently defeating the loopback-only intent (verified
  empirically with `docker compose config` before picking this shape —
  see the comment in the file itself).
- `deploy/nginx/ai-mock-interview.conf` — the exact vhost this deployment
  uses, verbatim (byte-for-byte what's live on `46.250.244.213` right now).

```bash
# From your local checkout, copy what's needed to the VPS:
rsync -a --exclude .venv --exclude __pycache__ --exclude .pytest_cache \
      --exclude .ruff_cache --exclude .env --exclude tests \
      backend/ root@<vps-host>:/opt/ai-mock-interview/backend/
scp docker-compose.vps.yml root@<vps-host>:/opt/ai-mock-interview/docker-compose.vps.yml
scp deploy/nginx/ai-mock-interview.conf \
    root@<vps-host>:/etc/nginx/sites-available/ai-mock-interview

# On the VPS:
cp .env.example /opt/ai-mock-interview/backend/.env   # then fill in real values
cd /opt/ai-mock-interview && docker compose -f docker-compose.vps.yml up -d --build

ln -sf /etc/nginx/sites-available/ai-mock-interview /etc/nginx/sites-enabled/ai-mock-interview
nginx -t && systemctl reload nginx
ufw allow 8080/tcp   # or whichever port the vhost's `listen` uses
```

Rolling out a code change later: re-run the `rsync` step, then
`docker compose -f docker-compose.vps.yml up -d --build` again —
`restart: unless-stopped` means the container also survives a VPS reboot
on its own without re-running anything.

## 3. Building the extension against the deployed backend

```
# extension/.env (gitignored — never commit this)
VITE_BACKEND_WS_URL=ws://46.250.244.213:8080/ws/interview
VITE_BACKEND_WS_TOKEN=<the join code above>
```
then `npm run --workspace extension build`. The join code is a judges'
invite code, not a provider credential (CLAUDE.md §7 is about
Anthropic/Deepgram/ElevenLabs/Supabase keys, which never leave the
backend) — see `architecture.md` §U for the full reasoning — but it should
still only be shared with people who need to run a real interview session
against the live backend, not posted in the public repo.

For local development against a locally-running backend instead, leave
`extension/.env` unset entirely — it falls back to
`ws://127.0.0.1:8000/ws/interview` with no token, matching a backend
that also has `SESSION_SHARED_SECRETS` unset (today's local-dev default).

## 4. Moving to a real domain + TLS later

`*.housepoints.com.au`'s existing wildcard cert already covers any new
subdomain, so this is cheap when wanted: add a `interview.housepoints.com.au`
DNS record, a new nginx server block (copy `sites-available/trivia`'s
pattern — `listen 443 ssl` with the existing cert paths, redirect 80→443),
rebuild the extension with `VITE_BACKEND_WS_URL=wss://interview.housepoints.com.au/ws/interview`.
No new certbot run needed.

## 5. Adding real provider keys

The live deployment currently runs with `USE_MOCK_PROVIDERS=true` (no
Anthropic/Deepgram/ElevenLabs keys were shared into this deployment).  To
switch to real providers: SSH in, edit `/opt/ai-mock-interview/backend/.env`
with the real keys and `USE_MOCK_PROVIDERS=false`, then
`docker compose -f docker-compose.vps.yml restart backend` from
`/opt/ai-mock-interview`.
