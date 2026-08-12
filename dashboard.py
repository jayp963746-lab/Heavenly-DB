import os
import sqlite3
import secrets
import requests
from flask import Flask, jsonify, request, session, redirect, send_from_directory, g
from werkzeug.middleware.proxy_fix import ProxyFix

# Attempt to import bot helpers if available in main.py
try:
    from main import run_on_bot, _bot_guilds, DB_PATH
except Exception:
    DB_PATH = os.getenv("DB_PATH", "database.db")

    def run_on_bot(coro, default=None):
        return default

    def _bot_guilds():
        return None

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")

DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")
DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI", "")
API_KEY = os.getenv("DASHBOARD_API_KEY", "")

MANAGE_GUILD = 0x20
ADMINISTRATOR = 0x8

app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path="")
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Session configuration optimized for Render and mobile browsers
app.secret_key = os.getenv("FLASK_SECRET_KEY", "heavenly_permanent_secret_key_2026")
app.config["SESSION_COOKIE_NAME"] = "heavenly_session"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SECURE"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = 86400 * 7


# Database Helpers
def get_db():
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=5)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.row_factory = sqlite3.Row
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def row_to_dict(row):
    return dict(row) if row else None


# Middleware & Permissions
PUBLIC_PATHS = {"/api/health", "/login", "/callback", "/logout"}


@app.before_request
def check_access():
    if not request.path.startswith("/api/") and request.path not in PUBLIC_PATHS:
        return

    if request.path in PUBLIC_PATHS:
        return

    if API_KEY and request.headers.get("X-API-Key") == API_KEY:
        return

    if not session.get("user"):
        return jsonify({"error": "unauthorized", "login_url": "/login"}), 401

    guild_id = request.view_args.get("guild_id") if request.view_args else None
    if guild_id is not None:
        target_id_str = str(guild_id)
        allowed_ids = {
            str(g_item["id"])
            for g_item in session.get("guilds", [])
            if isinstance(g_item, dict) and "id" in g_item
        }
        if target_id_str not in allowed_ids:
            return jsonify({"error": "forbidden - you don't manage this server"}), 403


# Frontend Serving
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path and os.path.exists(os.path.join(FRONTEND_DIST, path)):
        return send_from_directory(FRONTEND_DIST, path)
    return send_from_directory(FRONTEND_DIST, "index.html")


# Discord OAuth Routes
@app.route("/login")
def login():
    state = secrets.token_urlsafe(16)
    session["oauth_state"] = state
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": "identify guilds",
        "state": state,
        "prompt": "none",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return redirect(f"https://discord.com/api/oauth2/authorize?{query}")


@app.route("/callback")
def callback():
    code = request.args.get("code")
    if not code:
        return jsonify({"error": "missing code"}), 400

    token_res = requests.post(
        "https://discord.com/api/oauth2/token",
        data={
            "client_id": DISCORD_CLIENT_ID,
            "client_secret": DISCORD_CLIENT_SECRET,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": DISCORD_REDIRECT_URI,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    if not token_res.ok:
        return jsonify({"error": "token exchange failed", "detail": token_res.text}), 400

    access_token = token_res.json().get("access_token")
    auth_header = {"Authorization": f"Bearer {access_token}"}

    me_res = requests.get("https://discord.com/api/users/@me", headers=auth_header, timeout=10)
    guilds_res = requests.get("https://discord.com/api/users/@me/guilds", headers=auth_header, timeout=10)

    if not me_res.ok or not guilds_res.ok:
        return jsonify({"error": "Failed to fetch data from Discord API"}), 400

    me = me_res.json()
    my_guilds = guilds_res.json()

    if not isinstance(my_guilds, list):
        return jsonify({"error": "Rate limited by Discord. Try again in 1 minute."}), 429

    manageable = []
    for g_ in my_guilds:
        if not isinstance(g_, dict):
            continue
        perms = int(g_.get("permissions", 0))
        is_owner = bool(g_.get("owner"))
        can_manage = is_owner or bool(perms & MANAGE_GUILD) or bool(perms & ADMINISTRATOR)
        if can_manage:
            icon = (
                f"https://cdn.discordapp.com/icons/{g_['id']}/{g_['icon']}.png"
                if g_.get("icon") else None
            )
            manageable.append({
                "id": str(g_["id"]),
                "name": str(g_.get("name", "Unknown")),
                "icon_url": icon
            })

    session.permanent = True
    session["user"] = {
        "id": str(me.get("id")),
        "username": me.get("username", "User"),
        "avatar_url": (
            f"https://cdn.discordapp.com/avatars/{me['id']}/{me['avatar']}.png"
            if me.get("avatar") else None
        ),
    }
    session["guilds"] = manageable
    session.modified = True
    return redirect("/")


@app.route("/logout", methods=["GET", "POST"])
def logout():
    session.clear()
    if request.method == "POST":
        return jsonify({"ok": True})
    return redirect("/login")


# API Endpoints
def _get_filtered_guilds():
    user_guilds = session.get("guilds", [])
    bot_guilds_live = run_on_bot(_bot_guilds(), default=None)
    if bot_guilds_live is not None:
        bot_ids = {str(g_["id"]) for g_ in bot_guilds_live}
        return [g for g in user_guilds if str(g["id"]) in bot_ids]
    return user_guilds


@app.route("/api/me")
def api_me():
    if not session.get("user"):
        return jsonify({"user": None, "guilds": []})
    return jsonify({
        "user": session["user"],
        "guilds": _get_filtered_guilds()
    })


@app.route("/api/guilds")
def api_guilds():
    return jsonify(_get_filtered_guilds())


@app.route("/api/health")
def api_health():
    return jsonify({"status": "ok"})


def get_config_row(table, guild_id):
    db = get_db()
    db.execute(f"INSERT OR IGNORE INTO {table} (guild_id) VALUES (?)", (guild_id,))
    db.commit()
    row = db.execute(f"SELECT * FROM {table} WHERE guild_id=?", (guild_id,)).fetchone()
    return row_to_dict(row)


def update_config_row(table, guild_id, fields: dict):
    if not fields:
        return get_config_row(table, guild_id)
    db = get_db()
    cols = db.execute(f"PRAGMA table_info({table})").fetchall()
    valid_cols = {c["name"] for c in cols} - {"guild_id"}
    fields = {k: v for k, v in fields.items() if k in valid_cols}
    if not fields:
        return get_config_row(table, guild_id)
    db.execute(f"INSERT OR IGNORE INTO {table} (guild_id) VALUES (?)", (guild_id,))
    set_clause = ", ".join(f"{k}=?" for k in fields)
    db.execute(f"UPDATE {table} SET {set_clause} WHERE guild_id=?", (*fields.values(), guild_id))
    db.commit()
    return get_config_row(table, guild_id)
