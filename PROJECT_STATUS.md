# My Sales Assistant — Project Status

*Last updated: 2026-08-08. This file exists so a fresh conversation (with Claude or anyone else) can pick up context by reading the repo, without needing the original chat history.*

## What this is

An AI sales-transcript grading product, sold as prepaid tokens (no subscription). Two frontends, one backend:

- **Chrome extension** — root of this repo (`manifest.json`, `sidepanel.*`, `config.js`)
- **Website** — `backend/templates/` + `backend/static/` (landing page at `/`, full app at `/app`), served by the same Flask app
- **Backend** — `backend/app.py`, Flask + SQLite, deployed on Render

Both frontends call the same REST API (`/api/*`) — auth, credits, grading, Stripe checkout, password reset, account management, call history.

## Live infrastructure

| What | Where |
|---|---|
| Code | GitHub: `thomppeb2011-svg/My-Sales-Assistant` (private), `main` branch, auto-deploys to Render on push |
| Backend | Render service `my-sales-assistant-backend`, Starter plan + persistent disk for SQLite |
| Live URL | `https://my-sales-assistant-backend.onrender.com` |
| Custom domain | `mysalesassistant.org` (via IONOS) — DNS setup was in progress as of last session; check Render's Custom Domains tab for verification status |
| Payments | **Stripe live-mode keys are active** — real charges are possible, not test mode |
| AI model | Claude (`claude-sonnet-5`), system prompt in `backend/system_prompt.py` (server-side only, never sent to clients) |

## Pending / known open items

- [ ] Confirm `mysalesassistant.org` DNS fully verified in Render (CNAME `www`, A record `@` → `216.24.57.1`)
- [ ] Once verified: update `PUBLIC_BASE_URL` on Render, `config.js`/`manifest.json` in the extension, and the Stripe webhook URL (edit in place, don't recreate — keeps the same signing secret) to use the custom domain
- [ ] Lock down `ALLOWED_ORIGINS` on Render (currently wide-open `*`) — needs the extension's real, permanent Chrome Web Store ID first
- [ ] Submit the extension to the Chrome Web Store ($5 one-time dev fee, privacy policy already hosted at `/privacy`)
- [ ] Clean up leftover test account `web-launch-verify@example.com` on the live database
- [ ] Review/cancel unnecessary bundled subscriptions in the IONOS account (only domain registration is needed)
- [ ] Consider off-Render backups for the production SQLite DB (currently only the hourly local-Mac backup exists for the *local dev* database — the live Render database has no separate backup yet)

## Two separate databases — don't confuse them

- **Local Mac dev backend**: runs via LaunchAgent (`com.mysalesassistant.backend`), own `data.db`, own test data. Thompson's personal account here has an old balance (~69k tokens) from early dev-mode testing.
- **Live Render backend**: separate `data.db` on Render's persistent disk. Thompson's personal account here was deliberately set to exactly **100,000 tokens** as a permanent founder perk (never needs to pay for his own usage) — this is intentional, not a bug, and there's no need to "sync" the two balances.

## Hard-won operational rules (see also Claude's memory on this project)

1. **Never wipe `data.db` wholesale** once it holds a real account — delete specific rows by exact match only. An hourly backup system (`backend/backup_db.sh` + LaunchAgent `com.mysalesassistant.backup`) exists specifically because this went wrong twice during development.
2. **Secrets never go in the chat/conversation** — always pasted directly into `.env` or the Render dashboard.
3. **Temporary admin endpoints** (used a few times for one-off production data fixes) must be removed in the very next deploy after use — never left live.
4. Test locally, deploy, then **verify the live deploy** with a real functional check — this caught two real bugs (a Stripe API compatibility issue, and a `StripeObject.get()` crash in the webhook handler) before they could affect real customers.
