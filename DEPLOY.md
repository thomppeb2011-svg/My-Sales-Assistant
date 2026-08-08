# Deploying the backend to Render

The code is ready — `render.yaml` defines the service, and the backend now
correctly supports a persistent disk (`DATA_DIR`) and multi-worker
production serving (gunicorn). Here's what's left, all one-time manual
steps on your end.

## 1. Push this repo to GitHub

Create a new **private** repo on github.com (don't initialize it with a
README), then:

```bash
cd /Users/thompsonaston/sales-call-grader-extension
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git branch -M main
git push -u origin main
```

## 2. Create a Render account and connect the repo

1. Sign up at [render.com](https://render.com) (free to create an account).
2. Dashboard → **New → Blueprint**.
3. Connect your GitHub account and select the repo you just pushed.
4. Render will detect `render.yaml` automatically and show you the service
   it's about to create (`my-sales-assistant-backend`, a Starter web
   service + a 1GB persistent disk).

## 3. Fill in the secret environment variables

Render will prompt you for the variables marked `sync: false` in
`render.yaml` before it deploys. Fill these in:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your real Anthropic key |
| `JWT_SECRET` | Run `python3 -c "import secrets; print(secrets.token_hex(32))"` locally and paste the output directly into Render's field — don't save it in any file. |
| `ALLOWED_ORIGINS` | Leave blank for now — see step 5 |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Optional, for real password-reset emails. Leave blank to keep the current dev-log fallback. |

Click **Apply** / **Deploy**.

## 4. Get your live URL

Once deployed, Render gives you a URL like:

```
https://my-sales-assistant-backend.onrender.com
```

Test it:
```bash
curl https://my-sales-assistant-backend.onrender.com/api/health
```
Should return `{"status":"ok"}`.

## 5. Point the extension at the real backend

Once you have that URL, tell me and I'll:
- Update `config.js` (`BACKEND_URL`) to the Render URL instead of `127.0.0.1:8787`
- Update `manifest.json` host_permissions to match
- Help you set `ALLOWED_ORIGINS` in Render to your real extension ID (found on the extension's card at `chrome://extensions`), locking CORS down from the wide-open dev default

## Notes

- **Cold starts**: Render's Starter plan doesn't sleep like the free tier does, so this should stay responsive.
- **The persistent disk** means `data.db` survives every redeploy — but it's still only one copy on Render's infrastructure. Worth setting up an off-server backup (e.g., a small script that periodically copies the DB to S3) before you have a lot of real customers depending on it — a good next step, not done yet.
- **DEV_MODE** is set to `false` in `render.yaml` already, so password-reset codes won't get logged in plaintext once this is live — make sure SMTP is configured before real users need password resets, or they'll be stuck.
