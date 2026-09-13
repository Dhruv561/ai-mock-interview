# DEPLOY.md

How to run the extension against a backend, and how the backend is
actually deployed for this hackathon. See `FEATURE_PROGRESS.md` Feature 19
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

### Auth/rate-limit config actually set on this deployment (Feature 19)

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

## 3. Building and running the extension against the deployed (hosted) backend

The default pipeline (ElevenLabs Conversational AI, `content/App.tsx`'s
`ConvaiApp` — see `architecture.md` §5) talks to the backend over plain
REST (`backend/app/api/convai.py`), not the WebSocket §2 describes — that
WS is only used by the deprecated legacy pipeline
(`VITE_USE_LEGACY_PIPELINE=true`). So pointing the extension at the hosted
VPS instead of your own `localhost:8000` needs `VITE_BACKEND_HTTP_URL`,
not `VITE_BACKEND_WS_URL` — easy to reach for the wrong one since §2's URL
(`http://46.250.244.213:8080`) *looks* like it should be the WS var.

1. **Get the join code.** It's `SESSION_SHARED_SECRETS` in the VPS's
   `backend/.env` (`ssh root@46.250.244.213 grep SESSION_SHARED_SECRETS
   /opt/ai-mock-interview/backend/.env` if you have box access; otherwise
   ask whoever deployed it). Not a provider credential (CLAUDE.md §7 is
   about Anthropic/Deepgram/ElevenLabs/Supabase keys, which never leave
   the backend either way — see `architecture.md` §U) but still only
   share it with people who should be able to run a real interview
   session against the live backend, not post it in the public repo.

2. **Write `extension/.env`** (gitignored — never commit this):
   ```
   VITE_BACKEND_HTTP_URL=http://46.250.244.213:8080
   VITE_BACKEND_WS_TOKEN=<the join code>
   ```
   (If you specifically want to test the deprecated legacy pipeline
   against the hosted backend instead, also set
   `VITE_USE_LEGACY_PIPELINE=true` and `VITE_BACKEND_WS_URL=ws://46.250.244.213:8080/ws/interview` —
   both URL vars, since that pipeline uses the WS while the default one
   uses HTTP.)

3. **Build:**
   ```
   cd extension && npm run build
   ```

4. **Load it as its own, separate Chrome instance** rather than reusing
   your local-backend dev profile — otherwise you'll have two builds
   fighting over the same `chrome://extensions` unpacked-extension slot
   and easily forget which one is currently loaded:
   ```
   mkdir -p /tmp/chrome-vps-profile
   google-chrome \
     --user-data-dir=/tmp/chrome-vps-profile \
     --load-extension=extension/dist \
     --disable-extensions-except=extension/dist \
     "https://leetcode.com/problems/two-sum/"
   ```
   (Or just `chrome://extensions` → Developer mode → Load unpacked →
   `extension/dist`, same as §1, in whatever browser/profile you're
   already using — the separate profile above is only to avoid the
   "which build is this?" confusion when a local-backend build is also
   in play.)

5. **Verify you're actually talking to the VPS, not localhost:** open the
   extension's background service worker console
   (`chrome://extensions` → the extension card → "service worker" link)
   and check outgoing requests hit `46.250.244.213:8080`, not
   `127.0.0.1:8000` — or just watch `ssh root@46.250.244.213 docker logs
   -f ai-mock-interview-backend-1` on the VPS while you click **Start AI
   Interview** and confirm a request actually lands there.

For local development against a locally-running backend instead, leave
`extension/.env` unset entirely — `VITE_BACKEND_HTTP_URL` falls back to
`http://127.0.0.1:8000` with no token, matching a backend that also has
`SESSION_SHARED_SECRETS` unset (today's local-dev default).

## 4. Moving to a real domain + TLS later

`*.housepoints.com.au`'s existing wildcard cert already covers any new
subdomain, so this is cheap when wanted: add a `interview.housepoints.com.au`
DNS record, a new nginx server block (copy `sites-available/trivia`'s
pattern — `listen 443 ssl` with the existing cert paths, redirect 80→443),
rebuild the extension with `VITE_BACKEND_WS_URL=wss://interview.housepoints.com.au/ws/interview`.
No new certbot run needed.

## 5. Adding real provider keys

**Done (2026-09-13) — the live deployment now runs with real provider
keys**, not mock: `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`,
`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_CONVAI_AGENT_ID`,
and `USE_MOCK_PROVIDERS=false` are all set in
`/opt/ai-mock-interview/backend/.env` on the box. Verified live: `GET
/health` reports `"mock_providers":"False"`, and a real `GET
/api/convai/signed-url` round-trips to the actual ElevenLabs API and
returns a genuine `wss://` signed URL — same as `.env` on a local
checkout would need, matching the deploy notes just below it.

**Doing this again on a fresh deployment, or rotating keys:** SSH in,
edit `/opt/ai-mock-interview/backend/.env` with the real keys — note
`ELEVENLABS_CONVAI_AGENT_ID` isn't in `backend/.env.example`'s original
list and won't exist on an older deployment's `.env` at all; without it
`/api/convai/signed-url` returns a clear "not configured" error rather
than failing silently (`backend/app/api/convai.py`) — then from
`/opt/ai-mock-interview`:
```
docker compose -f docker-compose.vps.yml up -d
```
**Not `restart`** — `env_file` values are baked in at container
*creation*, so `docker compose restart` silently keeps serving the old
environment (this bit us the first time: `/health` kept reporting
`mock_providers: True` immediately after a `restart` despite the `.env`
already being correct on disk). `up -d` recreates the container with the
current `.env`/image, which is what actually picks up the change; add
`--build` too if the image itself also needs rebuilding (a code change,
not just an env change).
