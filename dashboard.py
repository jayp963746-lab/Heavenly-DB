"""
dashboard.py — Flask API backing the Heavenly web dashboard.

main-5.py already does:
    from dashboard import app as dashboard_app
    serve(dashboard_app, host="0.0.0.0", port=port, _quiet=True)

so this file just needs to define `app`. It reads/writes the SAME sqlite
file the bot uses (bot.db, WAL mode — see init_db() in main-5.py), and
talks to the running bot for live data (member counts, channel/role
lists) via asyncio.run_coroutine_threadsafe, since Flask runs on its own
thread while discord.py owns the event loop.

Wiring it up — add ONE line to main-5.py, right before the dashboard
thread starts:

    def run_dashboard_in_thread():
        from dashboard import app as dashboard_app
        import dashboard
        dashboard.set_bot(bot)          # <-- add this line
        serve(dashboard_app, host="0.0.0.0", port=port, _quiet=True)

That gives this module a live reference to the bot so /api/guilds,
/api/guild/<id>/overview, /channels and /roles can return real data.
Everything else (config reads/writes) works off bot.db directly and
needs no bot reference at all.

Optional: set DASHBOARD_API_KEY in your .env to require an
`X-API-Key` header on every request (used for server-to-server calls;
browser sessions from Discord login bypass this — see the OAuth2
section below). Leave DASHBOARD_API_KEY unset while developing.

── Discord OAuth2 ───────────────────────────────────────────────────────────
Set these env vars (from your app at discord.com/developers/applications,
OAuth2 tab):
    DISCORD_CLIENT_ID
    DISCORD_CLIENT_SECRET
    DISCORD_REDIRECT_URI     e.g. https://your-app.onrender.com/callback
    FLASK_SECRET_KEY         any long random string — signs the session cookie
Add DISCORD_REDIRECT_URI as a Redirect under OAuth2 → Redirects in the
Discord dev portal, or login will fail with "Invalid OAuth2 redirect_uri".

Flow: browser hits /login → Discord consent → /callback exchanges the
code, fetches the user + their guilds, keeps only guilds where the user
has Manage Server (or Administrator) AND the bot is also present, and
stores that in a signed session cookie. No user tokens or extra tables
are stored server-side — the cookie *is* the session.

── Serving the frontend ─────────────────────────────────────────────────
This same Flask app also serves the built React dashboard (frontend/dist,
built by `npm run build`), so the whole thing — bot, API, and UI — is ONE
deployable service on ONE origin. No separate frontend host, no CORS to
configure.
"""

import os
import json
import secrets
import sqlite3
import asyncio
from datetime import datetime, timezone
from functools import wraps
from urllib.parse import urlencode

import requests
from flask import Flask, jsonify, request, g, session, redirect, send_from_directory

DB_PATH = os.getenv("BOT_DB_PATH", "bot.db")
API_KEY = os.getenv("DASHBOARD_API_KEY")  # optional shared secret, for server-to-server calls

DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI")

MANAGE_GUILD = 0x20
ADMINISTRATOR = 0x8

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")

app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path="")
app.secret_key = os.getenv("FLASK_SECRET_KEY", secrets.token_hex(32))
app.config.update(
    SESSION_COOKIE_SAMESITE="Lax",   # same-origin now — no cross-site cookie needed
    SESSION_COOKIE_SECURE=os.getenv("RENDER") is not None,  # HTTPS on Render, plain HTTP OK for local dev
)

# ── bot reference, set from main-5.py at startup ────────────────────────────
_bot = None


def set_bot(bot_instance):
    global _bot
    _bot = bot_instance


def run_on_bot(coro, timeout=5, default=None):
    """Run a coroutine on the bot's event loop from this Flask thread."""
    if _bot is None or _bot.loop is None or not _bot.loop.is_running():
        return default
    fut = asyncio.run_coroutine_threadsafe(coro, _bot.loop)
    try:
        return fut.result(timeout=timeout)
    except Exception:
        return default


# ── known slash-command roots, for the Commands page ────────────────────────
# (root name -> label/description shown in the UI). Matches the
# app_commands.Group / bot.tree.command roots defined in main-5.py.
KNOWN_COMMANDS = [
    ("welcome", "Configure and preview the welcome message"),
    ("leave", "Configure leave messages"),
    ("setlogchannel", "Set the server event log channel"),
    ("automod", "Auto-moderation (banned words, invite blocking)"),
    ("antinuke", "Anti-nuke protection"),
    ("antiraid", "Anti-raid protection"),
    ("tag", "Custom tags / canned responses"),
    ("reactionrole", "Reaction roles"),
    ("whitelist", "Temporary moderator grants"),
    ("kick", "Kick a member"),
    ("ban", "Ban a member"),
    ("unban", "Unban a user by ID"),
    ("mute", "Timeout a member"),
    ("unmute", "Remove a timeout"),
    ("warn", "Warn a member"),
    ("warnings", "View a member's warnings"),
    ("warnings-clear", "Clear a member's warnings"),
    ("clear", "Bulk delete messages"),
    ("rpg", "RPG adventure game"),
    ("autorole", "Role given automatically on join"),
    ("role", "Give/take roles manually"),
    ("giveaway", "Giveaways"),
    ("afk", "AFK status"),
]

