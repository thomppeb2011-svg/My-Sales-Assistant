import hashlib
import hmac
import os
import re
import smtplib
import sqlite3
import secrets
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import bcrypt
import jwt
import requests
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from system_prompt import SYSTEM_PROMPT

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# DATA_DIR is separate from BASE_DIR so the database and secret can live on
# a persistent disk (e.g. Render's mounted volume) while the code itself
# sits on the host's ephemeral filesystem, which gets wiped on every deploy.
# Locally this just defaults to the same folder as the code, unchanged.
DATA_DIR = os.environ.get("DATA_DIR", BASE_DIR)
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "data.db")
SECRET_PATH = os.path.join(DATA_DIR, "secret.key")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TOKEN_TTL_DAYS = 365
RESET_CODE_TTL_MINUTES = 30

# DEV_MODE gates anything that would be a security problem in production:
# printing reset codes to the log when email delivery isn't set up/fails.
# Set DEV_MODE=false (or unset it) in your production .env once SMTP is
# reliably configured — a leaked reset code in a real prod log is a real
# account-takeover vector.
DEV_MODE = os.environ.get("DEV_MODE", "true").lower() in ("1", "true", "yes")

# --- Password reset email (SMTP) ---
# Configure these in backend/.env once you have an account to send from
# (e.g. Gmail with an App Password, SendGrid, Mailgun, etc). Until they're
# set, reset codes are written to the server log instead of emailed (only
# while DEV_MODE is on), so you can still test the flow end-to-end.
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER)


def hash_reset_code(code):
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def send_reset_email(to_email, code):
    if not (SMTP_HOST and SMTP_USER and SMTP_PASSWORD):
        if DEV_MODE:
            print(f"[password reset] SMTP not configured — code for {to_email}: {code}", flush=True)
        else:
            print(f"[password reset] SMTP not configured — cannot email {to_email}", flush=True)
        return

    msg = EmailMessage()
    msg["Subject"] = "Your My Sales Assistant password reset code"
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg.set_content(
        f"Your password reset code is: {code}\n\n"
        f"Enter it in the extension to set a new password. "
        f"It expires in {RESET_CODE_TTL_MINUTES} minutes.\n\n"
        f"If you didn't request this, you can ignore this email."
    )

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
    except Exception as e:
        print(f"[password reset] failed to send email to {to_email}: {e}", flush=True)
        if DEV_MODE:
            print(f"[password reset] code for {to_email}: {code}", flush=True)


# --- Anthropic (your key, used for every user's grading call) ---
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = "claude-sonnet-5"

# $ per million tokens — verify against https://anthropic.com/pricing and
# update if it changes; this drives both real cost deduction and the
# estimated-calls figures shown to users.
INPUT_COST_PER_MTOK = 3.00
OUTPUT_COST_PER_MTOK = 15.00

# --- Credit plans ---
# usable_credit is the real Anthropic-dollar budget a purchase unlocks;
# the gap between price_usd and usable_credit is margin. Deduction from a
# user's balance is 1:1 against actual API cost — the markup lives here,
# in how little usable credit a purchase grants, not in a per-call multiplier.
PLANS = {
    "starter": {"id": "starter", "label": "Standard", "price_usd": 4.97, "credit_fraction": 1 / 5},
    "pro": {"id": "pro", "label": "Pro", "price_usd": 19.97, "credit_fraction": 1 / 4},
    # Premium's usable credit is pinned to exactly 3299 tokens ($32.99) rather
    # than the raw 1/3 fraction (which works out to 3266) — everything else
    # about it, including the displayed call estimate, stays as it was.
    "premium": {
        "id": "premium",
        "label": "Premium",
        "price_usd": 97.97,
        "credit_fraction": 1 / 3,
        "credit_usd_override": 32.99,
        "calls_override": (740, 792),
    },
}

# Assumption used only to show an estimated call count per plan — uploaded
# calls are assumed to run 5-10 minutes, at a typical ~150 words/min of
# combined dialogue and ~1.3 tokens/word, on top of the (fairly long)
# grading system prompt.
CALL_MINUTES_LOW = 5
CALL_MINUTES_HIGH = 10
WORDS_PER_MINUTE = 150
TOKENS_PER_WORD = 1.3
AVG_OUTPUT_TOKENS_ESTIMATE = 1500

# User-facing credit unit: everything internally is tracked in real USD
# (credit_balance_usd), but users only ever see "tokens" at a fixed
# 1 token = $0.01 exchange rate — this is a display/branding unit, not the
# literal Anthropic token count.
USD_PER_TOKEN = 0.01


def estimate_cost(input_tokens, output_tokens):
    return (input_tokens / 1_000_000) * INPUT_COST_PER_MTOK + (output_tokens / 1_000_000) * OUTPUT_COST_PER_MTOK