# ── db helpers ────────────────────────────────────────────────────────────
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


# ── auth ─────────────────────────────────────────────────────────────────
PUBLIC_PATHS = {"/api/health", "/login", "/callback", "/logout"}


@app.before_request
def check_access():
    if not request.path.startswith("/api/") and request.path not in PUBLIC_PATHS:
        return  # let static frontend files (and the SPA catch-all) through
    if request.path in PUBLIC_PATHS:
        return
    # server-to-server calls (a shared secret, no browser session)
    if API_KEY and request.headers.get("X-API-Key") == API_KEY:
        return
    # browser calls — require a Discord login
    if not session.get("user"):
        return jsonify({"error": "unauthorized", "login_url": "/login"}), 401
    # if the route touches one guild, make sure this user can manage it
        guild_id = request.view_args.get("guild_id") if request.view_args else None
    if guild_id is not None:
        target_id_str = str(guild_id)
        allowed_ids = {
            str(g_item["id"])
            for g_item in session.get("guilds", [])
            if isinstance(g_item, dict) and "id" in g_item
        }
        if target_id_str not in allowed_ids:
            return jsonify({"error": "forbidden — you don't manage this server"}), 403
            

# ── serve the built React app ───────────────────────────────────────────
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path and os.path.exists(os.path.join(FRONTEND_DIST, path)):
        return send_from_directory(FRONTEND_DIST, path)
    return send_from_directory(FRONTEND_DIST, "index.html")


# ── Discord OAuth2 ───────────────────────────────────────────────────────
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
    return redirect(f"https://discord.com/api/oauth2/authorize?{urlencode(params)}")


@app.route("/callback")
def callback():
    if request.args.get("state") != session.pop("oauth_state", None):
        return jsonify({"error": "invalid oauth state"}), 400
    code = request.args.get("code")
    if not code:
        return jsonify({"error": request.args.get("error", "missing code")}), 400

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
    access_token = token_res.json()["access_token"]
    auth_header = {"Authorization": f"Bearer {access_token}"}

    me = requests.get("https://discord.com/api/users/@me", headers=auth_header, timeout=10).json()
    my_guilds = requests.get("https://discord.com/api/users/@me/guilds", headers=auth_header, timeout=10).json()


    bot_guilds_live = run_on_bot(_bot_guilds(), default=None)
    if bot_guilds_live is not None:
        bot_guild_ids = {g_["id"] for g_ in bot_guilds_live}
    else:
        db = get_db()
        rows = db.execute("SELECT guild_id FROM guild_config").fetchall()
        bot_guild_ids = {r["guild_id"] for r in rows}

        manageable = []    
    for g_ in my_guilds:    
        perms = int(g_.get("permissions", 0))        
        is_owner = bool(g_.get("owner"))        
        has_admin = bool(perms & ADMINISTRATOR)                
        has_manage = bool(perms & MANAGE_GUILD)        
        if is_owner or has_admin or has_manage:        
            icon = (            
                f"https://cdn.discordapp.com/icons/{g_['id']}/{g_['icon']}.png"
                if g_.get("icon") else None
            )
            manageable.append({"id": int(g_["id"]), "name": g_["name"], "icon_url": icon})
            

    session["user"] = {
        "id": me["id"],
        "username": me["username"],
        "avatar_url": (
            f"https://cdn.discordapp.com/avatars/{me['id']}/{me['avatar']}.png"
            if me.get("avatar") else None
        ),
    }
    session["guilds"] = manageable
    return redirect("/")


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/me")
def api_me():
    if not session.get("user"):
        return jsonify({"user": None, "guilds": []})
    return jsonify({"user": session["user"], "guilds": session.get("guilds", [])})


# ── generic single-row-per-guild config table (guild_config, antinuke_config,
#    antiraid_config all follow this shape: guild_id PRIMARY KEY + columns) ──
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
    db.execute(
        f"UPDATE {table} SET {set_clause} WHERE guild_id=?",
        (*fields.values(), guild_id),
    )
    db.commit()
    return get_config_row(table, guild_id)


# ── live discord data (via the running bot) ─────────────────────────────────
async def _guild_snapshot(guild_id):
    guild = _bot.get_guild(guild_id)
    if guild is None:
        return None
    return {
        "id": guild.id,
        "name": guild.name,
        "icon_url": guild.icon.url if guild.icon else None,
        "member_count": guild.member_count,
    }


async def _guild_channels(guild_id):
    guild = _bot.get_guild(guild_id)
    if guild is None:
        return []
    return [
        {"id": c.id, "name": c.name}
        for c in guild.text_channels
    ]


async def _guild_roles(guild_id):
    guild = _bot.get_guild(guild_id)
    if guild is None:
        return []
    return [
        {"id": r.id, "name": r.name, "color": str(r.color)}
        for r in reversed(guild.roles)
        if r.name != "@everyone"
    ]


async def _bot_guilds():
    if _bot is None:
        return []
    return [
        {
            "id": g_.id,
            "name": g_.name,
            "icon_url": g_.icon.url if g_.icon else None,
            "member_count": g_.member_count,
        }
        for g_ in _bot.guilds
    ]


# ── routes: guild list & overview ───────────────────────────────────────────
@app.route("/api/guilds")
def api_guilds():
    """Servers the logged-in user can manage AND the bot is in — same list
    as /api/me returns, kept as its own endpoint for convenience."""
    return jsonify(session.get("guilds", []))


@app.route("/api/guild/<int:guild_id>/overview")
def api_overview(guild_id):
    db = get_db()
    warning_count = db.execute(
        "SELECT COUNT(*) c FROM warnings WHERE guild_id=?", (guild_id,)
    ).fetchone()["c"]
    rpg_count = db.execute(
        "SELECT COUNT(*) c FROM rpg_characters WHERE guild_id=?", (guild_id,)
    ).fetchone()["c"]
    active_giveaways = db.execute(
        "SELECT COUNT(*) c FROM giveaways WHERE guild_id=? AND ended=0", (guild_id,)
    ).fetchone()["c"]
    open_tags = db.execute(
        "SELECT COUNT(*) c FROM tags WHERE guild_id=?", (guild_id,)
    ).fetchone()["c"]

    config = get_config_row("guild_config", guild_id)
    antinuke = get_config_row("antinuke_config", guild_id)
    antiraid = get_config_row("antiraid_config", guild_id)

    live = run_on_bot(_guild_snapshot(guild_id), default=None) or {
        "id": guild_id, "name": None, "icon_url": None, "member_count": None,
    }

    return jsonify({
        **live,
        "warning_count": warning_count,
        "rpg_count": rpg_count,
        "active_giveaways": active_giveaways,
        "tag_count": open_tags,
        "automod_on": bool(config["automod_enabled"]),
        "antinuke_on": bool(antinuke["enabled"]),
        "antiraid_on": bool(antiraid["enabled"]),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/api/guild/<int:guild_id>/channels")
def api_channels(guild_id):
    return jsonify(run_on_bot(_guild_channels(guild_id), default=[]))


@app.route("/api/guild/<int:guild_id>/roles")
def api_roles(guild_id):
    return jsonify(run_on_bot(_guild_roles(guild_id), default=[]))


# ── general config (welcome / leave / log channel / autorole) ───────────────
@app.route("/api/guild/<int:guild_id>/config", methods=["GET", "PUT"])
def api_config(guild_id):
    if request.method == "PUT":
        return jsonify(update_config_row("guild_config", guild_id, request.get_json(force=True) or {}))
    return jsonify(get_config_row("guild_config", guild_id))


# ── automod (flags live in guild_config; word list is its own table) ────────
@app.route("/api/guild/<int:guild_id>/automod", methods=["GET", "PUT"])
def api_automod(guild_id):
    if request.method == "PUT":
        body = request.get_json(force=True) or {}
        allowed = {k: v for k, v in body.items() if k in {"automod_enabled", "block_invites", "block_staff_mentions"}}
        config = update_config_row("guild_config", guild_id, allowed)
    else:
        config = get_config_row("guild_config", guild_id)

    db = get_db()
    words = [
        r["word"] for r in db.execute(
            "SELECT word FROM banned_words WHERE guild_id=? ORDER BY word", (guild_id,)
        ).fetchall()
    ]
    return jsonify({
        "automod_enabled": bool(config["automod_enabled"]),
        "block_invites": bool(config["block_invites"]),
        "block_staff_mentions": bool(config["block_staff_mentions"]),
        "banned_words": words,
    })


@app.route("/api/guild/<int:guild_id>/automod/words", methods=["POST"])
def api_add_word(guild_id):
    word = (request.get_json(force=True) or {}).get("word", "").strip().lower()
    if not word:
        return jsonify({"error": "word required"}), 400
    db = get_db()
    db.execute("INSERT OR IGNORE INTO banned_words (guild_id, word) VALUES (?,?)", (guild_id, word))
    db.commit()
    return jsonify({"ok": True, "word": word})


@app.route("/api/guild/<int:guild_id>/automod/words/<word>", methods=["DELETE"])
def api_remove_word(guild_id, word):
    db = get_db()
    db.execute("DELETE FROM banned_words WHERE guild_id=? AND word=?", (guild_id, word.lower()))
    db.commit()
    return jsonify({"ok": True})


# ── antinuke / antiraid ──────────────────────────────────────────────────────
@app.route("/api/guild/<int:guild_id>/antinuke", methods=["GET", "PUT"])
def api_antinuke(guild_id):
    if request.method == "PUT":
        return jsonify(update_config_row("antinuke_config", guild_id, request.get_json(force=True) or {}))
    return jsonify(get_config_row("antinuke_config", guild_id))


@app.route("/api/guild/<int:guild_id>/antiraid", methods=["GET", "PUT"])
def api_antiraid(guild_id):
    if request.method == "PUT":
        return jsonify(update_config_row("antiraid_config", guild_id, request.get_json(force=True) or {}))
    return jsonify(get_config_row("antiraid_config", guild_id))


# ── warnings (read-only from the dashboard; issued via /warn in Discord) ────
@app.route("/api/guild/<int:guild_id>/warnings")
def api_warnings(guild_id):
    db = get_db()
    limit = int(request.args.get("limit", 25))
    rows = db.execute(
        "SELECT id, user_id, reason, created_at FROM warnings WHERE guild_id=? ORDER BY id DESC LIMIT ?",
        (guild_id, limit),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


# ── command_settings (per-server enable/disable + role gating) ──────────────
@app.route("/api/guild/<int:guild_id>/commands", methods=["GET", "PUT"])
def api_commands(guild_id):
    db = get_db()
    if request.method == "PUT":
        body = request.get_json(force=True) or {}
        for item in body.get("commands", []):
            name = item.get("command_name")
            if name not in {c[0] for c in KNOWN_COMMANDS}:
                continue
            db.execute(
                """INSERT INTO command_settings (guild_id, command_name, enabled, allowed_role_ids)
                   VALUES (?,?,?,?)
                   ON CONFLICT(guild_id, command_name)
                   DO UPDATE SET enabled=excluded.enabled, allowed_role_ids=excluded.allowed_role_ids""",
                (
                    guild_id,
                    name,
                    1 if item.get("enabled", True) else 0,
                    json.dumps(item.get("allowed_role_ids", [])),
                ),
            )
        db.commit()

    rows = {
        r["command_name"]: r
        for r in db.execute(
            "SELECT command_name, enabled, allowed_role_ids FROM command_settings WHERE guild_id=?",
            (guild_id,),
        ).fetchall()
    }
    result = []
    for name, desc in KNOWN_COMMANDS:
        row = rows.get(name)
        result.append({
            "command_name": name,
            "description": desc,
            "enabled": bool(row["enabled"]) if row else True,
            "allowed_role_ids": json.loads(row["allowed_role_ids"]) if row and row["allowed_role_ids"] else [],
        })
    return jsonify(result)


# ── reaction roles ────────────────────────────────────────────────────────
@app.route("/api/guild/<int:guild_id>/reaction-roles", methods=["GET", "POST"])
def api_reaction_roles(guild_id):
    db = get_db()
    if request.method == "POST":
        body = request.get_json(force=True) or {}
        message_id, emoji, role_id = body.get("message_id"), body.get("emoji"), body.get("role_id")
        if not (message_id and emoji and role_id):
            return jsonify({"error": "message_id, emoji, role_id required"}), 400
        db.execute(
            "INSERT OR REPLACE INTO reaction_roles (message_id, emoji, role_id, guild_id) VALUES (?,?,?,?)",
            (message_id, emoji, role_id, guild_id),
        )
        db.commit()

    rows = db.execute(
        "SELECT message_id, emoji, role_id FROM reaction_roles WHERE guild_id=?", (guild_id,)
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/guild/<int:guild_id>/reaction-roles/<int:message_id>/<path:emoji>", methods=["DELETE"])
def api_delete_reaction_role(guild_id, message_id, emoji):
    db = get_db()
    db.execute(
        "DELETE FROM reaction_roles WHERE guild_id=? AND message_id=? AND emoji=?",
        (guild_id, message_id, emoji),
    )
    db.commit()
    return jsonify({"ok": True})


# ── tags ──────────────────────────────────────────────────────────────────
@app.route("/api/guild/<int:guild_id>/tags")
def api_tags(guild_id):
    db = get_db()
    rows = db.execute(
        "SELECT name, content, creator_id FROM tags WHERE guild_id=? ORDER BY name", (guild_id,)
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/health")
def api_health():
    return jsonify({"ok": True, "bot_connected": _bot is not None and _bot.loop is not None and _bot.loop.is_running()})


if __name__ == "__main__":
    # standalone dev run (no live bot data — /channels, /roles, /guilds will be empty)
    app.run(port=5000, debug=True)