def usd_to_tokens(usd):
    return round(usd / USD_PER_TOKEN)


def _cost_for_call_minutes(minutes):
    transcript_tokens = minutes * WORDS_PER_MINUTE * TOKENS_PER_WORD
    input_tokens = len(SYSTEM_PROMPT) // 4 + transcript_tokens
    return estimate_cost(input_tokens, AVG_OUTPUT_TOKENS_ESTIMATE)


def plan_usable_credit_usd(plan):
    """The actual USD granted on purchase — used for both the advertised
    token figure and the real balance credited, so they always match."""
    if "credit_usd_override" in plan:
        return plan["credit_usd_override"]
    return plan["price_usd"] * plan["credit_fraction"]


def plan_public_view(plan):
    usable_credit = plan_usable_credit_usd(plan)

    if "calls_override" in plan:
        calls_low, calls_high = plan["calls_override"]
    else:
        cost_short_call = _cost_for_call_minutes(CALL_MINUTES_LOW)
        cost_long_call = _cost_for_call_minutes(CALL_MINUTES_HIGH)
        calls_high = int(usable_credit // cost_short_call) if cost_short_call > 0 else 0
        calls_low = int(usable_credit // cost_long_call) if cost_long_call > 0 else 0

    return {
        "id": plan["id"],
        "label": plan["label"],
        "price_usd": plan["price_usd"],
        "credit_tokens": usd_to_tokens(usable_credit),
        "estimated_calls_low": calls_low,
        "estimated_calls_high": calls_high,
    }


def get_jwt_secret():
    env_secret = os.environ.get("JWT_SECRET")
    if env_secret:
        return env_secret

    if os.path.exists(SECRET_PATH):
        with open(SECRET_PATH, "r") as f:
            content = f.read().strip()
        if content:
            return content

    # Write-then-atomically-rename so a concurrent worker process (multiple
    # gunicorn workers all import this module at once) can never observe a
    # half-written or empty file — os.rename is atomic on POSIX. Then
    # re-read the final file rather than trusting our own in-memory value,
    # so every worker converges on whichever secret actually won the race
    # instead of silently running with different secrets from each other.
    new_secret = secrets.token_hex(32)
    tmp_path = f"{SECRET_PATH}.{os.getpid()}.tmp"
    with open(tmp_path, "w") as f:
        f.write(new_secret)
    os.chmod(tmp_path, 0o600)
    os.replace(tmp_path, SECRET_PATH)

    with open(SECRET_PATH, "r") as f:
        return f.read().strip() or new_secret


JWT_SECRET = get_jwt_secret()

app = Flask(__name__)

# ALLOWED_ORIGINS: comma-separated list, e.g.
#   chrome-extension://<your-published-extension-id>
# Defaults to "*" for local development convenience. Lock this down to your
# real extension ID before going live — an open CORS policy lets any
# website's JS call your API using a token it obtained some other way.
_allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "").strip()
ALLOWED_ORIGINS = [o.strip() for o in _allowed_origins_env.split(",") if o.strip()] or "*"
if ALLOWED_ORIGINS == "*":
    print("[security] ALLOWED_ORIGINS not set — CORS is wide open (dev default). Set it before going live.", flush=True)

CORS(app, resources={r"/api/*": {"origins": ALLOWED_ORIGINS}})

limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["200 per hour"],
    storage_uri="memory://",
)


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            credit_balance_usd REAL NOT NULL DEFAULT 0,
            reset_code_hash TEXT,
            reset_code_expires_at TEXT
        )
        """
    )
    conn.commit()
    conn.close()


def make_token(user_id, email):
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token):
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])


def get_authenticated_user():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None, ("Missing or invalid Authorization header", 401)
    token = auth_header.split(" ", 1)[1]
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        return None, ("Session expired, please log in again", 401)
    except jwt.InvalidTokenError:
        return None, ("Invalid session token", 401)

    db = get_db()
    user = db.execute(
        "SELECT id, email, created_at, credit_balance_usd FROM users WHERE id = ?",
        (int(payload["sub"]),),
    ).fetchone()
    if user is None:
        return None, ("User no longer exists", 401)
    return dict(user), None


def user_public_view(user_id, email, credit_balance_usd):
    # The real USD balance never leaves the server — only its token
    # translation does, per the fixed USD_PER_TOKEN rate.
    return {"id": user_id, "email": email, "credit_balance_tokens": usd_to_tokens(credit_balance_usd)}


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/signup", methods=["POST"])
@limiter.limit("10 per hour")
def signup():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not EMAIL_RE.match(email):
        return jsonify({"error": "Enter a valid email address."}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        return jsonify({"error": "An account with that email already exists."}), 409

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    created_at = datetime.now(timezone.utc).isoformat()
    cursor = db.execute(
        "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
        (email, password_hash, created_at),
    )
    db.commit()
    user_id = cursor.lastrowid

    token = make_token(user_id, email)
    return jsonify({"token": token, "user": user_public_view(user_id, email, 0.0)}), 201


@app.route("/api/login", methods=["POST"])
@limiter.limit("15 per 15 minutes")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    db = get_db()
    user = db.execute(
        "SELECT id, email, password_hash, credit_balance_usd FROM users WHERE email = ?", (email,)
    ).fetchone()

    if user is None or not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        return jsonify({"error": "Incorrect email or password."}), 401

    token = make_token(user["id"], user["email"])
    return jsonify({
        "token": token,
        "user": user_public_view(user["id"], user["email"], user["credit_balance_usd"]),
    })


@app.route("/api/forgot-password", methods=["POST"])
@limiter.limit("5 per hour")
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    # Always return the same generic response whether or not the email is
    # registered — this avoids leaking which emails have accounts.
    generic_response = jsonify({
        "message": "If an account exists for that email, a reset code has been sent."
    })

    if not EMAIL_RE.match(email):
        return generic_response

    db = get_db()
    user = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if user is None:
        return generic_response

    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=RESET_CODE_TTL_MINUTES)).isoformat()
    db.execute(
        "UPDATE users SET reset_code_hash = ?, reset_code_expires_at = ? WHERE id = ?",
        (hash_reset_code(code), expires_at, user["id"]),
    )
    db.commit()

    send_reset_email(email, code)
    return generic_response


@app.route("/api/reset-password", methods=["POST"])
@limiter.limit("10 per hour")
def reset_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    code = (data.get("code") or "").strip()
    new_password = data.get("new_password") or ""

    if len(new_password) < 8:
        return jsonify({"error": "New password must be at least 8 characters."}), 400

    db = get_db()
    user = db.execute(
        "SELECT id, reset_code_hash, reset_code_expires_at FROM users WHERE email = ?", (email,)
    ).fetchone()

    invalid_response = jsonify({"error": "That code is invalid or has expired."}), 401
    if user is None or not user["reset_code_hash"] or not user["reset_code_expires_at"]:
        return invalid_response

    if datetime.now(timezone.utc) > datetime.fromisoformat(user["reset_code_expires_at"]):
        return invalid_response

    if not hmac.compare_digest(hash_reset_code(code), user["reset_code_hash"]):
        return invalid_response

    new_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    db.execute(
        "UPDATE users SET password_hash = ?, reset_code_hash = NULL, reset_code_expires_at = NULL WHERE id = ?",
        (new_hash, user["id"]),
    )
    db.commit()

    return jsonify({"ok": True})


@app.route("/api/me", methods=["GET"])
def me():
    user, error = get_authenticated_user()
    if error:
        message, status = error
        return jsonify({"error": message}), status
    # Sliding session: every check-in issues a freshly-dated token, so an
    # active device effectively never gets logged out.
    refreshed_token = make_token(user["id"], user["email"])
    return jsonify({
        "user": user_public_view(user["id"], user["email"], user["credit_balance_usd"]),
        "token": refreshed_token,
    })


@app.route("/api/account/email", methods=["PATCH"])
@limiter.limit("10 per hour")
def change_email():
    user, error = get_authenticated_user()
    if error:
        message, status = error
        return jsonify({"error": message}), status

    data = request.get_json(silent=True) or {}
    new_email = (data.get("new_email") or "").strip().lower()
    password = data.get("password") or ""

    if not EMAIL_RE.match(new_email):
        return jsonify({"error": "Enter a valid email address."}), 400

    db = get_db()
    row = db.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
    if not bcrypt.checkpw(password.encode("utf-8"), row["password_hash"].encode("utf-8")):
        return jsonify({"error": "Incorrect password."}), 401

    existing = db.execute(
        "SELECT id FROM users WHERE email = ? AND id != ?", (new_email, user["id"])
    ).fetchone()
    if existing:
        return jsonify({"error": "That email is already in use."}), 409

    db.execute("UPDATE users SET email = ? WHERE id = ?", (new_email, user["id"]))
    db.commit()

    token = make_token(user["id"], new_email)
    return jsonify({
        "token": token,
        "user": user_public_view(user["id"], new_email, user["credit_balance_usd"]),
    })


@app.route("/api/account/password", methods=["PATCH"])
@limiter.limit("10 per hour")
def change_password():
    user, error = get_authenticated_user()
    if error:
        message, status = error
        return jsonify({"error": message}), status

    data = request.get_json(silent=True) or {}
    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""

    if len(new_password) < 8:
        return jsonify({"error": "New password must be at least 8 characters."}), 400

    db = get_db()
    row = db.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
    if not bcrypt.checkpw(current_password.encode("utf-8"), row["password_hash"].encode("utf-8")):
        return jsonify({"error": "Current password is incorrect."}), 401

    new_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user["id"]))
    db.commit()

    return jsonify({"ok": True})


@app.route("/api/plans", methods=["GET"])
def list_plans():
    return jsonify({"plans": [plan_public_view(p) for p in PLANS.values()]})


@app.route("/api/credits/purchase", methods=["POST"])
@limiter.limit("20 per hour")
def purchase_credits():
    """TEMPORARY / DEV-ONLY: grants credits directly with no real payment.
    This exists so the credits system can be built and tested before Stripe
    Checkout is wired up. It MUST be replaced by a Stripe webhook handler
    (that calls this same crediting logic only after Stripe confirms a
    successful charge) before this ever goes live — as written, anyone
    signed in can grant themselves free credits by calling this endpoint.
    """
    user, error = get_authenticated_user()
    if error:
        message, status = error
        return jsonify({"error": message}), status

    data = request.get_json(silent=True) or {}
    plan_id = data.get("plan_id")
    plan = PLANS.get(plan_id)
    if not plan:
        return jsonify({"error": "Unknown plan."}), 400

    usable_credit = plan_usable_credit_usd(plan)

    db = get_db()
    db.execute(
        "UPDATE users SET credit_balance_usd = credit_balance_usd + ? WHERE id = ?",
        (usable_credit, user["id"]),
    )
    db.commit()
    row = db.execute("SELECT credit_balance_usd FROM users WHERE id = ?", (user["id"],)).fetchone()

    return jsonify({
        "user": user_public_view(user["id"], user["email"], row["credit_balance_usd"]),
    })


@app.route("/api/grade", methods=["POST"])
@limiter.limit("30 per hour")
def grade():
    user, error = get_authenticated_user()
    if error:
        message, status = error
        return jsonify({"error": message}), status

    if not ANTHROPIC_API_KEY:
        return jsonify({"error": "Grading isn't configured on the server yet (missing ANTHROPIC_API_KEY)."}), 500

    if user["credit_balance_usd"] <= 0:
        return jsonify({"error": "You're out of credits. Buy more under Account → Buy Tokens."}), 402

    data = request.get_json(silent=True) or {}
    transcript = (data.get("transcript") or "").strip()
    call_context = (data.get("call_context") or "").strip()
    if not transcript:
        return jsonify({"error": "Missing transcript."}), 400

    user_content = f"Call context: {call_context}\n\nTranscript:\n{transcript}" if call_context else transcript

    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "content-type": "application/json",
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": ANTHROPIC_MODEL,
                "max_tokens": 4096,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": user_content}],
            },
            timeout=120,
        )
    except requests.RequestException:
        return jsonify({"error": "Couldn't reach Claude. Try again in a moment."}), 502

    if resp.status_code != 200:
        detail = resp.text
        try:
            detail = resp.json().get("error", {}).get("message", detail)
        except ValueError:
            pass
        return jsonify({"error": f"Claude API error ({resp.status_code}): {detail}"}), 502

    payload = resp.json()
    output_text = "\n".join(
        block.get("text", "") for block in payload.get("content", []) if block.get("type") == "text"
    )
    usage = payload.get("usage", {})
    input_tokens = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    cost = estimate_cost(input_tokens, output_tokens)

    db = get_db()
    # Floor at 0 — the very last call on a balance can run slightly over
    # since exact cost isn't known until after Claude responds; accepted
    # as a small, bounded loss rather than blocking calls pre-emptively.
    db.execute(
        "UPDATE users SET credit_balance_usd = MAX(0, credit_balance_usd - ?) WHERE id = ?",
        (cost, user["id"]),
    )
    db.commit()
    row = db.execute("SELECT credit_balance_usd FROM users WHERE id = ?", (user["id"],)).fetchone()

    return jsonify({
        "output": output_text,
        "user": user_public_view(user["id"], user["email"], row["credit_balance_usd"]),
    })


# Runs on import, not just under `python3 app.py` — a production WSGI
# server (gunicorn) imports this module and never hits the __main__ guard
# below, so init_db() has to live out here or the users table never gets
# created on a fresh deploy.
init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8787))
    # debug/reloader off: this runs as a long-lived background service now
    # (see backend/start.sh + the LaunchAgent), and the reloader's extra
    # subprocess causes duplicate, hard-to-kill server processes under that setup.
    app.run(host="127.0.0.1", port=port, debug=False)
