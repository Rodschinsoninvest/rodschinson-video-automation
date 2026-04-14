"""
Rodschinson Content Studio — FastAPI Backend
"""
import asyncio
import html as html_mod
import io
import json
import os
import re
import smtplib
import sys
import uuid
import zipfile
import logging
from datetime import datetime, timezone
from email.mime.text import MIMEText
from pathlib import Path
from typing import Optional

import aiofiles
import httpx
from dotenv import load_dotenv
import base64
import hashlib
import secrets
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Query, Request, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

# ── Paths ──────────────────────────────────────────────────────────────────────
_local_default = Path.home() / "rodschinson" / "video_automation"
ROOT     = Path(os.getenv("PROJECT_ROOT", str(_local_default)))
PYTHON   = Path(os.getenv("PYTHON_BIN",
               str(Path.home() / "rodschinson-venv311" / "bin" / "python")
               if not os.getenv("PROJECT_ROOT") else sys.executable))
SCRIPTS  = ROOT / "scripts"
PUPPET   = ROOT / "puppeteer"
OUTPUT   = ROOT / "output"
JOBS_DIR = OUTPUT / "jobs"
JOBS_DIR.mkdir(parents=True, exist_ok=True)
LIBRARY_FILE   = OUTPUT / "library.json"
SCHEDULE_FILE  = OUTPUT / "schedule.json"
TEMPLATES_FILE = OUTPUT / "brief_templates.json"
BRANDS_FILE          = OUTPUT / "brands.json"
BRAND_LOGOS          = OUTPUT / "images" / "brands"
BRAND_LOGOS.mkdir(parents=True, exist_ok=True)
CUSTOM_TEMPLATES_FILE = OUTPUT / "custom_templates.json"
CUSTOM_TMPL_DIR       = PUPPET / "templates" / "custom"
CUSTOM_TMPL_DIR.mkdir(parents=True, exist_ok=True)
TEMPLATE_REGISTRY     = PUPPET / "template_registry.json"  # consumed by renderer.js
USERS_FILE            = OUTPUT / "users.json"
COMMENTS_FILE         = OUTPUT / "comments.json"
SERIES_FILE           = OUTPUT / "series.json"
STRATEGY_FILE         = OUTPUT / "strategy.json"
AB_TESTS_FILE         = OUTPUT / "ab_tests.json"
ASSETS_DIR            = OUTPUT / "assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
ASSETS_FILE           = OUTPUT / "assets.json"
PROPERTIES_FILE       = OUTPUT / "properties.json"
TEASER_DIR            = OUTPUT / "teaser"
TEASER_DIR.mkdir(parents=True, exist_ok=True)

load_dotenv(ROOT / ".env", override=False)

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("studio")

# ── CORS ───────────────────────────────────────────────────────────────────────
_dev_origins  = ["http://localhost:5173", "http://localhost:4173", "http://localhost:5200"]
_prod_origins = [u.strip() for u in os.getenv("FRONTEND_URL", "").split(",") if u.strip()]
ALLOWED_ORIGINS = _prod_origins + _dev_origins

from contextlib import asynccontextmanager

@asynccontextmanager
async def _lifespan(_: FastAPI):
    # ── startup: validate required env vars ──────────────────────────
    _missing = [v for v in ("ANTHROPIC_API_KEY", "APP_PASSWORD", "APP_SECRET") if not os.getenv(v)]
    if _missing:
        log.error("❌ Missing required env vars: %s — set them in .env before starting.", ", ".join(_missing))
        sys.exit(1)

    # ── startup: recover jobs orphaned by a previous server restart ──
    if JOBS_DIR.exists():
        for p in JOBS_DIR.glob("*.json"):
            try:
                data = json.loads(p.read_text())
                if data.get("status") == "running":
                    data.update(status="error", step="Failed",
                                detail="Generation interrupted by server restart. Please retry.",
                                updated_at=_now())
                    p.write_text(json.dumps(data, indent=2))
                    log.warning("Recovered orphaned job %s", data.get("job_id", "")[:8])
            except Exception as e:
                log.warning("Could not recover job file %s: %s", p.name, e)
    yield  # server runs
    # (no shutdown logic needed)


app = FastAPI(title="Rodschinson Content Studio API", lifespan=_lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ── Auth ───────────────────────────────────────────────────────────────────────
import hmac as _hmac
import time as _time

_AUTH_ENABLED  = os.getenv("AUTH_ENABLED", "true").lower() not in ("false", "0", "no")
_APP_USERNAME  = os.getenv("APP_USERNAME", "admin")
_APP_PASSWORD  = os.getenv("APP_PASSWORD", "")   # must be set in .env — no insecure default
_APP_SECRET    = os.getenv("APP_SECRET", "")     # must be set in .env — no insecure default
_TOKEN_TTL     = int(os.getenv("AUTH_TOKEN_TTL", str(60 * 60 * 24 * 7)))  # 7 days

def _parse_json(raw: str):
    """Parse JSON from Claude's response. Strips markdown fences,
    finds the outermost {…} block, and parses it."""
    s = raw.strip()
    # Strip markdown fences
    if "```" in s:
        s = re.sub(r"```[a-z]*\s*\n?", "", s)
        s = re.sub(r"\n?\s*```", "", s)
        s = s.strip()
    # Try full string first (most common case)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass
    # Find the FIRST top-level { and its matching } by counting braces
    first_brace = s.find("{")
    if first_brace == -1:
        first_brace = s.find("[")
    if first_brace == -1:
        raise json.JSONDecodeError("No JSON found", s, 0)
    open_char = s[first_brace]
    close_char = "}" if open_char == "{" else "]"
    depth = 0
    in_string = False
    escape_next = False
    end_pos = -1
    for i in range(first_brace, len(s)):
        c = s[i]
        if escape_next:
            escape_next = False
            continue
        if c == "\\":
            escape_next = True
            continue
        if c == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if c == open_char:
            depth += 1
        elif c == close_char:
            depth -= 1
            if depth == 0:
                end_pos = i
                break
    if end_pos == -1:
        # Braces not balanced — Claude likely truncated the response.
        # Try to repair by closing open braces/brackets
        truncated = s[first_brace:]
        # Count unclosed structures
        repair_depth = 0
        in_str = False
        esc = False
        stack = []
        for c in truncated:
            if esc:
                esc = False
                continue
            if c == '\\':
                esc = True
                continue
            if c == '"':
                in_str = not in_str
                continue
            if in_str:
                continue
            if c in ('{', '['):
                stack.append('}' if c == '{' else ']')
            elif c in ('}', ']') and stack:
                stack.pop()
        # Close all open structures
        if in_str:
            truncated += '"'
        # Remove trailing comma or partial value
        truncated = re.sub(r',\s*$', '', truncated)
        truncated += ''.join(reversed(stack))
        try:
            return json.loads(truncated)
        except json.JSONDecodeError:
            # Last resort: raw_decode
            try:
                obj, _ = json.JSONDecoder().raw_decode(s, first_brace)
                return obj
            except json.JSONDecodeError:
                raise json.JSONDecodeError("Could not parse truncated JSON", s, first_brace)
    candidate = s[first_brace:end_pos + 1]
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        # Last resort: raw_decode from first brace
        obj, _ = json.JSONDecoder().raw_decode(s, first_brace)
        return obj


def _make_token(username: str) -> str:
    exp = int(_time.time()) + _TOKEN_TTL
    payload = base64.urlsafe_b64encode(f"{username}:{exp}".encode()).decode().rstrip("=")
    sig = _hmac.new(_APP_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"

def _verify_token(token: str) -> str | None:
    """Return username if token is valid, else None."""
    try:
        payload, sig = token.rsplit(".", 1)
        expected = _hmac.new(_APP_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not _hmac.compare_digest(sig, expected):
            return None
        decoded = base64.urlsafe_b64decode(payload + "==").decode()
        username, exp_str = decoded.rsplit(":", 1)
        if int(exp_str) < int(_time.time()):
            return None
        return username
    except Exception:
        return None

def _get_request_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.cookies.get("cs_token")

# Auth middleware — protects all /api/* routes except /api/auth/*
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse as _JSONResponse

class _AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # Skip auth for: non-api routes, auth endpoints, OPTIONS preflight,
        # and media-serving routes (browsers can't send Authorization on <video>/<img> src)
        _MEDIA_PREFIXES = (
            "/api/auth/",
            "/api/video/",
            "/api/image/",
            "/api/carousel-png/",
            "/api/carousel-slides/",
            "/api/download/",
            "/api/jobs/",        # job status polling during generation
        )
        if (not path.startswith("/api/")
                or any(path.startswith(p) for p in _MEDIA_PREFIXES)
                or request.method == "OPTIONS"
                or not _AUTH_ENABLED):
            return await call_next(request)
        token = _get_request_token(request)
        if not token or not _verify_token(token):
            return _JSONResponse({"detail": "Not authenticated"}, status_code=401)
        return await call_next(request)

app.add_middleware(_AuthMiddleware)

# ── Settings store ─────────────────────────────────────────────────────────────
SETTINGS_FILE = OUTPUT / "settings.json"

def _settings_load() -> dict:
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except Exception as e:
            log.warning("Could not load settings file: %s", e)
    return {}

def _settings_save(data: dict):
    SETTINGS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

def _setting(key: str, default: str = "") -> str:
    """Read a setting: settings.json override first, then env var, then default."""
    return _settings_load().get(key) or os.getenv(key, default)

# ── In-memory job cache ────────────────────────────────────────────────────────
_jobs: dict[str, dict] = {}
_job_tasks: dict[str, asyncio.Task]                         = {}  # asyncio task per job
_job_procs: dict[str, asyncio.subprocess.Process]           = {}  # active subprocess per job
VALID_STATUSES = {"Draft", "Ready", "Approved", "Scheduled", "Published"}
VALID_SLOTS    = {"morning", "noon", "afternoon", "evening"}

# ── Rate limiter for /api/generate ────────────────────────────────────────────
# Sliding-window: max 10 jobs per IP per 60 seconds.
_rate_window: dict[str, list[float]] = {}  # ip → list of epoch timestamps
_RATE_LIMIT  = int(os.getenv("GENERATE_RATE_LIMIT", "10"))   # max jobs
_RATE_WINDOW = int(os.getenv("GENERATE_RATE_WINDOW", "60"))  # seconds

def _check_rate_limit(ip: str) -> None:
    import time as _t
    now = _t.time()
    hits = [ts for ts in _rate_window.get(ip, []) if now - ts < _RATE_WINDOW]
    if len(hits) >= _RATE_LIMIT:
        raise HTTPException(429, f"Rate limit exceeded — max {_RATE_LIMIT} jobs per {_RATE_WINDOW}s per IP.")
    hits.append(now)
    _rate_window[ip] = hits

# ── Concurrency guards ─────────────────────────────────────────────────────────
# Limit simultaneous Puppeteer render jobs to prevent Railway OOM when
# multiple carousel/video jobs are launched at once (each spawns Chrome).
_render_semaphore = asyncio.Semaphore(2)
# Limit simultaneous Claude API calls to reduce 529 overload errors during bulk runs.
_claude_semaphore = asyncio.Semaphore(2)

# ── Helpers ────────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _save_job(job: dict) -> None:
    path = JOBS_DIR / f"{job['job_id']}.json"
    async with aiofiles.open(path, "w") as f:
        await f.write(json.dumps(job, indent=2, default=str))


def _job_update(job: dict, **kwargs) -> dict:
    job.update(kwargs); job["updated_at"] = _now(); return job


async def _run(cmd: list[str], cwd: Path | None = None, timeout: int = 600,
               job_id: str | None = None) -> tuple[int, str, str]:
    """Run a subprocess with a hard timeout (default 10 min). Kills the process on timeout."""
    proc = await asyncio.create_subprocess_exec(
        *cmd, cwd=str(cwd or ROOT),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    if job_id:
        _job_procs[job_id] = proc
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        return 1, "", f"Process timed out after {timeout}s: {' '.join(str(c) for c in cmd[:3])}"
    except asyncio.CancelledError:
        proc.kill()
        await proc.communicate()
        raise
    finally:
        if job_id:
            _job_procs.pop(job_id, None)
    return proc.returncode or 0, stdout.decode(errors="replace"), stderr.decode(errors="replace")


async def _library_load() -> list[dict]:
    if not LIBRARY_FILE.exists(): return []
    try:
        async with aiofiles.open(LIBRARY_FILE) as f:
            return json.loads(await f.read())
    except Exception as e:
        log.error("Failed to load library.json: %s", e)
        return []


async def _library_save(entries: list[dict]) -> None:
    async with aiofiles.open(LIBRARY_FILE, "w") as f:
        await f.write(json.dumps(entries, indent=2, default=str))


async def _library_append(entry: dict) -> None:
    entries = await _library_load()
    entries = [e for e in entries if e.get("job_id") != entry["job_id"]]
    entries.insert(0, entry)
    await _library_save(entries)


async def _schedule_load() -> list[dict]:
    if not SCHEDULE_FILE.exists(): return []
    async with aiofiles.open(SCHEDULE_FILE) as f:
        return json.loads(await f.read())


async def _schedule_save(entries: list[dict]) -> None:
    async with aiofiles.open(SCHEDULE_FILE, "w") as f:
        await f.write(json.dumps(entries, indent=2, default=str))


async def _templates_load() -> list[dict]:
    if not TEMPLATES_FILE.exists(): return []
    async with aiofiles.open(TEMPLATES_FILE) as f:
        return json.loads(await f.read())


async def _templates_save(entries: list[dict]) -> None:
    async with aiofiles.open(TEMPLATES_FILE, "w") as f:
        await f.write(json.dumps(entries, indent=2, default=str))


# ── Users (roles) storage ──────────────────────────────────────────────────────
# Roles: admin > publisher > reviewer > creator
_DEFAULT_USERS = [
    {
        "id": "admin",
        "username": os.getenv("APP_USERNAME", "admin"),
        "password": os.getenv("APP_PASSWORD", ""),
        "role": "admin",
        "email": os.getenv("ADMIN_EMAIL", ""),
        "created_at": "2026-01-01T00:00:00+00:00",
    }
]
_ROLE_RANK = {"creator": 1, "reviewer": 2, "publisher": 3, "admin": 4}

async def _users_load() -> list[dict]:
    if not USERS_FILE.exists():
        await _users_save(list(_DEFAULT_USERS))
        return list(_DEFAULT_USERS)
    async with aiofiles.open(USERS_FILE) as f:
        return json.loads(await f.read())

async def _users_save(entries: list[dict]) -> None:
    async with aiofiles.open(USERS_FILE, "w") as f:
        await f.write(json.dumps(entries, indent=2, default=str))

async def _get_user(username: str) -> dict | None:
    users = await _users_load()
    return next((u for u in users if u["username"] == username), None)

async def _get_request_user(request: Request) -> dict | None:
    token = _get_request_token(request)
    uname = _verify_token(token) if token else None
    if not uname: return None
    return await _get_user(uname)

def _require_role(user: dict | None, min_role: str) -> None:
    if not user:
        raise HTTPException(401, "Not authenticated")
    if _ROLE_RANK.get(user.get("role", ""), 0) < _ROLE_RANK.get(min_role, 99):
        raise HTTPException(403, f"Requires role '{min_role}' or higher")


# ── Comments storage ───────────────────────────────────────────────────────────

async def _comments_load() -> list[dict]:
    if not COMMENTS_FILE.exists(): return []
    async with aiofiles.open(COMMENTS_FILE) as f:
        return json.loads(await f.read())

async def _comments_save(entries: list[dict]) -> None:
    async with aiofiles.open(COMMENTS_FILE, "w") as f:
        await f.write(json.dumps(entries, indent=2, default=str))


# ── Recurring series storage ───────────────────────────────────────────────────

async def _series_load() -> list[dict]:
    if not SERIES_FILE.exists(): return []
    async with aiofiles.open(SERIES_FILE) as f:
        return json.loads(await f.read())

async def _series_save(entries: list[dict]) -> None:
    async with aiofiles.open(SERIES_FILE, "w") as f:
        await f.write(json.dumps(entries, indent=2, default=str))


# ── Brands storage ─────────────────────────────────────────────────────────────

_DEFAULT_BRANDS = [
    {
        "id": "rodschinson",
        "name": "Rodschinson Investment",
        "shortName": "RI",
        "slug": "rodschinson",
        "primaryColor": "#08316F",
        "accentColor": "#C8A96E",
        "textColor": "#FFFFFF",
        "backgroundColor": "#08316F",
        "headingFont": "Montserrat",
        "bodyFont": "Inter",
        "headingFontSize": "64",
        "bodyFontSize": "18",
        "captionFontSize": "14",
        "headingWeight": "700",
        "bodyWeight": "400",
        "logoUrl": None,
        "website": "rodschinson.com",
        "tagline": "Premium CRE & M&A Advisory",
        "context": "Rodschinson Investment — premium CRE & M&A advisory, Brussels/Dubai/Casablanca",
        "createdAt": "2026-01-01T00:00:00+00:00",
    },
    {
        "id": "rachid",
        "name": "Rachid Chikhi",
        "shortName": "RC",
        "slug": "rachid",
        "primaryColor": "#1a1a2e",
        "accentColor": "#00B6FF",
        "textColor": "#FFFFFF",
        "backgroundColor": "#1a1a2e",
        "headingFont": "Playfair Display",
        "bodyFont": "Inter",
        "headingFontSize": "60",
        "bodyFontSize": "18",
        "captionFontSize": "14",
        "headingWeight": "700",
        "bodyWeight": "400",
        "logoUrl": None,
        "website": "",
        "tagline": "Entrepreneur & Investor",
        "context": "Rachid Chikhi — personal brand, entrepreneur & investor",
        "createdAt": "2026-01-01T00:00:00+00:00",
    },
]


async def _brands_load() -> list[dict]:
    if not BRANDS_FILE.exists():
        await _brands_save(_DEFAULT_BRANDS)
        return list(_DEFAULT_BRANDS)
    async with aiofiles.open(BRANDS_FILE) as f:
        return json.loads(await f.read())


async def _brands_save(entries: list[dict]) -> None:
    async with aiofiles.open(BRANDS_FILE, "w") as f:
        await f.write(json.dumps(entries, indent=2, default=str))


async def _brand_lookup(brand_id: str) -> dict | None:
    brands = await _brands_load()
    return next((b for b in brands if b["id"] == brand_id or b.get("slug") == brand_id), None)


# ── Custom templates storage ───────────────────────────────────────────────────

async def _custom_templates_load() -> list[dict]:
    if not CUSTOM_TEMPLATES_FILE.exists(): return []
    async with aiofiles.open(CUSTOM_TEMPLATES_FILE) as f:
        return json.loads(await f.read())


async def _custom_templates_save(entries: list[dict]) -> None:
    async with aiofiles.open(CUSTOM_TEMPLATES_FILE, "w") as f:
        await f.write(json.dumps(entries, indent=2, default=str))


async def _rebuild_template_registry() -> None:
    """Re-write template_registry.json so renderer.js picks up custom templates."""
    customs = await _custom_templates_load()
    registry = {"templates": {}, "allowed_types": {}}
    for t in customs:
        key      = t["id"]
        html_key = f"custom/{t['id']}"   # relative to templates/ dir
        registry["templates"][key]     = f"{html_key}.html"
        registry["allowed_types"][key] = t.get("scenes", [])
    async with aiofiles.open(TEMPLATE_REGISTRY, "w") as f:
        await f.write(json.dumps(registry, indent=2))


# Built-in template metadata (mirrors VIDEO_TEMPLATES but format-agnostic for the list endpoint)
_BUILTIN_TEMPLATE_META = [
    # 16:9 Video
    {"id": "educational", "label": "Premium",    "html": "rodschinson_premium", "ratio": "16:9", "w": 1920, "h": 1080, "fps": 24, "formats": ["video"], "builtin": True, "accent": "#C8A96E", "gradient": "linear-gradient(135deg,#08316F,#041d45)", "style": "Dark navy · gold · institutional", "scenes": ["title_card", "text_bullets", "process_steps", "quote_card", "cta_screen"]},
    {"id": "data",        "label": "Data",        "html": "tech_data",           "ratio": "16:9", "w": 1920, "h": 1080, "fps": 24, "formats": ["video"], "builtin": True, "accent": "#00B6FF", "gradient": "linear-gradient(135deg,#031520,#0a2a3d)", "style": "Dark · cyan · Bloomberg terminal", "scenes": ["title_card", "big_number", "bar_chart", "text_bullets", "cta_screen"]},
    {"id": "news",        "label": "News",        "html": "news_reel",           "ratio": "16:9", "w": 1920, "h": 1080, "fps": 24, "formats": ["video"], "builtin": True, "accent": "#CC0000", "gradient": "linear-gradient(135deg,#0a0a0a,#1a0000)", "style": "Dark · red · breaking news broadcast", "scenes": ["title_card", "big_number", "bar_chart", "text_bullets", "cta_screen"]},
    {"id": "corporate",   "label": "Corporate",   "html": "corporate_minimal",   "ratio": "16:9", "w": 1920, "h": 1080, "fps": 24, "formats": ["video"], "builtin": True, "accent": "#08316F", "gradient": "linear-gradient(135deg,#F8F5F0,#e8e4dc)", "style": "Light · editorial · thought leadership", "scenes": ["title_card", "text_bullets", "split_screen", "process_steps", "cta_screen"]},
    {"id": "cre",         "label": "CRE",         "html": "cre",                 "ratio": "16:9", "w": 1920, "h": 1080, "fps": 24, "formats": ["video"], "builtin": True, "accent": "#00E5C8", "gradient": "linear-gradient(135deg,#080E1A,#0C1628)", "style": "Dark · teal · CRE market terminal", "scenes": ["title_card", "big_number", "bar_chart", "text_bullets", "cta_screen"]},
    # 9:16 Reel
    {"id": "reel_premium",  "label": "Premium",  "html": "reel_premium",  "ratio": "9:16", "w": 1080, "h": 1920, "fps": 30, "formats": ["reel", "story"], "builtin": True, "accent": "#C8A96E", "gradient": "linear-gradient(160deg,#08316F,#041d45)", "style": "Dark navy · gold · premium vertical", "scenes": ["title_card", "big_number", "text_bullets", "bar_chart", "cta_screen"]},
    {"id": "reel_data",     "label": "Data",     "html": "reel_data",     "ratio": "9:16", "w": 1080, "h": 1920, "fps": 30, "formats": ["reel", "story"], "builtin": True, "accent": "#00E5C8", "gradient": "linear-gradient(160deg,#080E1A,#0C1628)", "style": "Dark · teal · data terminal vertical", "scenes": ["title_card", "big_number", "bar_chart", "text_bullets", "cta_screen"]},
    {"id": "reel_bold",     "label": "Bold",     "html": "reel_bold",     "ratio": "9:16", "w": 1080, "h": 1920, "fps": 30, "formats": ["reel", "story"], "builtin": True, "accent": "#FF4444", "gradient": "linear-gradient(160deg,#0a0a0a,#1a0000)", "style": "Black · red · high energy viral", "scenes": ["title_card", "big_number", "text_bullets", "bar_chart", "cta_screen"]},
    {"id": "reel_minimal",  "label": "Minimal",  "html": "reel_minimal",  "ratio": "9:16", "w": 1080, "h": 1920, "fps": 30, "formats": ["reel", "story"], "builtin": True, "accent": "#08316F", "gradient": "linear-gradient(160deg,#F5F5F0,#e5e5e0)", "style": "Light · minimal · clean editorial", "scenes": ["title_card", "big_number", "text_bullets", "bar_chart", "cta_screen"]},
    {"id": "reel_gradient", "label": "Gradient", "html": "reel_gradient", "ratio": "9:16", "w": 1080, "h": 1920, "fps": 30, "formats": ["reel", "story"], "builtin": True, "accent": "#9b6dff", "gradient": "linear-gradient(160deg,#1a0a2e,#08316F)", "style": "Purple-navy · glow · modern social", "scenes": ["title_card", "big_number", "text_bullets", "bar_chart", "cta_screen"]},
    # Real Estate Light (architectural · clear background)
    {"id": "realestate_light", "label": "Real Estate", "html": "realestate_light", "ratio": "16:9", "w": 1920, "h": 1080, "fps": 24, "formats": ["video"], "builtin": True, "accent": "#C8A96E", "gradient": "linear-gradient(135deg,#F5F2ED,#ede9e2)", "style": "Light linen · navy · gold · architectural skyline", "scenes": ["title_card", "big_number", "bar_chart", "text_bullets", "process_steps", "quote_card", "split_screen", "cta_screen"]},
    {"id": "reel_realestate",  "label": "Real Estate", "html": "reel_realestate",  "ratio": "9:16", "w": 1080, "h": 1920, "fps": 30, "formats": ["reel", "story"], "builtin": True, "accent": "#C8A96E", "gradient": "linear-gradient(160deg,#F5F2ED,#ede9e2)", "style": "Light linen · navy · gold · vertical architectural", "scenes": ["title_card", "big_number", "bar_chart", "text_bullets", "process_steps", "quote_card", "cta_screen"]},
]

_SCENE_TYPE_SCHEMAS = {
    "title_card":    {"titre_principal": "Main headline", "sous_titre": "Subtitle or hook", "eyebrow": "Category · Year"},
    "big_number":    {"eyebrow": "Metric label", "valeur": "5.75", "unite": "%", "contexte": "One-line explanation", "formule": ""},
    "text_bullets":  {"titre": "Section heading", "items": ["Point 1", "Point 2", "Point 3", "Point 4"]},
    "bar_chart":     {"titre": "Chart title", "series": [{"label": "Cat A", "valeur": 5.75}, {"label": "Cat B", "valeur": 4.1}], "unite": "%", "source": "Source: CBRE / JLL"},
    "process_steps": {"titre": "Process name", "etapes": ["Step 1", "Step 2", "Step 3", "Step 4"], "active": 0},
    "split_screen":  {"titre": "Comparison", "colonne_gauche": {"titre": "Left", "items": ["A1", "A2", "A3"]}, "colonne_droite": {"titre": "Right", "items": ["B1", "B2", "B3"]}},
    "quote_card":    {"citation": "Full quote text here", "auteur": "Author Name", "source": "Organisation / Role"},
    "cta_screen":    {"eyebrow": "Brand Name", "headline": "CTA headline", "body": "One sentence invitation", "cta_text": "CTA Button Text", "url": "yoursite.com"},
}


# ── Pipeline ───────────────────────────────────────────────────────────────────

# ── Per-content-type pipeline definitions ──────────────────────────────────────
#
# Each entry maps content_type → list of pipeline phases.
# Phases are executed in order; each phase is (label, progress_pct, callable).
# The callable receives (job, data, paths) and runs the actual subprocess.



async def _run_pipeline(job_id: str, data: dict, logo_path: Path | None) -> None:
    job = _jobs[job_id]

    async def step(label: str, progress: int, cmd: list[str], cwd: Path | None = None) -> str:
        _job_update(job, status="running", step=label, progress=progress)
        await _save_job(job)
        log.info("[%s] %s  (%d%%)", job_id[:8], label, progress)
        code, out, err = await _run(cmd, cwd=cwd, job_id=job_id)
        if code != 0:
            raise RuntimeError(f"{label} failed (exit {code})\n{err[-800:]}")
        return out

    async def try_step(label: str, progress: int, cmd: list[str], cwd: Path | None = None) -> bool:
        """Like step() but non-fatal — logs warning and returns False on failure."""
        _job_update(job, status="running", step=label, progress=progress)
        await _save_job(job)
        log.info("[%s] %s  (%d%%)", job_id[:8], label, progress)
        code, _, err = await _run(cmd, cwd=cwd, job_id=job_id)
        if code != 0:
            log.warning("[%s] %s skipped (exit %d): %s", job_id[:8], label, code, err[-300:])
        return code == 0

    try:
        brand        = data.get("brand", "rodschinson")
        language     = data.get("language", "EN")
        subject      = data["subject"]
        fmt          = data.get("format", "16:9")
        template     = data.get("template", "rodschinson_premium")
        content_type = data.get("contentType", "video")
        brand_arg    = "rachid" if brand == "rachid" else "rodschinson"
        style        = data.get("style", "viral_hook")
        # Resolve brand metadata — used throughout pipeline for prompts + rendering
        _brand_meta   = await _brand_lookup(brand) or {}
        brand_display = _brand_meta.get("name") or ("Rachid Chikhi" if brand == "rachid" else "Rodschinson Investment")
        brand_context = _brand_meta.get("context") or brand_display
        _icp = _brand_meta.get("icp") or {}
        if _icp.get("jobTitle") or _icp.get("painPoints"):
            _icp_text = (
                f"TARGET AUDIENCE: {_icp.get('jobTitle','')} in {_icp.get('industry','')}. "
                f"Pain points: {_icp.get('painPoints','')}. Goals: {_icp.get('goals','')}."
            )
            brand_context = f"{brand_context}\n{_icp_text}"
        brand_primary      = _brand_meta.get("primaryColor",    "#08316F")
        brand_accent       = _brand_meta.get("accentColor",     "#C8A96E")
        brand_bg           = _brand_meta.get("backgroundColor", brand_primary)
        brand_heading_font = _brand_meta.get("headingFont",     "Inter")
        brand_body_font    = _brand_meta.get("bodyFont",        "Inter")
        brand_heading_size = _brand_meta.get("headingFontSize", "64")
        brand_body_size    = _brand_meta.get("bodyFontSize",    "18")
        brand_caption_size = _brand_meta.get("captionFontSize", "14")
        brand_heading_wt   = _brand_meta.get("headingWeight",   "700")
        brand_body_wt      = _brand_meta.get("bodyWeight",      "400")
        # Auto-use brand's saved logo if none uploaded with this request
        if logo_path is None:
            _candidate = BRAND_LOGOS / f"{brand}.png"
            if _candidate.exists():
                logo_path = _candidate
        audio_mode   = data.get("audioMode", "voice")   # "voice" | "music"
        music_genre  = data.get("musicGenre", "corporate")
        transition    = data.get("transition", "none")
        caption_style = data.get("caption_style", "none")

        output_file:     str | None = None
        output_text:     str | None = None
        script_path:     Path | None = None
        slide_png_paths: list[str]   = []

        # ── Resolve or materialise a custom script ────────────────────────────
        custom_script_str = data.get("custom_script")
        if custom_script_str:
            script_dir = OUTPUT / "scripts"
            script_dir.mkdir(parents=True, exist_ok=True)
            script_path = script_dir / f"script_{job_id[:8]}_custom.json"
            script_path.write_text(custom_script_str)
            _job_update(job, status="running", step="Using custom script", progress=5)
            await _save_job(job)

        # ════════════════════════════════════════════════════════════════════════
        # VIDEO / REEL / STORY  —  Script → Render → Audio → Assemble
        # ════════════════════════════════════════════════════════════════════════

        # ── Video + Reel template definitions ─────────────────────────────────
        # Every valid template is declared here with its HTML file, canvas
        # dimensions, allowed scene types, and exact visuel schemas.
        # If the user picks a template not in this dict → hard error immediately.
        VIDEO_TEMPLATES = {
            # ── Landscape 16:9 — video ────────────────────────────────────────
            "educational": {
                "html": "rodschinson_premium", "ratio": "16:9",
                "w": 1920, "h": 1080, "fps": 24,
                "style": "Dark navy #08316F, gold #C8A96E, sky blue #00B6FF. Institutional investment house. Elegant, authoritative.",
                "narrative_guidance": (
                    "Write like a senior partner addressing institutional investors. Use elevated, precise vocabulary. "
                    "Lead with the thesis, then support it methodically. process_steps scenes should walk through a clear framework or decision logic. "
                    "quote_card must carry a real, attributable insight from a credible figure — not a generic motivational quote. "
                    "text_bullets should read as concise, high-conviction observations, not bullet-point filler. "
                    "Narration should be measured and unhurried — this audience values clarity over hype."
                ),
                "scenes": ["title_card", "text_bullets", "process_steps", "quote_card", "cta_screen"],
                "schemas": {
                    "title_card":    {"titre_principal": "Main headline", "sous_titre": "Subtitle or hook", "eyebrow": "Category · Year"},
                    "text_bullets":  {"titre": "Section heading", "items": ["Point 1", "Point 2", "Point 3", "Point 4"]},
                    "process_steps": {"titre": "Process name", "etapes": ["Step 1", "Step 2", "Step 3", "Step 4"], "active": 0},
                    "quote_card":    {"citation": "Full quote text", "auteur": "Author Name", "source": "Organisation / Role"},
                    "cta_screen":    {"eyebrow": "Rodschinson Investment", "headline": "CTA headline", "body": "One sentence invitation", "cta_text": "Consultation Gratuite — 30 min", "url": "rodschinson.com"},
                },
            },
            "data": {
                "html": "tech_data", "ratio": "16:9",
                "w": 1920, "h": 1080, "fps": 24,
                "style": "Very dark #031520, cyan #00B6FF accents. Bloomberg / data terminal. Every number matters.",
                "narrative_guidance": (
                    "Every claim must be anchored in a specific number — no vague statements. "
                    "big_number scenes should carry the single most important metric for that moment in the story; give it sharp context. "
                    "bar_chart scenes should compare real, sourced figures — not illustrative placeholders. "
                    "text_bullets should be data-backed observations: 'X% of investors…', 'Returns fell by Y bps…'. "
                    "Narration is fast, clipped, confident — like a Bloomberg anchor reading live data. "
                    "Never use emotional language; let the numbers carry the weight."
                ),
                "scenes": ["title_card", "big_number", "bar_chart", "text_bullets", "cta_screen"],
                "schemas": {
                    "title_card":   {"titre_principal": "Main headline", "sous_titre": "Market context", "eyebrow": "Sector · Year"},
                    "big_number":   {"eyebrow": "Metric label", "valeur": "5.75", "unite": "%", "contexte": "One-line explanation", "formule": ""},
                    "bar_chart":    {"titre": "Chart title", "series": [{"label": "Category A", "valeur": 5.75}, {"label": "Category B", "valeur": 4.1}], "unite": "%", "source": "Source: CBRE / JLL"},
                    "text_bullets": {"titre": "Key takeaways", "items": ["Insight 1", "Insight 2", "Insight 3", "Insight 4"]},
                    "cta_screen":   {"eyebrow": "Rodschinson Investment", "headline": "CTA headline", "body": "One sentence invitation", "cta_text": "Consultation Gratuite — 30 min", "url": "rodschinson.com"},
                },
            },
            "news": {
                "html": "news_reel", "ratio": "16:9",
                "w": 1920, "h": 1080, "fps": 24,
                "style": "Dark red/black news broadcast. Breaking news feel, high urgency, ticker-bar style.",
                "narrative_guidance": (
                    "Write like a breaking-news broadcast. Open with the most urgent fact — the thing the viewer needs to know right now. "
                    "big_number scene must carry the single most alarming or significant figure. Use 'BREAKING', 'ALERT', 'JUST IN' style eyebrows. "
                    "bar_chart should show before/after or competitor comparisons that make the story tangible. "
                    "text_bullets should be tight, staccato points — 5 words max per item, high impact. "
                    "Narration is rapid and urgent. Active voice only. No hedging language."
                ),
                "scenes": ["title_card", "big_number", "bar_chart", "text_bullets", "cta_screen"],
                "schemas": {
                    "title_card":   {"titre_principal": "Breaking headline", "sous_titre": "Context or location", "eyebrow": "BREAKING · Market Update"},
                    "big_number":   {"eyebrow": "The key stat", "valeur": "12", "unite": "%", "contexte": "Brief explanation of impact", "formule": ""},
                    "bar_chart":    {"titre": "Chart title", "series": [{"label": "Category A", "valeur": 5.75}, {"label": "Category B", "valeur": 4.1}], "unite": "%", "source": "Source: CBRE / JLL"},
                    "text_bullets": {"titre": "Key points", "items": ["Key point 1", "Key point 2", "Key point 3", "Key point 4"]},
                    "cta_screen":   {"eyebrow": "Rodschinson Investment", "headline": "Stay Ahead of the Market", "body": "One sentence invitation", "cta_text": "Get Market Briefing", "url": "rodschinson.com"},
                },
            },
            "corporate": {
                "html": "corporate_minimal", "ratio": "16:9",
                "w": 1920, "h": 1080, "fps": 24,
                "style": "White/near-black, editorial magazine. Clean whitespace, thought leadership tone.",
                "narrative_guidance": (
                    "Write like a Harvard Business Review byline — authoritative, nuanced, forward-looking. "
                    "split_screen scenes are ideal for contrasting two schools of thought, before/after, or market vs reality. "
                    "process_steps should describe a methodology, not a checklist — each step should have strategic weight. "
                    "text_bullets should be layered insights, not surface observations. Give each bullet a point-of-view. "
                    "Narration is deliberate and confident. Long sentences are acceptable when they carry complexity. "
                    "Avoid jargon but do not simplify — respect the audience's intelligence."
                ),
                "scenes": ["title_card", "text_bullets", "split_screen", "process_steps", "cta_screen"],
                "schemas": {
                    "title_card":    {"titre_principal": "Thought leadership headline", "sous_titre": "Subtitle or thesis", "eyebrow": "Topic · Year"},
                    "text_bullets":  {"titre": "Section heading", "items": ["Insight 1", "Insight 2", "Insight 3", "Insight 4"]},
                    "split_screen":  {"titre": "Comparison title", "colonne_gauche": {"titre": "Left column", "items": ["Item 1", "Item 2", "Item 3"]}, "colonne_droite": {"titre": "Right column", "items": ["Item 1", "Item 2", "Item 3"]}},
                    "process_steps": {"titre": "Process name", "etapes": ["Step 1", "Step 2", "Step 3", "Step 4"], "active": 0},
                    "cta_screen":    {"eyebrow": "Rodschinson Investment", "headline": "CTA headline", "body": "One sentence invitation", "cta_text": "Consultation Gratuite — 30 min", "url": "rodschinson.com"},
                },
            },
            "cre": {
                "html": "cre", "ratio": "16:9",
                "w": 1920, "h": 1080, "fps": 24,
                "style": "Very dark background, electric cyan #00B6FF. CRE market data terminal. Professional investor audience.",
                "narrative_guidance": (
                    "Audience: active CRE investors and asset managers. Every scene should answer 'what does this mean for my deal or portfolio?' "
                    "big_number should carry yield, IRR, cap rate, or vacancy — the metrics investors actually act on. "
                    "bar_chart should compare cities, asset classes, or vintage years with sourced data (CBRE, JLL, Cushman). "
                    "text_bullets should be investable insights — market signals, not general observations. "
                    "Narration is direct, peer-to-peer. Speak as a fellow investor, not a salesperson."
                ),
                "scenes": ["title_card", "big_number", "bar_chart", "text_bullets", "cta_screen"],
                "schemas": {
                    "title_card":   {"titre_principal": "CRE Market headline", "sous_titre": "Market or asset class context", "eyebrow": "Asset Class · Market"},
                    "big_number":   {"eyebrow": "Market metric", "valeur": "5.75", "unite": "%", "contexte": "What this yield/return means for investors", "formule": ""},
                    "bar_chart":    {"titre": "Market comparison", "series": [{"label": "Brussels", "valeur": 5.75}, {"label": "Paris", "valeur": 4.2}, {"label": "Dubai", "valeur": 7.1}], "unite": "%", "source": "Source: CBRE / JLL"},
                    "text_bullets": {"titre": "Key market factors", "items": ["Driver 1", "Driver 2", "Driver 3", "Driver 4"]},
                    "cta_screen":   {"eyebrow": "Rodschinson Investment", "headline": "Ready to Invest?", "body": "One sentence invitation", "cta_text": "Book a Deal Review", "url": "rodschinson.com"},
                },
            },
            # ── Portrait 9:16 — reel / story ─────────────────────────────────
            "reel_premium": {
                "html": "reel_premium", "ratio": "9:16",
                "w": 1080, "h": 1920, "fps": 30,
                "style": "Dark navy #08316F, gold #C8A96E. Vertical format. Institutional, premium. Each scene is punchy and self-contained.",
                "narrative_guidance": (
                    "Each scene must work as a standalone punchy statement — viewers scroll fast. "
                    "Scene 1 hook must create an immediate 'wait, what?' reaction. "
                    "big_number should be the most surprising or counter-intuitive figure in the topic. "
                    "text_bullets max 3 items, each 6 words or fewer. No padding. "
                    "Narration is short bursts — 1–2 sentences per scene. Confident, premium tone. "
                    "The brand is institutional; avoid hype language but keep energy high through precision."
                ),
                "scenes": ["title_card", "big_number", "text_bullets", "bar_chart", "cta_screen"],
                "schemas": {
                    "title_card":   {"titre_principal": "Hook headline — bold claim", "sous_titre": "One-line context", "eyebrow": "Category"},
                    "big_number":   {"eyebrow": "The key stat", "valeur": "5.75", "unite": "%", "contexte": "One sentence explaining this number", "formule": ""},
                    "text_bullets": {"titre": "Section heading", "items": ["Point 1", "Point 2", "Point 3"]},
                    "bar_chart":    {"titre": "Comparison", "series": [{"label": "A", "valeur": 5.75}, {"label": "B", "valeur": 4.1}], "unite": "%", "source": "CBRE / JLL"},
                    "cta_screen":   {"eyebrow": "Rodschinson Investment", "headline": "CTA headline", "body": "One sentence", "cta_text": "Follow for more", "url": "rodschinson.com"},
                },
            },
            "reel_data": {
                "html": "reel_data", "ratio": "9:16",
                "w": 1080, "h": 1920, "fps": 30,
                "style": "Very dark, cyan #00B6FF. Data terminal vertical. Numbers dominate every scene.",
                "narrative_guidance": (
                    "Data is the hero of every scene — structure the script around numbers, not narrative. "
                    "Hook with the most dramatic or unexpected stat. "
                    "big_number must be real and sourced; include the unit and a one-line context that tells you whether it's good or bad. "
                    "bar_chart must compare at least 3 data points with real values. "
                    "text_bullets must start with numbers: '3 markets where…', '€2.1B in…'. "
                    "Narration is clipped and factual — no adjectives unless they're backed by data."
                ),
                "scenes": ["title_card", "big_number", "bar_chart", "text_bullets", "cta_screen"],
                "schemas": {
                    "title_card":   {"titre_principal": "Data-driven hook", "sous_titre": "Market context", "eyebrow": "Market Data"},
                    "big_number":   {"eyebrow": "Metric label", "valeur": "12.4", "unite": "%", "contexte": "What this number means", "formule": ""},
                    "bar_chart":    {"titre": "Market comparison", "series": [{"label": "A", "valeur": 5.75}, {"label": "B", "valeur": 4.1}, {"label": "C", "valeur": 3.2}], "unite": "%", "source": "CBRE"},
                    "text_bullets": {"titre": "Key takeaways", "items": ["Insight 1", "Insight 2", "Insight 3"]},
                    "cta_screen":   {"eyebrow": "Rodschinson Investment", "headline": "Want the full analysis?", "body": "One sentence", "cta_text": "Link in bio", "url": "rodschinson.com"},
                },
            },
            "reel_bold": {
                "html": "reel_bold", "ratio": "9:16",
                "w": 1080, "h": 1920, "fps": 30,
                "style": "Black and red, high contrast, high energy. Bold statements. Viral / breaking news feel.",
                "narrative_guidance": (
                    "Write for maximum shareability. Every scene should make someone stop scrolling. "
                    "Scene 1 must be a bold, slightly provocative claim that challenges what most people believe. "
                    "big_number should be the 'jaw-drop' stat that makes the hook land. "
                    "text_bullets: contrarian, first-person opinions or uncomfortable truths — not safe statements. "
                    "bar_chart: dramatic contrasts (e.g., 40% vs 8%) that visually reinforce the controversy. "
                    "Narration: punchy sentences, rhetorical questions, pause for effect. Energy is high throughout."
                ),
                "scenes": ["title_card", "big_number", "text_bullets", "bar_chart", "cta_screen"],
                "schemas": {
                    "title_card":   {"titre_principal": "Provocative hook — challenge assumptions", "sous_titre": "One punchy line", "eyebrow": "BREAKING"},
                    "big_number":   {"eyebrow": "The shocking stat", "valeur": "40", "unite": "%", "contexte": "Why this matters right now", "formule": ""},
                    "text_bullets": {"titre": "The truth about X", "items": ["Bold point 1", "Bold point 2", "Bold point 3"]},
                    "bar_chart":    {"titre": "Market data", "series": [{"label": "A", "valeur": 40}, {"label": "B", "valeur": 25}, {"label": "C", "valeur": 18}], "unite": "%", "source": "Source: CBRE / JLL"},
                    "cta_screen":   {"eyebrow": "Rodschinson Investment", "headline": "Don't miss the next one", "body": "Follow for weekly market intel", "cta_text": "Follow Now", "url": "rodschinson.com"},
                },
            },
            "reel_minimal": {
                "html": "reel_minimal", "ratio": "9:16",
                "w": 1080, "h": 1920, "fps": 30,
                "style": "White/near-white, minimal. One idea per scene. Clean editorial typography.",
                "narrative_guidance": (
                    "One idea per scene — discipline is the aesthetic. Never crowd a scene. "
                    "Titles and bullets should be as short as possible: think magazine cover lines. "
                    "big_number scenes should carry a clean insight: the number, a unit, and a single explanatory sentence. "
                    "text_bullets: 3 items max, each a short, standalone observation. No sub-bullets. "
                    "Narration is calm and measured — confident without being aggressive. "
                    "The whitespace IS the design; respect it with sparse, precise writing."
                ),
                "scenes": ["title_card", "big_number", "text_bullets", "bar_chart", "cta_screen"],
                "schemas": {
                    "title_card":   {"titre_principal": "Clean, clear hook", "sous_titre": "Brief context", "eyebrow": "Insight"},
                    "big_number":   {"eyebrow": "The key stat", "valeur": "5.75", "unite": "%", "contexte": "One-line explanation", "formule": ""},
                    "text_bullets": {"titre": "Key points", "items": ["Point 1", "Point 2", "Point 3"]},
                    "bar_chart":    {"titre": "Comparison", "series": [{"label": "A", "valeur": 5.75}, {"label": "B", "valeur": 4.1}], "unite": "%", "source": "Source"},
                    "cta_screen":   {"eyebrow": "Rodschinson Investment", "headline": "Learn more", "body": "One sentence", "cta_text": "Link in bio", "url": "rodschinson.com"},
                },
            },
            "reel_gradient": {
                "html": "reel_gradient", "ratio": "9:16",
                "w": 1080, "h": 1920, "fps": 30,
                "style": "Purple-to-navy gradient, modern social-native aesthetic. Young professional audience.",
                "narrative_guidance": (
                    "Audience: ambitious 25–35 professionals discovering investing. Tone: smart friend, not professor. "
                    "Hook with a relatable insight ('Most people don't know that…', 'This changed how I invest'). "
                    "big_number should feel like a discovery — something the viewer will want to share. "
                    "text_bullets: 3 punchy takeaways framed as things to DO or think about. "
                    "bar_chart: visual proof that makes the argument concrete — use relatable comparisons. "
                    "Narration is warm, direct, fast-paced. First person where natural. End with a forward hook."
                ),
                "scenes": ["title_card", "big_number", "text_bullets", "bar_chart", "cta_screen"],
                "schemas": {
                    "title_card":   {"titre_principal": "Engaging hook for social", "sous_titre": "One line tease", "eyebrow": "Trend"},
                    "big_number":   {"eyebrow": "The key number", "valeur": "4.3", "unite": "Mds €", "contexte": "Context for this figure", "formule": ""},
                    "text_bullets": {"titre": "Here's what you need to know", "items": ["Point 1", "Point 2", "Point 3"]},
                    "bar_chart":    {"titre": "Market overview", "series": [{"label": "A", "valeur": 5.75}, {"label": "B", "valeur": 4.1}], "unite": "%", "source": "Source"},
                    "cta_screen":   {"eyebrow": "Rodschinson Investment", "headline": "Save this for later", "body": "Follow for more CRE insights", "cta_text": "Follow", "url": "rodschinson.com"},
                },
            },
        }

        # Per-scene-type content guidance used when auto-building narrative_guidance for custom templates
        _SCENE_NARRATIVE_HINTS = {
            "title_card":    "Scene 1 title_card must open with a strong, specific hook — a claim, stat, or question that immediately earns the viewer's attention.",
            "big_number":    "big_number scenes: choose the single most important metric relevant to this moment in the story. Give it context — is this high, low, surprising?",
            "bar_chart":     "bar_chart scenes: use real, sourced comparative figures (at least 2 data points). The comparison should prove or illustrate your argument.",
            "text_bullets":  "text_bullets scenes: each bullet must be a standalone insight — no filler. Minimum 3, each concise and specific.",
            "process_steps": "process_steps scenes: walk through a logical sequence — decision framework, methodology, or step-by-step action plan.",
            "split_screen":  "split_screen scenes: contrast two options, viewpoints, or outcomes. Each column should make a clear, opposing case.",
            "quote_card":    "quote_card scenes: use a real, attributable quote from a credible source. The quote should add authority or a human dimension the narration cannot.",
            "cta_screen":    "cta_screen (final scene): close with a specific, actionable invitation — not a generic 'learn more'. Make it relevant to what was just presented.",
        }

        def _build_custom_narrative_guidance(scenes: list, style: str) -> str:
            """Auto-generate narrative guidance for custom templates from their scene types."""
            hints = [_SCENE_NARRATIVE_HINTS[s] for s in scenes if s in _SCENE_NARRATIVE_HINTS]
            data_heavy = any(s in scenes for s in ("big_number", "bar_chart"))
            narrative_heavy = any(s in scenes for s in ("quote_card", "process_steps", "split_screen"))
            if data_heavy and not narrative_heavy:
                tone = "Ground every scene in real data. Numbers are the story — narration supports them."
            elif narrative_heavy and not data_heavy:
                tone = "Build a logical argument scene by scene. Each scene advances the thesis set up in the title_card."
            else:
                tone = "Balance data evidence with narrative reasoning. Let numbers land before explaining their implications."
            return f"Template style: {style}. {tone} " + " ".join(hints)

        # Merge custom templates into VIDEO_TEMPLATES so they're available in the pipeline
        for _ct in await _custom_templates_load():
            _tid = _ct["id"]
            if _tid not in VIDEO_TEMPLATES:
                # Build schemas from the global schema catalogue filtered to this template's scene types
                _schemas = {s: _SCENE_TYPE_SCHEMAS[s] for s in _ct.get("scenes", []) if s in _SCENE_TYPE_SCHEMAS}
                _ct_scenes = _ct.get("scenes", [])
                _ct_style  = _ct.get("style", _ct.get("label", _tid))
                VIDEO_TEMPLATES[_tid] = {
                    "html":               f"custom/{_tid}",
                    "ratio":              _ct.get("ratio", "16:9"),
                    "w":                  _ct.get("w", 1920),
                    "h":                  _ct.get("h", 1080),
                    "fps":                _ct.get("fps", 24),
                    "style":              _ct_style,
                    "narrative_guidance": _build_custom_narrative_guidance(_ct_scenes, _ct_style),
                    "scenes":             _ct_scenes,
                    "schemas":            _schemas,
                }

        if content_type in ("video", "reel", "story"):
            duration_sec = int(data.get("duration", 60))

            if not script_path:
                # ── Hard error if template is not registered ───────────────────
                if template not in VIDEO_TEMPLATES:
                    valid = sorted(VIDEO_TEMPLATES.keys())
                    raise RuntimeError(
                        f"Unknown video template '{template}'. "
                        f"Valid templates: {', '.join(valid)}"
                    )

                vtpl         = VIDEO_TEMPLATES[template]
                html_template = vtpl["html"]
                allowed_types = vtpl["scenes"]
                schemas       = vtpl["schemas"]
                canvas_w      = vtpl["w"]
                canvas_h      = vtpl["h"]
                canvas_fps    = vtpl["fps"]

                # Scene count: reels/stories are shorter-form (avg 6s/scene, min 3)
                # Videos are longer-form (avg 8s/scene, min 3, max 8)
                is_shortform = content_type in ("reel", "story") or vtpl["ratio"] == "9:16"
                avg_scene_dur = 5 if is_shortform else 8
                n_scenes = max(3, min(5 if is_shortform else 8, round(duration_sec / avg_scene_dur)))

                lang_map  = {"EN": "English", "FR": "French", "NL": "Dutch"}
                lang_name = lang_map.get(language.upper(), "English")

                style_hints = {
                    "viral_hook":  "Hook-first, bold claim, curiosity gap. Scene 1 must grab immediately.",
                    "educational": "Teach one concept clearly. Build from problem → insight → solution.",
                    "data_story":  "Lead every scene with a hard number. The data IS the story.",
                    "personal":    "First person, personal story, authentic voice.",
                    "provocateur": "Challenge assumptions. Contrarian angle backed by evidence.",
                    "thread":      "Each scene is a standalone punchy point that builds on the last.",
                }

                schema_docs = "\n".join(
                    f'  "{t}": {json.dumps(schemas[t], ensure_ascii=False)}'
                    for t in allowed_types
                )

                narrative_guidance = vtpl.get("narrative_guidance", "")
                video_prompt = f"""You are writing a video script for {brand_display}.
BRAND CONTEXT: {brand_context}
BRAND COLORS: primary {brand_primary}, accent {brand_accent}

TOPIC: {subject}
LANGUAGE: {lang_name}
TEMPLATE: {template} — {vtpl['style']}
FORMAT: {vtpl['ratio']} ({canvas_w}×{canvas_h}px)
CONTENT STYLE: {style_hints.get(style, style_hints['educational'])}
DURATION: approximately {duration_sec} seconds total
NUMBER OF SCENES: exactly {n_scenes}

TEMPLATE CONTENT GUIDANCE (adapt your writing specifically to this template's visual identity):
{narrative_guidance}

ALLOWED SCENE TYPES (use ONLY these — any other type will crash the renderer):
{', '.join(allowed_types)}

EXACT visuel schema for each scene type:
{schema_docs}

Return ONLY a valid JSON object with this structure:
{{
  "meta": {{
    "titre": "Video title (max 80 chars)",
    "brand": "{brand_display}",
    "brand_primary": "{brand_primary}",
    "brand_accent": "{brand_accent}",
    "brand_name": "{brand_display}",
    "template": "{html_template}",
    "largeur": {canvas_w}, "hauteur": {canvas_h}, "fps": {canvas_fps},
    "duree_totale_sec": {duration_sec},
    "langue": "{language.lower()}"
  }},
  "scenes": [
    {{
      "id": 1,
      "nom": "scene_slug_no_spaces",
      "duree_sec": 7,
      "type_visuel": "title_card",
      "narration": "Exact words the voiceover will speak for this scene.",
      "visuel": {{ ...exact fields from schema above, fully filled... }}
    }}
  ],
  "audio": {{
    "voix_style": "professional et posé",
    "vitesse_parole": 1.0
  }}
}}

Hard rules — violations will crash the render pipeline with no recovery:
- Scene 1 MUST be type_visuel "title_card"
- Scene {n_scenes} MUST be type_visuel "cta_screen"
- EVERY scene MUST have a non-empty narration string
- EVERY visuel field in the schema MUST be filled with real, specific content
- For bar_chart: series MUST have at least 2 objects with real numeric valeur
- For text_bullets / process_steps: items/etapes MUST have at least 3 entries
- Scene durations must sum to approximately {duration_sec} seconds
- Use ONLY these {len(allowed_types)} scene types: {', '.join(allowed_types)}
- No markdown, no explanation — return ONLY the JSON object"""

                anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
                if not anthropic_key:
                    raise RuntimeError("ANTHROPIC_API_KEY not set in .env")

                _job_update(job, status="running", step="Writing script", progress=10)
                await _save_job(job)

                _res = None
                async with _claude_semaphore:
                    for _attempt in range(4):
                        async with httpx.AsyncClient(timeout=90) as _client:
                            _res = await _client.post(
                                "https://api.anthropic.com/v1/messages",
                                headers={"x-api-key": anthropic_key, "anthropic-version": "2023-06-01",
                                         "content-type": "application/json"},
                                json={"model": "claude-sonnet-4-6", "max_tokens": 4000,
                                      "messages": [{"role": "user", "content": video_prompt}]},
                            )
                        if _res.status_code not in (429, 529):
                            break
                        wait = 2 ** (_attempt + 1)
                        _job_update(job, step=f"API busy — retrying in {wait}s ({_attempt+1}/4)")
                        await asyncio.sleep(wait)

                if _res is None or _res.status_code != 200:
                    code = _res.status_code if _res else "no response"
                    raise RuntimeError(f"Claude API error {code}: {(_res.text[:200] if _res else '')}")

                raw_script = _res.json()["content"][0]["text"].strip()
                try:
                    script_data = _parse_json(raw_script)
                except json.JSONDecodeError as e:
                    raise RuntimeError(f"Claude returned invalid JSON for script: {e}")

                # ── Strict scene-type validation ───────────────────────────────
                # Any scene with a type not in this template's allowed list is an
                # immediate hard error — no fallback, no silent skip.
                bad_scenes = [
                    f"scene {s.get('id')} type='{s.get('type_visuel')}'"
                    for s in script_data.get("scenes", [])
                    if s.get("type_visuel") not in allowed_types
                ]
                if bad_scenes:
                    raise RuntimeError(
                        f"Claude generated unsupported scene types for template '{template}': "
                        f"{', '.join(bad_scenes)}. "
                        f"Allowed: {', '.join(allowed_types)}"
                    )

                # Validate required visuel fields are non-empty
                for s in script_data.get("scenes", []):
                    vtype = s.get("type_visuel")
                    visuel = s.get("visuel") or {}
                    required = {
                        "title_card":    ["titre_principal"],
                        "big_number":    ["valeur"],
                        "bar_chart":     ["series"],
                        "text_bullets":  ["items"],
                        "process_steps": ["etapes"],
                        "cta_screen":    ["headline"],
                        "quote_card":    ["citation", "auteur"],
                        "split_screen":  ["colonne_gauche", "colonne_droite"],
                        "comparison_table": ["colonne_gauche", "colonne_droite"],
                    }.get(vtype, [])
                    missing = [f for f in required if not visuel.get(f)]
                    if missing:
                        raise RuntimeError(
                            f"Scene {s.get('id')} ({vtype}) missing required visuel fields: {missing}"
                        )

                script_dir = OUTPUT / "scripts"
                script_dir.mkdir(parents=True, exist_ok=True)
                slug = re.sub(r"[^a-z0-9]+", "-", subject.lower())[:40]
                script_path = script_dir / f"script_{brand_arg}_{slug}_{job_id[:8]}.json"
                script_path.write_text(
                    json.dumps(script_data, ensure_ascii=False, indent=2), encoding="utf-8"
                )

                # Use the template's HTML file for rendering
                template = html_template

            _job_update(job, script_path=str(script_path))
            await _save_job(job)

            node_cmd = ["node", str(PUPPET / "renderer.js"),
                        "--script", str(script_path), "--template", template,
                        "--brand-primary",   brand_primary,
                        "--brand-accent",    brand_accent,
                        "--brand-name",      brand_display,
                        "--brand-bg",        brand_bg,
                        "--heading-font",    brand_heading_font,
                        "--body-font",       brand_body_font,
                        "--heading-size",    brand_heading_size,
                        "--body-size",       brand_body_size,
                        "--caption-size",    brand_caption_size,
                        "--heading-weight",  brand_heading_wt,
                        "--body-weight",     brand_body_wt,
                        "--transition",      transition,
                        "--caption-style",   caption_style]
            if logo_path:
                node_cmd += ["--logo", str(logo_path), "--brand-logo", str(logo_path)]
            await step("Rendering scenes", 35, node_cmd, cwd=PUPPET)

            _assemble_base = [str(PYTHON), str(SCRIPTS / "assemble_video.py"),
                              "--script", str(script_path),
                              "--transition", transition]

            if audio_mode == "music":
                # Download/pick a royalty-free background track, skip ElevenLabs
                await try_step("Selecting background music", 60,
                               [str(PYTHON), str(SCRIPTS / "download_music.py"),
                                "--genre", music_genre, "--count", "1"])
                await step("Assembling video", 85,
                           _assemble_base + ["--music-only", "--music-genre", music_genre])
            else:
                # ElevenLabs is optional — pipeline continues without audio if it fails
                await try_step("Generating audio", 60,
                               [str(PYTHON), str(SCRIPTS / "generate_audio.py"),
                                "--script", str(script_path), "--language", language.lower()])
                await step("Assembling video", 85, _assemble_base)

            video_files = sorted((OUTPUT / "video").glob("*.mp4"),
                                  key=lambda p: p.stat().st_mtime, reverse=True)
            output_file = str(video_files[0]) if video_files else None

        # ════════════════════════════════════════════════════════════════════════
        # CAROUSEL  —  Write copy (Claude) → Render slides (Puppeteer) → PNG set
        # ════════════════════════════════════════════════════════════════════════
        elif content_type == "carousel":
            num_slides = int(data.get("slides", 6))  # user-chosen slide count

            _job_update(job, status="running", step="Writing slide copy", progress=10)
            await _save_job(job)

            # Call Claude to write structured slide content directly
            anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
            if not anthropic_key:
                raise RuntimeError("ANTHROPIC_API_KEY not set in .env")

            lang_map = {"EN": "English", "FR": "French", "NL": "Dutch"}
            lang_name = lang_map.get(language.upper(), "English")
            style_hints = {
                "viral_hook":   "Hook-first, bold statements, curiosity gap.",
                "educational":  "Teach one clear concept per slide. Use data.",
                "data_story":   "Lead each slide with a key stat.",
                "personal":     "First person, personal story, authentic.",
                "provocateur":  "Challenge assumptions, contrarian.",
                "thread":       "Each slide is a standalone punchy point.",
            }
            canva_template = data.get("canva_template_url", "")
            canva_note = f"\nVisual reference: {canva_template}" if canva_template else ""

            # Per-template style + schema hints so Claude generates content that fits the design
            CAROUSEL_HINTS = {
                "carousel_cre": {
                    "style": "Dark navy #08316F + sky blue #00B6FF. Montserrat headlines, Lato body. Rodschinson Investment branding. Premium CRE / investment tone — authoritative, data-rich, institution-grade.",
                    "tone":  "Professional investor content. Use real KPIs, sector yields, market data. Each slide should feel like a Bloomberg slide deck.",
                    "schema": "rich",  # handled separately below
                },
                "carousel_bold": {
                    "style": "Dark navy background, gold (#C8A96E) + sky blue (#00B6FF) accents, geometric SVG frame. Premium investment house feel. Headlines can span 2 lines separated by \\n.",
                    "tone":  "Bold, authoritative, market-intelligence voice. Each content slide leads with a strong claim backed by one key stat.",
                    "schema": "standard",
                },
                "carousel_clean": {
                    "style": "Light (#F4F7FB) background, serif headlines (italic allowed with *text*), sky blue accents. Editorial magazine layout. Clean whitespace.",
                    "tone":  "Thoughtful, analytical, editorial. Body text can be 3-4 sentences. Stat should be compelling with context.",
                    "schema": "standard",
                },
                "carousel_minimal": {
                    "style": "Near-black background, white text, minimal ornamentation. One idea per slide. Copy is compressed — no filler words.",
                    "tone":  "Ultra-concise. Headline = punchy claim. Body = 1-2 tight sentences. CTA is direct.",
                    "schema": "standard",
                },
                "carousel_data": {
                    "style": "Deep dark (#031520) background, cyan (#00B6FF) accents, monospace data aesthetic. Terminal / Bloomberg visual style.",
                    "tone":  "Data-first. Every slide should include a hard number. Stat field is mandatory. Body reads like a data analyst briefing.",
                    "schema": "standard",
                },
                "carousel_realestate": {
                    "style": "Light linen (#F5F2ED) background, navy (#08316F) + gold (#C8A96E) accents, architectural skyline graphic design elements. Premium real estate / CRE feel. Serif headlines allowed with *italic*.",
                    "tone":  "Professional real estate investor voice. Each slide is crisp and visual. Lead with a bold insight, back it with a key stat. CTA is action-oriented.",
                    "schema": "standard",
                },
            }
            tmpl_hint = CAROUSEL_HINTS.get(template, CAROUSEL_HINTS["carousel_bold"])

            # CRE template uses richer slide types with dedicated components
            if template == "carousel_cre":
                carousel_prompt = f"""You are writing content for a LinkedIn carousel for {brand_display}.

TOPIC: {subject}
LANGUAGE: {lang_name}
CONTENT STYLE: {style_hints.get(style, style_hints["educational"])}{canva_note}

TEMPLATE: carousel_cre (Rodschinson Investment — dark navy #08316F + sky blue #00B6FF)
VISUAL DESIGN: {tmpl_hint['style']}
COPY TONE: {tmpl_hint['tone']}

Return ONLY a JSON array with exactly {num_slides} objects using these EXACT types and schemas:

Slide 1 — COVER (type: "title"):
{{"index":1,"type":"title","headline":"Line 1\\nHighlighted line 2","tag":"Category · Year","body":"One-sentence description of what this carousel covers."}}

Slide 2 — KPI CARDS (type: "kpi"):
{{"index":2,"type":"kpi","headline":"Main Heading","subheadline":"Section Label","kpi":[{{"value":"€4.3B","label":"Metric description"}},{{"value":"+34%","label":"Metric description"}},{{"value":"5.0%","label":"Metric description"}}],"body":"1-2 sentence context explaining these numbers."}}

Slide 3 — METRIC BARS (type: "metric"):
{{"index":3,"type":"metric","headline":"Heading\\nSubheading","subheadline":"Section Label","items":[{{"name":"Category name","value":"5.0%","pct":60}},{{"name":"Category name","value":"4.8%","pct":57}},{{"name":"Category name","value":"3.2%","pct":38}},{{"name":"Category name","value":"~200bps","pct":25}}],"body":"Optional insight sentence."}}

Slide 4 — BULLETS or STEPS (type: "bullets" or "steps"):
For bullets: {{"index":4,"type":"bullets","headline":"Point Title","subheadline":"Section Label","items":[{{"icon":"📊","title":"Item title","desc":"2-sentence explanation."}},{{"icon":"🏢","title":"Item title","desc":"2-sentence explanation."}},{{"icon":"📄","title":"Item title","desc":"2-sentence explanation."}}]}}
For steps: {{"index":4,"type":"steps","headline":"N Steps to X","subheadline":"Process","items":[{{"num":1,"title":"Step title","desc":"What happens here."}},{{"num":2,"title":"Step title","desc":"What happens here."}},{{"num":3,"title":"Step title","desc":"What happens here."}}]}}

Slide 5 — HIGHLIGHT STAT (type: "highlight"):
{{"index":5,"type":"highlight","headline":"Section Title","subheadline":"Key Insight","stat":"42% — investors cite X as primary driver","items":[{{"icon":"📈","title":"Bullet title","desc":"Supporting detail."}},{{"icon":"💼","title":"Bullet title","desc":"Supporting detail."}},{{"icon":"🏦","title":"Bullet title","desc":"Supporting detail."}}]}}

Slide 6 — CTA (type: "cta"):
{{"index":6,"type":"cta","headline":"Action Line\\nSecond Line","body":"One sentence inviting the reader to act.","btn":"📞 &nbsp; Book a Consultation","hashtags":["#Tag1","#Tag2","#Tag3"]}}

Rules:
- Slide 1 must be type "title". Slide {num_slides} must be type "cta".
- Use real, specific numbers and facts relevant to the topic.
- For metric pct values: represent the metric as a percentage of some logical maximum (0-100).
- No markdown, no explanation — return ONLY the JSON array."""
            else:
                carousel_prompt = f"""You are writing content for a LinkedIn carousel for {brand_display}.

TOPIC: {subject}
LANGUAGE: {lang_name}
CONTENT STYLE: {style_hints.get(style, style_hints["educational"])}{canva_note}

TEMPLATE: {template}
VISUAL DESIGN: {tmpl_hint['style']}
COPY TONE: {tmpl_hint['tone']}

Write exactly {num_slides} slides. Return ONLY a JSON array. Schema:
[
  {{"index": 1, "type": "title", "headline": "Cover headline (can use \\n for line break)", "subheadline": "One-line hook or subtitle", "cta": "Swipe →", "brand": "{brand_display}"}},
  {{"index": 2, "type": "content", "headline": "Slide point title", "body": "2-3 sentences that develop the point", "stat": "KEY NUMBER — context description"}},
  ...
  {{"index": {num_slides}, "type": "cta", "headline": "Action headline", "body": "One sentence CTA", "hashtags": ["#Tag1","#Tag2","#Tag3"]}}
]
Rules:
- Slide 1 = type "title". Slide {num_slides} = type "cta". All middle slides = type "content".
- stat field format: "VALUE — description" (e.g. "5.75% — prime office yield Brussels").
- Write copy that visually fits the template style described above.
- No markdown, no explanation — return ONLY the JSON array."""

            # Retry up to 4× on 529 overloaded with exponential backoff
            # Semaphore limits concurrent Claude calls so bulk runs don't all hit 529 at once.
            _res = None
            async with _claude_semaphore:
                for _attempt in range(4):
                    async with httpx.AsyncClient(timeout=90) as _client:
                        _res = await _client.post(
                            "https://api.anthropic.com/v1/messages",
                            headers={"x-api-key": anthropic_key, "anthropic-version": "2023-06-01",
                                     "content-type": "application/json"},
                            json={"model": "claude-sonnet-4-6", "max_tokens": 3000,
                                  "messages": [{"role": "user", "content": carousel_prompt}]},
                        )
                    if _res.status_code not in (429, 529):
                        break
                    wait = 2 ** (_attempt + 1)  # 2, 4, 8, 16 s
                    _job_update(job, step=f"API busy — retrying in {wait}s ({_attempt+1}/4)")
                    await asyncio.sleep(wait)
            if _res is None:
                raise RuntimeError("Claude API: no response received")
            if _res.status_code != 200:
                raise RuntimeError(f"Claude API error {_res.status_code}: {_res.text[:200]}")

            raw = _res.json()["content"][0]["text"].strip()
            try:
                _slides = _parse_json(raw)
            except json.JSONDecodeError:
                _slides = []

            if not _slides:
                raise RuntimeError("No slide data returned from Claude")

            # Save the JSON slide data
            carousel_dir = OUTPUT / "carousel"
            carousel_dir.mkdir(parents=True, exist_ok=True)
            job_prefix  = job_id[:8]
            carousel_out = carousel_dir / f"{job_prefix}_slides.json"
            carousel_out.write_text(json.dumps(_slides, ensure_ascii=False, indent=2), encoding="utf-8")

            _job_update(job, status="running", step="Rendering slides", progress=45)
            await _save_job(job)

            # Resolve carousel template (default to carousel_bold)
            carousel_templates = {"carousel_bold", "carousel_clean", "carousel_minimal", "carousel_data", "carousel_cre", "carousel_realestate"}
            carousel_tmpl = template if template in carousel_templates else "carousel_bold"
            # Also accept custom AI-generated carousel templates
            tmpl_file = PUPPET / "templates" / f"{carousel_tmpl}.html"
            if not tmpl_file.exists():
                carousel_tmpl = "carousel_bold"

            # Render slides via Puppeteer carousel renderer
            # Semaphore limits concurrent Chrome instances to prevent Railway OOM.
            async with _render_semaphore:
                _carousel_cmd = [
                    "node", str(PUPPET / "carousel_renderer.js"),
                    "--slides", str(carousel_out),
                    "--template", carousel_tmpl,
                    "--out", str(carousel_dir),
                    "--prefix", job_prefix,
                    "--brand-primary",  brand_primary,
                    "--brand-accent",   brand_accent,
                    "--brand-name",     brand_display,
                    "--brand-bg",       brand_bg,
                    "--heading-font",   brand_heading_font,
                    "--body-font",      brand_body_font,
                    "--heading-size",   brand_heading_size,
                    "--body-size",      brand_body_size,
                    "--caption-size",   brand_caption_size,
                    "--heading-weight", brand_heading_wt,
                    "--body-weight",    brand_body_wt,
                ]
                if logo_path:
                    _carousel_cmd += ["--brand-logo", str(logo_path)]
                await step("Rendering slides", 70, _carousel_cmd, cwd=PUPPET)

            # Collect rendered PNGs — renderer outputs {prefix}_01.png … {prefix}_NN.png
            slide_pngs = sorted(carousel_dir.glob(f"{job_prefix}_*.png"))

            _job_update(job, status="running", step="Exporting slides", progress=90)
            await _save_job(job)

            # output_file points to the JSON (used by carousel-slides endpoint)
            output_file = str(carousel_out)
            # Store PNG paths for the library entry
            slide_png_paths = [str(p) for p in slide_pngs]

        # ════════════════════════════════════════════════════════════════════════
        # IMAGE POST  —  Claude generates full HTML, render to PNG
        # ════════════════════════════════════════════════════════════════════════
        elif content_type == "image_post":
            _job_update(job, status="running", step="AI designing image post", progress=20)
            await _save_job(job)

            # Resolve format dimensions
            fmt_norm = fmt.replace(":", "x")
            fmt_dims = {
                "1x1":  (1080, 1080),
                "4x5":  (1080, 1350),
                "9x16": (1080, 1920),
                "16x9": (1920, 1080),
            }
            width, height = fmt_dims.get(fmt_norm, (1080, 1080))
            ratio_label = {"1x1": "1:1 square", "4x5": "4:5 portrait", "9x16": "9:16 vertical", "16x9": "16:9 landscape"}.get(fmt_norm, "1:1 square")

            # Build brand context
            api_key = os.getenv("ANTHROPIC_API_KEY", "")
            lang_label = {"EN": "English", "FR": "French", "NL": "Dutch"}.get(language, "English")

            heading_font = brand_heading_font or "Inter"
            body_font = brand_body_font or "Inter"

            ai_image_prompt = f"""You are a senior brand designer creating a SINGLE polished social media image post.

BRAND: {brand_display}
BRAND CONTEXT: {brand_context or brand_display}
BRAND COLORS:
- Primary: {brand_primary} (use as background base or main fill)
- Accent: {brand_accent} (use for highlights, CTAs, key numbers, divider lines)
- Background: {brand_bg or brand_primary}
TYPOGRAPHY:
- Heading font: {heading_font}
- Body font: {body_font}

TOPIC: {subject}
LANGUAGE: {lang_label}
FORMAT: {ratio_label} — exactly {width}x{height} pixels

YOUR TASK: Design a complete, self-contained HTML page that renders as a beautiful, scroll-stopping social media image. Use ONLY the brand colors above plus white/light grays for contrast. Include rich graphical elements — NOT just a colored background with one line of text.

Required HTML structure:
- DOCTYPE + html + head + body
- <body> sized exactly {width}x{height}px (set width/height in CSS, overflow:hidden)
- Embed Google Fonts via @import for {heading_font} and {body_font}
- All graphics inline as SVG (no external images)

Design principles for THIS post:
1. Pick ONE strong concept and execute it fully — bold headline + supporting visual
2. Use 2-4 visual layers: background pattern/gradient, decorative SVG elements (circles, lines, geometric shapes, icons, abstract data viz), main text block, accent details
3. Real typography hierarchy: large headline (8-15% of height), supporting line, optional stat/number/CTA
4. Negative space — let elements breathe
5. The post must communicate the topic clearly even without context
6. Optional content patterns to choose from based on topic:
   - Big stat with context (e.g. "73%" with explanation)
   - Quote with attribution and decorative quote marks
   - 3-step framework with numbered circles/icons
   - Comparison: before/after or option A/B
   - Listicle: 3-5 bullets with icons
   - Question-answer hook
   - Process diagram with arrows/connectors
   - Bold statement card with decorative corners
7. Brand watermark/logo text in a subtle position (top-left or bottom)
8. Use modern design trends: subtle gradients, soft shadows (rgba), rounded corners, geometric SVG patterns

CRITICAL RULES:
- Output ONLY raw HTML, no markdown fences, no explanation
- Body must be exactly {width}x{height}px
- Use ONLY {brand_primary} and {brand_accent} as colored elements (plus white/grays for text contrast)
- All text must be in {lang_label}
- Make it look like a $5000 designer agency post — premium, intentional, visually rich
- Inline ALL CSS in <style>, no external dependencies except Google Fonts
- Test mentally: every element should be visible and contribute to the message
"""

            resp = None
            for _attempt in range(3):
                try:
                    async with _claude_semaphore:
                        async with httpx.AsyncClient() as client:
                            resp = await client.post(
                                "https://api.anthropic.com/v1/messages",
                                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                                json={"model": "claude-sonnet-4-6", "max_tokens": 8000,
                                      "messages": [{"role": "user", "content": ai_image_prompt}]},
                                timeout=180,
                            )
                            if resp.status_code == 200:
                                break
                            if resp.status_code in (529, 503, 429):
                                wait = 8 * (_attempt + 1)
                                log.warning("[%s] AI image: API busy %d, retry in %ds", job_id[:8], resp.status_code, wait)
                                await asyncio.sleep(wait)
                                continue
                            raise RuntimeError(f"Claude API error {resp.status_code}: {resp.text[:400]}")
                except httpx.TimeoutException:
                    if _attempt < 2:
                        log.warning("[%s] AI image: timeout, retrying", job_id[:8])
                        continue
                    raise
            if resp is None or resp.status_code != 200:
                raise RuntimeError("AI image generation failed after 3 attempts")

            html_raw = resp.json()["content"][0]["text"].strip()
            # Strip markdown fences if present
            if html_raw.startswith("```"):
                html_raw = re.sub(r"^```[a-z]*\n?", "", html_raw)
                html_raw = re.sub(r"\n?```\s*$", "", html_raw)
                html_raw = html_raw.strip()

            # Find the <html or <!DOCTYPE start
            doc_start = max(html_raw.find("<!DOCTYPE"), html_raw.find("<html"))
            if doc_start > 0:
                html_raw = html_raw[doc_start:]

            _job_update(job, status="running", step="Rendering image", progress=70)
            await _save_job(job)

            # Save HTML and render PNG
            ai_dir = OUTPUT / "images"
            ai_dir.mkdir(parents=True, exist_ok=True)
            html_path = ai_dir / f"post_{job_id[:8]}.html"
            html_path.write_text(html_raw, encoding="utf-8")
            png_path = ai_dir / f"post_{job_id[:8]}.png"

            render_cmd = [
                "node", str(PUPPET / "ai_image_renderer.js"),
                "--html", str(html_path),
                "--output", str(png_path),
                "--format", fmt_norm,
            ]
            code, out, err = await _run(render_cmd, cwd=PUPPET, timeout=60, job_id=job_id)
            if code != 0:
                raise RuntimeError(f"AI image render failed (exit {code})\n{err[-400:]}")

            output_file = str(png_path)
            script_path = html_path

        # ════════════════════════════════════════════════════════════════════════
        # TEXT ONLY  —  Outline → Write (inline Claude) → Polish
        # ════════════════════════════════════════════════════════════════════════
        elif content_type == "text_only":
            if not script_path:
                await step(
                    "Building outline", 15,
                    [str(PYTHON), str(SCRIPTS / "generate_video_script.py"),
                     "--brand", brand_arg, "--sujet", subject,
                     "--format", "linkedin", "--duree", "3.0"],
                )
                files = sorted((OUTPUT / "scripts").glob("script_*.json"),
                               key=lambda p: p.stat().st_mtime, reverse=True)
                if not files:
                    raise RuntimeError("Outline generation produced no output")
                script_path = files[0]

            _job_update(job, script_path=str(script_path), status="running", step="Writing post", progress=55)
            await _save_job(job)

            # Inline Claude call — no external script needed
            async with aiofiles.open(script_path) as _f:
                script_data = json.loads(await _f.read())

            scenes = script_data.get("scenes", [])
            meta   = script_data.get("meta", {})
            hashtags = " ".join(meta.get("hashtags_linkedin", ["#RealEstate", "#Investment", "#Rodschinson"]))
            narrations = "\n".join(f"- {s.get('narration', s.get('nom',''))}" for s in scenes[:6])

            style_hints = {
                "viral_hook":   "Start with a bold controversial hook. Short punchy lines.",
                "educational":  "Teach one clear concept. Use numbered points. Add real data.",
                "data_story":   "Lead with a surprising stat. Tell the story behind the numbers.",
                "personal":     "First person. Share a personal lesson. Be authentic.",
                "provocateur":  "Challenge a common belief. Contrarian stance. Invite debate.",
                "thread":       "Numbered thread format (1/ 2/ 3/…). Each point standalone.",
            }
            lang_map = {"EN": "English", "FR": "French", "NL": "Dutch"}
            lang_name = lang_map.get(language.upper(), "English")

            post_prompt = f"""Write a complete {lang_name} LinkedIn post.

BRAND: {meta.get('brand', brand_arg)}
TOPIC: {subject}
KEY POINTS:
{narrations}

STYLE: {style_hints.get(style, style_hints['educational'])}
LANGUAGE: Write exclusively in {lang_name}.
FORMAT: 150-400 words, line breaks between paragraphs, 3-5 emojis, clear CTA, end with: {hashtags}

Return ONLY the post text, nothing else."""

            anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
            if not anthropic_key:
                raise RuntimeError("ANTHROPIC_API_KEY not set in .env")

            _res = None
            for _attempt in range(4):
                async with httpx.AsyncClient(timeout=90) as _client:
                    _res = await _client.post(
                        "https://api.anthropic.com/v1/messages",
                        headers={"x-api-key": anthropic_key, "anthropic-version": "2023-06-01",
                                 "content-type": "application/json"},
                        json={"model": "claude-sonnet-4-6", "max_tokens": 1500,
                              "messages": [{"role": "user", "content": post_prompt}]},
                    )
                if _res.status_code not in (429, 529):
                    break
                wait = 2 ** (_attempt + 1)
                _job_update(job, step=f"API busy — retrying in {wait}s ({_attempt+1}/4)")
                await asyncio.sleep(wait)
            if _res is None:
                raise RuntimeError("Claude API: no response received")
            if _res.status_code != 200:
                raise RuntimeError(f"Claude API error {_res.status_code}: {_res.text[:200]}")
            post_text = _res.json()["content"][0]["text"].strip()

            _job_update(job, status="running", step="Polishing tone", progress=85)
            await _save_job(job)

            text_out_path = OUTPUT / "text" / f"post_{job_id[:8]}.txt"
            text_out_path.parent.mkdir(parents=True, exist_ok=True)
            text_out_path.write_text(post_text, encoding="utf-8")

            output_file = str(text_out_path)
            output_text = post_text[:5000]

        # ── Property Teaser (PDF) ──────────────────────────────────────────
        elif content_type == "property_teaser":
            property_data = data.get("property_data", {})
            selected_fields = data.get("selected_fields", [])
            teaser_template = data.get("template") or property_data.get("template") or "teaser_building"
            if teaser_template not in TEASER_TEMPLATES:
                teaser_template = "teaser_building"

            # Build a context string from selected fields
            field_lines = []
            field_map = {
                "title": ("Property Name", property_data.get("title", subject)),
                "price": ("Price", property_data.get("price", "")),
                "description": ("Description", property_data.get("description", "")),
                "reference": ("Reference", property_data.get("reference", "")),
                "agent": ("Agent", property_data.get("agent", "")),
                "sectors": ("Sectors", property_data.get("sectors", "")),
                "nda": ("NDA", property_data.get("nda", "")),
                "asset_type": ("Asset Type", property_data.get("asset_label", property_data.get("asset_type", ""))),
                "status": ("Status", property_data.get("status", "")),
            }
            for key in selected_fields:
                if key in field_map:
                    label, val = field_map[key]
                    if val:
                        field_lines.append(f"- {label}: {val}")

            property_context = "\n".join(field_lines) or f"Property: {subject}"

            _job_update(job, status="running", step="Writing teaser copy", progress=10)
            await _save_job(job)

            api_key = os.getenv("ANTHROPIC_API_KEY", "")
            lang_label = {"EN": "English", "FR": "French", "NL": "Dutch"}.get(language, "English")

            teaser_prompt = f"""You are writing a professional property investment teaser / technical sheet for {brand_display}.

PROPERTY DATA:
{property_context}

LANGUAGE: {lang_label}
ASSET TYPE: {property_data.get("asset_label", property_data.get("asset_type", "Property"))}

Generate a structured JSON teaser document with these fields:
{{
  "headline": "Bold property headline (max 60 chars)",
  "subheadline": "One-line positioning statement",
  "asset_type_label": "Display label for the asset type",
  "metrics": [
    {{"label": "metric name", "value": "metric value"}}
  ],
  "highlights": ["Key point 1", "Key point 2", "Key point 3", "Key point 4"],
  "description": "2-3 polished paragraphs describing the investment opportunity",
  "disclaimer": "Brief legal disclaimer"
}}

Rules:
- metrics: include 3-6 key metrics from the provided data (price, surface, yield, year, location, etc.)
- highlights: 3-6 crisp bullet points about the property's strengths
- description: professional, investor-grade language — no hype
- CRITICAL: ALL JSON KEYS must remain in English exactly as shown above. Only translate TEXT VALUES into {lang_label}.
- Return ONLY the raw JSON object, no markdown fences, no extra text.
"""

            async with _claude_semaphore:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        "https://api.anthropic.com/v1/messages",
                        headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                        json={"model": "claude-sonnet-4-6", "max_tokens": 2000,
                              "messages": [{"role": "user", "content": teaser_prompt}]},
                        timeout=60,
                    )
                    resp.raise_for_status()

            teaser_raw = resp.json()["content"][0]["text"]
            teaser_json = _parse_json(teaser_raw)

            # Write teaser JSON
            teaser_path = TEASER_DIR / f"{job_id[:8]}_teaser.json"
            async with aiofiles.open(teaser_path, "w") as f:
                await f.write(json.dumps(teaser_json, indent=2, ensure_ascii=False))

            _job_update(job, status="running", step="Rendering PDF", progress=50)
            await _save_job(job)

            # Render via teaser_renderer.js
            pdf_path  = TEASER_DIR / f"{job_id[:8]}_teaser.pdf"
            thumb_path = TEASER_DIR / f"{job_id[:8]}_thumb.png"

            render_cmd = [
                "node", str(PUPPET / "teaser_renderer.js"),
                "--script", str(teaser_path),
                "--template", teaser_template,
                "--output-pdf", str(pdf_path),
                "--output-thumb", str(thumb_path),
            ]
            # Inject brand colors
            brand_data = await _brand_lookup(brand_arg)
            if brand_data:
                render_cmd += [
                    "--brand-name", brand_data.get("name", "Rodschinson"),
                    "--brand-primary", brand_data.get("primaryColor", "#08316F"),
                    "--brand-accent", brand_data.get("accentColor", "#C8A96E"),
                ]

            code, out, err = await _run(render_cmd, cwd=PUPPET, timeout=60, job_id=job_id)
            if code != 0:
                raise RuntimeError(f"Teaser render failed (exit {code})\n{err[-600:]}")

            output_file = str(pdf_path)
            script_path = teaser_path

            # Store thumbnail path in job for library preview
            job["thumbnail"] = str(thumb_path)

        # ── Property Portfolio (multi-page PDF) ──────────────────────────────
        elif content_type == "property_portfolio":
            _job_update(job, status="running", step="Loading properties", progress=5)
            await _save_job(job)

            # Load all properties from cache
            props_path = OUTPUT / "properties.json"
            all_properties: list[dict] = []
            if props_path.exists():
                async with aiofiles.open(props_path) as f:
                    all_properties = json.loads(await f.read())

            if not all_properties:
                raise RuntimeError("No properties found. Please sync from Odoo first.")

            # Clean property data for portfolio rendering
            for p in all_properties:
                # Strip HTML tags and decode entities from description
                desc = p.get("description", "")
                if desc:
                    desc = re.sub(r"<br\s*/?>", " \u2022 ", desc)
                    desc = re.sub(r"<[^>]+>", "", desc)
                    desc = html_mod.unescape(desc)  # decode &amp; &nbsp; &eacute; etc.
                    desc = desc.replace("\xa0", " ")  # replace non-breaking spaces
                    p["description"] = desc.strip()
                # Extract agent name from [id, name] array
                agent = p.get("agent")
                if isinstance(agent, list):
                    p["agent"] = next((a for a in agent if isinstance(a, str)), "")

            # Filter to selected property IDs (if provided), else all
            selected_ids = data.get("selected_property_ids")
            if selected_ids and isinstance(selected_ids, list) and len(selected_ids) > 0:
                id_set = set(selected_ids)
                all_properties = [p for p in all_properties if p.get("odoo_id") in id_set]
                if not all_properties:
                    raise RuntimeError("None of the selected properties were found.")

            # Group properties by asset type label (merge types with same label)
            type_groups: dict[str, list[dict]] = {}
            type_key_for_label: dict[str, str] = {}  # label -> first asset_type key
            for p in all_properties:
                at = p.get("asset_type") or "other"
                info = ASSET_TYPE_MAP.get(at, {"icon": "\U0001F3E2", "label": at.title(), "template": "teaser_building"})
                label = info["label"]
                if label not in type_key_for_label:
                    type_key_for_label[label] = at
                type_groups.setdefault(label, []).append(p)

            # Build sections (sorted by label, already merged by label)
            sections = []
            for label in sorted(type_groups.keys()):
                at = type_key_for_label[label]
                info = ASSET_TYPE_MAP.get(at, {"icon": "\U0001F3E2", "label": label, "template": "teaser_building"})
                sections.append({
                    "asset_type": at,
                    "label": label,
                    "icon": info["icon"],
                    "properties": type_groups[label],
                })

            total_count = sum(len(s["properties"]) for s in sections)

            _job_update(job, status="running", step="Generating portfolio copy", progress=15)
            await _save_job(job)

            # Use Claude to generate portfolio metadata (title, subtitle, summary)
            api_key = os.getenv("ANTHROPIC_API_KEY", "")
            lang_label = {"EN": "English", "FR": "French", "NL": "Dutch"}.get(language, "English")

            type_summary = ", ".join(f"{s['label']} ({len(s['properties'])})" for s in sections)
            portfolio_prompt = f"""You are preparing a professional property investment portfolio document.

PORTFOLIO CONTENTS: {total_count} properties across {len(sections)} asset types: {type_summary}

LANGUAGE: {lang_label}

Generate a JSON object with:
{{
  "title": "Portfolio title (max 50 chars, in {lang_label}) — DO NOT include any company name or brand name",
  "subtitle": "One-line subtitle (in {lang_label}) — DO NOT include any company name or brand name",
  "disclaimer": "Legal disclaimer (2-3 sentences, in {lang_label})"
}}

Rules:
- Professional, institutional tone
- The title should describe the portfolio content (e.g. 'Property Portfolio', 'Investment Opportunities')
- NEVER include brand names like 'Rodschinson' in the title or subtitle
- ALL JSON KEYS must remain in English exactly as shown. Only translate TEXT VALUES into {lang_label}.
- Return ONLY the raw JSON object, no markdown fences, no extra text.
"""
            async with _claude_semaphore:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        "https://api.anthropic.com/v1/messages",
                        headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                        json={"model": "claude-sonnet-4-6", "max_tokens": 500,
                              "messages": [{"role": "user", "content": portfolio_prompt}]},
                        timeout=60,
                    )
                    resp.raise_for_status()

            portfolio_meta = _parse_json(resp.json()["content"][0]["text"])

            # Build portfolio data JSON
            from datetime import datetime
            date_str = datetime.now().strftime("%B %Y")

            portfolio_json = {
                "title": portfolio_meta.get("title", "Property Portfolio"),
                "subtitle": portfolio_meta.get("subtitle", "Exclusive Investment Opportunities"),
                "date": date_str,
                "disclaimer": portfolio_meta.get("disclaimer", "This document is confidential and for informational purposes only."),
                "sections": sections,
            }

            # Write portfolio JSON
            portfolio_path = TEASER_DIR / f"{job_id[:8]}_portfolio.json"
            async with aiofiles.open(portfolio_path, "w") as f:
                await f.write(json.dumps(portfolio_json, indent=2, ensure_ascii=False))

            _job_update(job, status="running", step="Rendering PDF", progress=50)
            await _save_job(job)

            # Render via portfolio_renderer.js
            pdf_path   = TEASER_DIR / f"{job_id[:8]}_portfolio.pdf"
            thumb_path = TEASER_DIR / f"{job_id[:8]}_portfolio_thumb.png"

            render_cmd = [
                "node", str(PUPPET / "portfolio_renderer.js"),
                "--script", str(portfolio_path),
                "--output-pdf", str(pdf_path),
                "--output-thumb", str(thumb_path),
            ]
            brand_data = await _brand_lookup(brand_arg)
            if brand_data:
                render_cmd += [
                    "--brand-name", brand_data.get("name", "Rodschinson"),
                    "--brand-primary", brand_data.get("primaryColor", "#08316F"),
                    "--brand-accent", brand_data.get("accentColor", "#C8A96E"),
                ]

            code, out, err = await _run(render_cmd, cwd=PUPPET, timeout=120, job_id=job_id)
            if code != 0:
                raise RuntimeError(f"Portfolio render failed (exit {code})\n{err[-600:]}")

            output_file = str(pdf_path)
            script_path = portfolio_path
            job["thumbnail"] = str(thumb_path)

        # ── Property Valuation (AI-powered multi-page PDF) ───────────────────
        elif content_type == "property_valuation":
            property_data = data.get("property_data", {})
            asset_type = property_data.get("asset_type", "building")
            methods = VALUATION_METHODS.get(asset_type, VALUATION_METHODS.get("building", []))
            methods_str = ", ".join(methods)

            # Clean property data
            desc = property_data.get("description", "")
            if desc:
                desc = re.sub(r"<br\s*/?>", " \u2022 ", desc)
                desc = re.sub(r"<[^>]+>", "", desc)
                desc = html_mod.unescape(desc).replace("\xa0", " ").strip()
            agent = property_data.get("agent")
            if isinstance(agent, list):
                agent = next((a for a in agent if isinstance(a, str)), "")

            # Build property context
            ctx_lines = []
            if property_data.get("title"): ctx_lines.append(f"Title: {property_data['title']}")
            if property_data.get("price"): ctx_lines.append(f"Asking Price: {property_data['price']}")
            if property_data.get("price_raw"): ctx_lines.append(f"Price (numeric): {property_data['price_raw']}")
            if desc: ctx_lines.append(f"Description: {desc}")
            if property_data.get("reference"): ctx_lines.append(f"Reference: {property_data['reference']}")
            if property_data.get("asset_label"): ctx_lines.append(f"Asset Type: {property_data['asset_label']}")
            if agent: ctx_lines.append(f"Agent: {agent}")
            if property_data.get("sectors"): ctx_lines.append(f"Sectors: {property_data['sectors']}")
            if property_data.get("nda"): ctx_lines.append(f"NDA: {property_data['nda']}")
            property_context = "\n".join(ctx_lines) or f"Property: {subject}"

            _job_update(job, status="running", step="AI valuation analysis", progress=10)
            await _save_job(job)

            api_key = os.getenv("ANTHROPIC_API_KEY", "")
            lang_label = {"EN": "English", "FR": "French", "NL": "Dutch"}.get(language, "English")
            from datetime import datetime as _dt
            date_str = _dt.now().strftime("%B %Y")

            valuation_prompt = f"""You are a senior property valuation analyst at a leading real estate investment firm. You are preparing a comprehensive, professional valuation report.

PROPERTY DATA:
{property_context}

LANGUAGE: {lang_label}
ASSET TYPE: {property_data.get("asset_label", asset_type.title())}
APPLICABLE VALUATION METHODS: {methods_str}

IMPORTANT: Extract the property address/location from the title and description. Look for city names, regions, street addresses, postal codes, or geographic references. If location is mentioned in the title (e.g. "BRUSSELS", "WAVRE", "LIEGE"), use it.

Generate a comprehensive JSON valuation report:
{{
  "property_name": "property name from title",
  "reference": "reference code if available",
  "valuation_date": "{date_str}",
  "asset_type_label": "display label for asset type",
  "location": {{
    "address": "extracted street address or area",
    "city": "city name",
    "region": "region/province",
    "country": "country",
    "context": "1-2 sentences about the location's investment context"
  }},
  "executive_summary": {{
    "narrative": "3-4 sentences summarizing the valuation conclusion and key findings",
    "estimated_value": "EUR X.XM formatted",
    "value_range": {{ "low": "EUR X.XM", "mid": "EUR X.XM", "high": "EUR X.XM" }},
    "key_metrics": [
      {{ "label": "metric name", "value": "metric value" }}
    ]
  }},
  "property_overview": {{
    "description": "2-3 paragraphs describing the property and its investment characteristics",
    "characteristics": [
      {{ "label": "characteristic name", "value": "value" }}
    ],
    "operational_metrics": [
      {{ "label": "metric name", "value": "value" }}
    ]
  }},
  "valuation_methods": [
    {{
      "name": "Method Name",
      "description": "1-2 paragraphs explaining the methodology and why it applies",
      "assumptions": [
        {{ "parameter": "param name", "value": "param value", "basis": "reasoning" }}
      ],
      "calculation_steps": [
        {{ "step": "step description", "value": "calculated value" }}
      ],
      "result": "EUR X.XM",
      "confidence": "high|medium|low",
      "weight": 0.XX
    }}
  ],
  "market_context": {{
    "narrative": "2-3 paragraphs about current market conditions in this location/asset class",
    "indicators": [
      {{ "label": "indicator name", "value": "value", "trend": "up|stable|down" }}
    ],
    "comparables": [
      {{ "description": "comparable transaction description", "value": "EUR value" }}
    ]
  }},
  "risk_assessment": {{
    "narrative": "1-2 paragraphs about the risk profile",
    "risks": [
      {{ "factor": "risk name", "severity": "high|medium|low", "likelihood": "high|medium|low", "mitigation": "mitigation strategy" }}
    ],
    "sensitivity": [
      {{ "scenario": "what-if scenario", "impact": "impact on value" }}
    ]
  }},
  "conclusion": {{
    "recommended_value": "EUR X.XM",
    "methodology_weights": "explanation of how methods were reconciled",
    "next_steps": ["step 1", "step 2", "step 3"],
    "disclaimer": "Legal disclaimer in {lang_label}"
  }}
}}

RULES:
- Apply each method in APPLICABLE VALUATION METHODS with realistic calculations
- Use standard real estate valuation principles and market benchmarks
- All monetary values in EUR with proper formatting
- key_metrics: 4-6 relevant metrics (yield, price/m2, occupancy, etc.)
- characteristics: 4-8 physical/legal characteristics
- operational_metrics: 3-6 if applicable (NOI, rent, occupancy)
- risks: 4-6 risk factors
- sensitivity: 3-4 scenarios
- comparables: 2-4 comparable transactions
- weights across all valuation_methods must sum to 1.0
- Be realistic: if data is limited, note lower confidence and wider value ranges
- CRITICAL: ALL JSON KEYS must remain EXACTLY as shown in the schema above (English keys like "property_name", "executive_summary", "valuation_methods", etc.). NEVER translate the JSON keys.
- Only translate the TEXT VALUES (strings) into {lang_label}
- Return ONLY the raw JSON object. No markdown fences, no explanatory text before or after, no ```json blocks. Just the {{ and }} with content between them.
"""

            log.info("[%s] Calling Claude API for valuation (key: %s...)", job_id[:8], api_key[:8] if api_key else "MISSING")
            resp = None
            for _attempt in range(3):
                async with _claude_semaphore:
                    log.info("[%s] Attempt %d — sending request", job_id[:8], _attempt + 1)
                    async with httpx.AsyncClient() as client:
                        resp = await client.post(
                            "https://api.anthropic.com/v1/messages",
                            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                            json={"model": "claude-sonnet-4-6", "max_tokens": 16000,
                                  "messages": [{"role": "user", "content": valuation_prompt}]},
                            timeout=180,
                        )
                        log.info("[%s] Claude responded: %d", job_id[:8], resp.status_code)
                        if resp.status_code == 200:
                            break
                        if resp.status_code in (529, 503, 429):
                            wait = 10 * (_attempt + 1)
                            log.warning("[%s] API overloaded (%d), retrying in %ds", job_id[:8], resp.status_code, wait)
                            _job_update(job, step=f"API busy, retrying in {wait}s...")
                            await _save_job(job)
                            await asyncio.sleep(wait)
                            continue
                        raise RuntimeError(f"Claude API error {resp.status_code}: {resp.text[:500]}")
            if resp is None or resp.status_code != 200:
                raise RuntimeError(f"Claude API failed after 3 attempts: {resp.status_code if resp else 'no response'}")

            valuation_json = _parse_json(resp.json()["content"][0]["text"])

            # Write valuation JSON
            val_path = TEASER_DIR / f"{job_id[:8]}_valuation.json"
            async with aiofiles.open(val_path, "w") as f:
                await f.write(json.dumps(valuation_json, indent=2, ensure_ascii=False))

            _job_update(job, status="running", step="Rendering PDF", progress=60)
            await _save_job(job)

            # Render via valuation_renderer.js
            pdf_path   = TEASER_DIR / f"{job_id[:8]}_valuation.pdf"
            thumb_path = TEASER_DIR / f"{job_id[:8]}_valuation_thumb.png"

            render_cmd = [
                "node", str(PUPPET / "valuation_renderer.js"),
                "--script", str(val_path),
                "--output-pdf", str(pdf_path),
                "--output-thumb", str(thumb_path),
            ]
            brand_data = await _brand_lookup(brand_arg)
            if brand_data:
                render_cmd += [
                    "--brand-name", brand_data.get("name", "Rodschinson"),
                    "--brand-primary", brand_data.get("primaryColor", "#08316F"),
                    "--brand-accent", brand_data.get("accentColor", "#C8A96E"),
                ]

            code, out, err = await _run(render_cmd, cwd=PUPPET, timeout=90, job_id=job_id)
            if code != 0:
                raise RuntimeError(f"Valuation render failed (exit {code})\n{err[-600:]}")

            output_file = str(pdf_path)
            script_path = val_path
            job["thumbnail"] = str(thumb_path)

        # ── Property Long Teaser (with photos/plans) ────────────────────────
        elif content_type == "property_long_teaser":
            property_data = data.get("property_data", {})
            extra = data.get("long_teaser_fields", {})

            _job_update(job, status="running", step="Preparing long teaser", progress=10)
            await _save_job(job)

            # Clean description
            desc = property_data.get("description", "")
            if desc:
                desc = re.sub(r"<br\s*/?>", " \u2022 ", desc)
                desc = re.sub(r"<[^>]+>", "", desc)
                desc = html_mod.unescape(desc).replace("\xa0", " ").strip()
            agent = property_data.get("agent")
            if isinstance(agent, list):
                agent = next((a for a in agent if isinstance(a, str)), "")

            # Translate title + description to target language if needed (Odoo content
            # can be EN/FR/NL depending on the record). Claude returns text unchanged when
            # it's already in the target language.
            _title_src = property_data.get("title", subject) or ""
            target_lang_name = {"EN": "English", "FR": "French", "NL": "Dutch"}.get(language, "English")
            if (_title_src or desc) and language in ("EN", "FR", "NL"):
                _job_update(job, status="running", step=f"Translating content to {target_lang_name}", progress=15)
                await _save_job(job)
                try:
                    tr_prompt = (
                        f"Translate the following real-estate listing TITLE and DESCRIPTION into {target_lang_name}. "
                        f"If a field is already in {target_lang_name}, return it verbatim. "
                        f"Preserve reference codes (like #1X+6_DRDY_LUX), numbers, units (m\u00b2, \u20ac, %), "
                        f"street names, city names, bullet separators (\u2022) and line breaks exactly. "
                        f"Do NOT translate property reference codes or proper nouns (city/street/building names). "
                        f"Return ONLY a compact JSON object, no prose, no code fences:\n"
                        f'{{"title":"...","description":"..."}}\n\n'
                        f"TITLE: {_title_src}\n\n"
                        f"DESCRIPTION: {desc}"
                    )
                    tr_raw = await _claude_strategy(tr_prompt)
                    tr_obj = _parse_json(tr_raw) if tr_raw else None
                    if isinstance(tr_obj, dict):
                        if tr_obj.get("title"):
                            property_data["title"] = tr_obj["title"]
                        if tr_obj.get("description"):
                            desc = tr_obj["description"]
                        log.info("[%s] Translated title/description to %s", job_id[:8], target_lang_name)
                except Exception as e:
                    log.warning("[%s] Translation to %s failed, using source content: %s", job_id[:8], target_lang_name, e)

            # Save uploaded photos and plans to disk, collect file:// paths
            upload_dir = TEASER_DIR / f"{job_id[:8]}_long_assets"
            upload_dir.mkdir(parents=True, exist_ok=True)

            photo_paths: list[str] = []
            plan_paths: list[str] = []

            _raw_plans = data.get("plans", [])
            _raw_docs  = data.get("documents", [])
            log.info("[%s] Long teaser inputs: photos=%d, plans_raw=%d (types=%s), documents=%d",
                     job_id[:8],
                     len(data.get("photos", [])),
                     len(_raw_plans),
                     [type(p).__name__ + (':pdf' if isinstance(p, dict) and p.get('type')=='pdf' else '') for p in _raw_plans],
                     len(_raw_docs))

            # Photos and plans are passed as base64 data URIs or file paths
            for i, photo in enumerate(data.get("photos", [])):
                if photo.startswith("data:"):
                    import base64 as _b64
                    header, b64data = photo.split(",", 1)
                    ext = "jpg" if "jpeg" in header or "jpg" in header else "png"
                    fpath = upload_dir / f"photo_{i:02d}.{ext}"
                    fpath.write_bytes(_b64.b64decode(b64data))
                    photo_paths.append(f"file://{fpath}")
                else:
                    photo_paths.append(photo)

            for i, plan in enumerate(data.get("plans", [])):
                # Plan can be:
                #  - a base64 data URI string (single image)
                #  - a string URL/path
                #  - a dict {type: "pdf", name: ..., data: data_uri} (multi-page PDF)
                if isinstance(plan, dict) and plan.get("type") == "pdf":
                    # Render each PDF page as a PNG plan
                    import base64 as _b64
                    pdf_data_uri = plan.get("data", "")
                    if not pdf_data_uri.startswith("data:"):
                        continue
                    try:
                        _, b64data = pdf_data_uri.split(",", 1)
                        pdf_bytes = _b64.b64decode(b64data)
                        import fitz  # PyMuPDF
                        pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                        for page_idx in range(len(pdf_doc)):
                            page = pdf_doc[page_idx]
                            # Render at 2x for crisp PDF -> 144 DPI
                            pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
                            fpath = upload_dir / f"plan_{i:02d}_p{page_idx:02d}.png"
                            pix.save(str(fpath))
                            plan_paths.append(f"file://{fpath}")
                        pdf_doc.close()
                        log.info("[%s] Extracted %d pages from PDF plan: %s", job_id[:8], len(pdf_doc), plan.get("name", ""))
                    except Exception as e:
                        log.warning("[%s] Failed to extract PDF plan pages: %s", job_id[:8], e)
                elif isinstance(plan, str) and plan.startswith("data:"):
                    import base64 as _b64
                    header, b64data = plan.split(",", 1)
                    ext = "jpg" if "jpeg" in header or "jpg" in header else "png"
                    fpath = upload_dir / f"plan_{i:02d}.{ext}"
                    fpath.write_bytes(_b64.b64decode(b64data))
                    plan_paths.append(f"file://{fpath}")
                elif isinstance(plan, str):
                    plan_paths.append(plan)

            # Fallback: if no plans uploaded, auto-extract from any document PDF whose
            # filename hints at plans ("plan", "plans", "floor", "layout", "grundriss", "plattegrond")
            if not plan_paths and _raw_docs:
                import base64 as _b64
                _plan_hint = re.compile(r"\b(plan|plans|floor|layout|grundriss|plattegrond|implantation)\b", re.I)
                for i, doc in enumerate(_raw_docs):
                    if not isinstance(doc, dict):
                        continue
                    name = doc.get("name", "")
                    data_uri = doc.get("data", "")
                    is_pdf = name.lower().endswith(".pdf") or "pdf" in data_uri[:64].lower()
                    if not (is_pdf and _plan_hint.search(name)):
                        continue
                    if not data_uri.startswith("data:"):
                        continue
                    try:
                        _, b64data = data_uri.split(",", 1)
                        pdf_bytes = _b64.b64decode(b64data)
                        import fitz
                        pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                        for page_idx in range(len(pdf_doc)):
                            pg = pdf_doc[page_idx]
                            pix = pg.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
                            fpath = upload_dir / f"plan_from_doc_{i:02d}_p{page_idx:02d}.png"
                            pix.save(str(fpath))
                            plan_paths.append(f"file://{fpath}")
                        pdf_doc.close()
                        log.info("[%s] Auto-extracted %d plan pages from document '%s'", job_id[:8], len(pdf_doc), name)
                    except Exception as e:
                        log.warning("[%s] Failed to auto-extract plan pages from '%s': %s", job_id[:8], name, e)

            log.info("[%s] Final plan_paths count: %d", job_id[:8], len(plan_paths))

            # Map image (single)
            map_image_path = ""
            map_data = data.get("map_image", "")
            if map_data and map_data.startswith("data:"):
                import base64 as _b64
                header, b64data = map_data.split(",", 1)
                ext = "jpg" if "jpeg" in header or "jpg" in header else "png"
                fpath = upload_dir / f"map.{ext}"
                fpath.write_bytes(_b64.b64decode(b64data))
                map_image_path = f"file://{fpath}"
            elif map_data:
                map_image_path = map_data

            # Extract text from source documents (PDF, DOCX, images) and use Claude
            # to fill in any missing fields the user didn't provide
            documents = data.get("documents", [])
            extracted_text_chunks = []
            if documents:
                _job_update(job, status="running", step=f"Extracting data from {len(documents)} document(s)", progress=20)
                await _save_job(job)
                import base64 as _b64
                for i, doc in enumerate(documents):
                    try:
                        data_uri = doc.get("data", "") if isinstance(doc, dict) else doc
                        name = doc.get("name", f"doc_{i}") if isinstance(doc, dict) else f"doc_{i}"
                        if not data_uri.startswith("data:"):
                            continue
                        header, b64data = data_uri.split(",", 1)
                        raw_bytes = _b64.b64decode(b64data)
                        lname = name.lower()
                        text = ""
                        if lname.endswith(".pdf") or "pdf" in header:
                            try:
                                import pypdf, io as _io
                                reader = pypdf.PdfReader(_io.BytesIO(raw_bytes))
                                text = "\n".join((p.extract_text() or "") for p in reader.pages)
                            except Exception as e:
                                log.warning("[%s] PDF extract failed for %s: %s", job_id[:8], name, e)
                        elif lname.endswith(".docx") or "wordprocessingml" in header:
                            try:
                                import docx as _docx, io as _io
                                d = _docx.Document(_io.BytesIO(raw_bytes))
                                text = "\n".join(p.text for p in d.paragraphs if p.text.strip())
                            except Exception as e:
                                log.warning("[%s] DOCX extract failed for %s: %s", job_id[:8], name, e)
                        elif lname.endswith(".txt") or "text/plain" in header:
                            try:
                                text = raw_bytes.decode("utf-8", errors="ignore")
                            except Exception:
                                pass
                        elif "image/" in header:
                            # For images, we'll pass directly to Claude vision below
                            text = f"[IMAGE:{name}]{data_uri}"
                        if text:
                            extracted_text_chunks.append(f"--- {name} ---\n{text[:8000]}")
                    except Exception as e:
                        log.warning("[%s] Could not process document %s: %s", job_id[:8], name if 'name' in dir() else 'unknown', e)

            # Ask Claude to extract ALL relevant data from documents (not just missing fields).
            # Claude decides what's relevant for a property teaser; user-provided values still win.
            extracted_fields: dict = {}
            if extracted_text_chunks:
                _job_update(job, status="running", step="AI analyzing documents", progress=30)
                await _save_job(job)
                api_key = os.getenv("ANTHROPIC_API_KEY", "")
                lang_label_for_extract = {"EN": "English", "FR": "French", "NL": "Dutch"}.get(language, "English")
                combined_text = "\n\n".join(extracted_text_chunks)[:80000]
                combined_text = re.sub(r"\[IMAGE:[^\]]+\]data:[^\s]+", "[image content not shown]", combined_text)

                # Show user-provided values to Claude so it knows what NOT to override
                user_provided = {
                    "address": extra.get("address", "") or "(empty)",
                    "surfaces": extra.get("surfaces") or "(empty)",
                    "payment_terms": extra.get("payment_terms", "") or "(empty)",
                    "current_description": desc or "(empty)",
                }

                extract_prompt = f"""You are a real estate analyst extracting data from property documents to enrich a property teaser.

PROPERTY CONTEXT (from CRM):
- Title: {property_data.get("title", "")}
- Reference: {property_data.get("reference", "")}
- Asset Type: {property_data.get("asset_label", property_data.get("asset_type", ""))}
- Asking Price: {property_data.get("price", "")}

USER ALREADY PROVIDED:
- Address: {user_provided["address"]}
- Surfaces: {user_provided["surfaces"]}
- Payment Terms: {user_provided["payment_terms"]}
- Current Description: {user_provided["current_description"]}

DOCUMENTS CONTENT:
{combined_text}

TASK: Carefully analyze the documents and extract ALL relevant data that should appear on a professional property teaser. Decide what is RELEVANT (location, dimensions, financials, technical specs, certifications, conditions) versus IRRELEVANT (internal reference numbers, owner names, dates, page numbers, redundant info).

Return JSON in {lang_label_for_extract}:
{{
  "address": "full street address with postal code and city, or null if not in docs",
  "surfaces": [
    {{"floor": "floor name or area type", "area": "X m\u00b2"}},
    ...
  ],
  "payment_terms": "payment conditions, financing options, or null",
  "extra_bullets": [
    "Additional fact 1 (e.g. 'Annual rental income: 116.580 EUR')",
    "Additional fact 2 (e.g. 'Energy rating: PEB C/D')",
    "Additional fact 3 (e.g. 'Rental yield: approx 7%')",
    "..."
  ]
}}

EXTRACTION RULES:
- surfaces: include ALL surface/area mentions (habitable surface, total surface, land surface, per-floor breakdown, parking, basement, etc.)
- extra_bullets: extract 4-12 facts that would interest an investor — financials (rental income, yield, NOI), technical (energy rating, year built, renovation status, compliance), composition (number of units, parking spaces), notable features. Use the source language naturally.
- Each extra_bullet should be ONE concise fact (max 100 chars), formatted as a complete statement
- DO NOT include facts that are already in the user's "Current Description" above — only NEW facts
- DO NOT include reference numbers, owner names, internal IDs, dates of preparation
- For surfaces with multiple values (e.g. "+/- 525 m\u00b2"), keep the original notation
- All text in {lang_label_for_extract}
- Return ONLY the raw JSON object, no markdown fences.
"""
                try:
                    async with _claude_semaphore:
                        async with httpx.AsyncClient() as client:
                            resp = await client.post(
                                "https://api.anthropic.com/v1/messages",
                                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                                json={"model": "claude-sonnet-4-6", "max_tokens": 4000,
                                      "messages": [{"role": "user", "content": extract_prompt}]},
                                timeout=120,
                            )
                            if resp.status_code == 200:
                                extracted_fields = _parse_json(resp.json()["content"][0]["text"]) or {}
                                log.info("[%s] Extracted: addr=%s, surfaces=%d, bullets=%d",
                                         job_id[:8],
                                         bool(extracted_fields.get("address")),
                                         len(extracted_fields.get("surfaces") or []),
                                         len(extracted_fields.get("extra_bullets") or []))
                except Exception as e:
                    log.warning("[%s] Document extraction failed: %s", job_id[:8], e)

            # ── Merge: user-provided wins, extracted fills gaps and enriches ──
            merged_address = extra.get("address") or (extracted_fields.get("address") or "")
            merged_payment = extra.get("payment_terms") or (extracted_fields.get("payment_terms") or "")

            # Surfaces: prefer user-provided; otherwise use extracted
            merged_surfaces = extra.get("surfaces") or (extracted_fields.get("surfaces") or [])

            # Description: append extracted extra_bullets to existing description (deduplicated by text similarity)
            extra_bullets = extracted_fields.get("extra_bullets") or []
            if extra_bullets:
                # Normalize existing bullets to compare
                existing_normalized = set()
                if desc:
                    for line in re.split(r"\s*\u2022\s*|\n", desc):
                        norm = re.sub(r"\W+", "", line.lower()).strip()
                        if norm:
                            existing_normalized.add(norm[:50])

                new_bullets = []
                for b in extra_bullets:
                    if not b or not isinstance(b, str):
                        continue
                    norm = re.sub(r"\W+", "", b.lower()).strip()[:50]
                    if norm and norm not in existing_normalized:
                        new_bullets.append(b.strip())
                        existing_normalized.add(norm)

                if new_bullets:
                    bullet_str = " \u2022 ".join(new_bullets)
                    desc = (desc + " \u2022 " + bullet_str) if desc else ("\u2022 " + bullet_str)

            lang_label = {"EN": "English", "FR": "French", "NL": "Dutch"}.get(language, "English")

            # Language-aware labels
            L = {
                "EN": {
                    "tab_activa": "Asset", "tab_locatie": "Location", "tab_photos": "Photos",
                    "tab_plans": "Plans", "tab_sales": "Sales conditions",
                    "address_label": "Address:", "description_label": "Description:",
                    "price_label": "Price:", "price_label_total": "Total price:",
                    "infos_label": "Info:", "docs_label": "Additional documents",
                    "docs_helper": "Click here to download the file documents",
                    "map_link_text": "Click to view on Google Maps", "cover_badge": "Property Teaser",
                    "disclaimer": "*These informations are approximate and given for indicative purposes. As these elements must be confirmed, specified or corrected, no decision may be made on the basis of this document nor engage the responsibility of Rodschinson Investment. For more information, please contact one of our Investment Portfolio Managers at the Brussels office: Tel: +32 (0) 2 550 36 87, Email: assets.brussels@rodschinson.com. Rodschinson Investment - Bastion Tower - Place du Champ de Mars n\u00b05 - 1050 Brussels (BE)",
                },
                "FR": {
                    "tab_activa": "Actif", "tab_locatie": "Localisation", "tab_photos": "Photos",
                    "tab_plans": "Plans", "tab_sales": "Conditions de vente",
                    "address_label": "Adresse :", "description_label": "Description :",
                    "price_label": "Prix :", "price_label_total": "Prix total :",
                    "infos_label": "Infos :", "docs_label": "Documents compl\u00e9mentaires",
                    "docs_helper": "Cliquez ici pour t\u00e9l\u00e9charger les documents",
                    "map_link_text": "Cliquez pour visualiser sur Google Maps", "cover_badge": "Teaser de la propri\u00e9t\u00e9",
                    "disclaimer": "*Ces informations sont approximatives et d\u00e9livr\u00e9es \u00e0 titre indicatif. Ces \u00e9l\u00e9ments devant \u00eatre confirm\u00e9s, pr\u00e9cis\u00e9s ou corrig\u00e9s, aucune d\u00e9cision ne pourra \u00eatre prise sur base du pr\u00e9sent document et engager la responsabilit\u00e9 de Rodschinson Investment. Pour de plus amples informations, merci de contacter un de nos Investment Portfolio Managers du bureau de Bruxelles : Tel : +32 (0) 2 550 36 87, Email : assets.brussels@rodschinson.com. Rodschinson Investment - Bastion Tower - Place du Champ de Mars n\u00b05 - 1050 Bruxelles (BE)",
                },
                "NL": {
                    "tab_activa": "Activa", "tab_locatie": "Locatie", "tab_photos": "Foto's",
                    "tab_plans": "Plannen", "tab_sales": "Verkoopvoorwaarden",
                    "address_label": "Adres:", "description_label": "Beschrijving:",
                    "price_label": "Prijs:", "price_label_total": "Totale prijs:",
                    "infos_label": "Info :", "docs_label": "Aanvullende documenten",
                    "docs_helper": "Klik hier om de bestandsdocumenten te downloaden",
                    "map_link_text": "Klik om te bekijken op Google Maps", "cover_badge": "Eigendom Teaser",
                    "disclaimer": "*Deze informatie is benaderend en wordt ter informatie verstrekt. Aangezien deze elementen moeten worden bevestigd, gespecificeerd of gecorrigeerd, kan op basis van dit document geen beslissing worden genomen die de verantwoordelijkheid van Rodschinson Investment in gevaar brengt. Voor meer informatie kunt u contact opnemen met een van onze Investment Portfolio Managers van het kantoor in Brussel: Tel: +32 (0) 2 550 36 87, E-mail: assets.brussels@rodschinson.com. Rodschinson Investment - Bastion Tower - Place du Champ de Mars n\u00b05 - 1050 Brussel (BE)",
                },
            }.get(language, None) or {}
            if not L:
                L = {
                    "tab_activa": "Asset", "tab_locatie": "Location", "tab_photos": "Photos",
                    "tab_plans": "Plans", "tab_sales": "Sales conditions",
                    "address_label": "Address:", "description_label": "Description:",
                    "price_label": "Price:", "price_label_total": "Total price:",
                    "infos_label": "Info:", "docs_label": "Additional documents",
                    "docs_helper": "Click here to download the file documents",
                    "map_link_text": "Click to view on Google Maps", "cover_badge": "Property Teaser",
                    "disclaimer": "",
                }

            # Build teaser JSON
            teaser_data = {
                "title": property_data.get("title", subject),
                "reference": property_data.get("reference", ""),
                "price": property_data.get("price", ""),
                "description": desc,
                "address": merged_address,
                "address_label": L["address_label"],
                "description_label": L["description_label"],
                "price_label": L["price_label"],
                "price_label_total": L["price_label_total"],
                "infos_label": L["infos_label"],
                "docs_label": L["docs_label"],
                "docs_helper": L["docs_helper"],
                "map_link_text": L["map_link_text"],
                "cover_badge": L.get("cover_badge", "Property Teaser"),
                "disclaimer": L["disclaimer"],
                "tab_activa": L["tab_activa"],
                "tab_locatie": L["tab_locatie"],
                "tab_photos": L["tab_photos"],
                "tab_plans": L["tab_plans"],
                "tab_sales": L["tab_sales"],
                "plans_label": {"EN": "Plans:", "FR": "Plans :", "NL": "Plannen:"}.get(language, "Plans:"),
                "surfaces_label": {"EN": "SURFACE DETAILS", "FR": "D\u00c9TAIL DES SUPERFICIES", "NL": "OPPERVLAKTEDETAILS"}.get(language, "SURFACE DETAILS"),
                "surface_col1": {"EN": "Floor", "FR": "\u00c9tage", "NL": "Verdieping"}.get(language, "Floor"),
                "surface_col2": {"EN": "Area in m\u00b2", "FR": "Superficie en m\u00b2", "NL": "Oppervlakte in m\u00b2"}.get(language, "Area"),
                "payment_terms": merged_payment,
                "sharepoint_url": extra.get("sharepoint_url", ""),
                "sharepoint_label": {"EN": "Access full dossier", "FR": "Acc\u00e9der au dossier complet", "NL": "Volledig dossier openen"}.get(language, "Access full dossier"),
                "expertise_url": extra.get("expertise_url", ""),
                "map_url": map_image_path or extra.get("map_url", ""),
                "surfaces": merged_surfaces,
                "photos": photo_paths,
                "plans": plan_paths,
                # Agent (contact shown on the sales conditions page). User selection wins;
                # falls back to Odoo responsible, then default office contact.
                "agent_name":  (extra.get("agent_name")  or (agent if isinstance(agent, str) and agent.strip() else "Adam Meri")),
                "agent_role":  (extra.get("agent_role")  or "Investment Portfolio Manager"),
                "agent_phone": (extra.get("agent_phone") or "+32 2 550 36 87"),
                "agent_email": (extra.get("agent_email") or "assets.brussels@rodschinson.com"),
            }

            _job_update(job, status="running", step="Rendering PDF", progress=50)
            await _save_job(job)

            # Write teaser JSON
            teaser_path = TEASER_DIR / f"{job_id[:8]}_long_teaser.json"
            async with aiofiles.open(teaser_path, "w") as f:
                await f.write(json.dumps(teaser_data, indent=2, ensure_ascii=False))

            # Render PDF
            pdf_path   = TEASER_DIR / f"{job_id[:8]}_long_teaser.pdf"
            thumb_path = TEASER_DIR / f"{job_id[:8]}_long_teaser_thumb.png"

            render_cmd = [
                "node", str(PUPPET / "long_teaser_renderer.js"),
                "--script", str(teaser_path),
                "--output-pdf", str(pdf_path),
                "--output-thumb", str(thumb_path),
            ]
            brand_data = await _brand_lookup(brand_arg)
            if brand_data:
                render_cmd += [
                    "--brand-name", brand_data.get("name", "Rodschinson"),
                    "--brand-primary", brand_data.get("primaryColor", "#08316F"),
                    "--brand-accent", brand_data.get("accentColor", "#C8A96E"),
                ]

            code, out, err = await _run(render_cmd, cwd=PUPPET, timeout=90, job_id=job_id)
            if code != 0:
                raise RuntimeError(f"Long teaser render failed (exit {code})\n{err[-600:]}")

            output_file = str(pdf_path)
            script_path = teaser_path
            job["thumbnail"] = str(thumb_path)

        else:
            raise RuntimeError(f"Unknown content_type: {content_type!r}")

        # ── Finalise ──────────────────────────────────────────────────────────
        _job_update(job, status="done", step="Complete", progress=100, output_file=output_file)
        await _save_job(job)
        log.info("[%s] Pipeline complete (%s) → %s", job_id[:8], content_type, output_file)

        lib_entry: dict = {
            "job_id":       job_id,
            "title":        subject[:80],
            "brand":        brand_arg,
            "language":     language,
            "content_type": content_type,
            "format":       fmt,
            "template":     template,
            "platforms":    data.get("platforms", []),
            "output_file":  output_file,
            "script_path":  str(script_path) if script_path else None,
            "status":       "Draft",
            "created_at":   job["created_at"],
            "updated_at":   _now(),
        }
        if output_text:
            lib_entry["output_text"] = output_text
        if slide_png_paths:
            lib_entry["slide_images"] = slide_png_paths
        if job.get("thumbnail"):
            lib_entry["thumbnail"] = job["thumbnail"]

        await _library_append(lib_entry)

    except asyncio.CancelledError:
        log.info("[%s] Pipeline aborted by user", job_id[:8])
        _job_update(job, status="aborted", step="Aborted", detail="Generation cancelled by user.")
        await _save_job(job)
    except Exception as exc:
        import traceback
        err_detail = str(exc) or f"{type(exc).__name__}: {traceback.format_exc()[-500:]}"
        log.error("[%s] Pipeline error (%s): %s", job_id[:8], type(exc).__name__, err_detail)
        _job_update(job, status="error", step="Failed", detail=err_detail)
        await _save_job(job)
    finally:
        _job_tasks.pop(job_id, None)
        _job_procs.pop(job_id, None)


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/api/hello")
def hello():
    return {"message": "Rodschinson Content Studio API is live"}

@app.get("/api/health")
def health():
    return {"status": "ok"}


# ── Generate ───────────────────────────────────────────────────────────────────

@app.post("/api/generate", status_code=202)
async def generate(request: Request):
    _check_rate_limit(request.client.host if request.client else "unknown")
    # Parse multipart with raised limits (default 1MB per part is too small for base64 uploads)
    form = await request.form(max_files=100, max_fields=100, max_part_size=100 * 1024 * 1024)  # 100MB per part
    payload_raw = form.get("payload")
    if not payload_raw or not isinstance(payload_raw, str):
        raise HTTPException(422, "Missing payload field")
    try:
        data = json.loads(payload_raw)
    except json.JSONDecodeError:
        raise HTTPException(422, "Invalid payload JSON")
    if not data.get("subject", "").strip():
        raise HTTPException(422, "subject is required")

    logo = form.get("logo")
    logo_path: Path | None = None
    if logo is not None and not isinstance(logo, str) and getattr(logo, "filename", None):
        logo_dest = OUTPUT / "images" / f"logo_{uuid.uuid4().hex[:8]}_{logo.filename}"
        logo_dest.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(logo_dest, "wb") as f:
            await f.write(await logo.read())
        logo_path = logo_dest

    job_id = str(uuid.uuid4())
    job = {
        "job_id": job_id, "status": "pending", "step": "Queued", "progress": 0,
        "brief": data, "output_file": None, "detail": None,
        "created_at": _now(), "updated_at": _now(),
    }
    _jobs[job_id] = job
    await _save_job(job)
    task = asyncio.create_task(_run_pipeline(job_id, data, logo_path))
    _job_tasks[job_id] = task
    return {"job_id": job_id, "status": "pending"}


# ── Script Preview ─────────────────────────────────────────────────────────────

class PreviewRequest(BaseModel):
    subject: str
    brand: str = "rodschinson"
    language: str = "EN"
    format: str = "16:9"
    contentType: str = "video"
    template: str = "educational"
    style: str = "educational"
    duration: int = 60


@app.post("/api/preview-script")
async def preview_script(body: PreviewRequest):
    """Generate a script preview using the same Claude pipeline as production.
    Returns the JSON script so the user can review/edit it before triggering full generation."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(503, "ANTHROPIC_API_KEY not set in .env")

    # Replicate the VIDEO_TEMPLATES registry from _run_pipeline
    # (kept in sync manually — single source of truth is _run_pipeline)
    # (kept in sync manually — single source of truth is _run_pipeline)
    _PREVIEW_TEMPLATES = {
        "educational":   {"html": "rodschinson_premium", "ratio": "16:9", "w": 1920, "h": 1080, "fps": 24,
                          "scenes": ["title_card", "text_bullets", "process_steps", "quote_card", "cta_screen"]},
        "data":          {"html": "tech_data",           "ratio": "16:9", "w": 1920, "h": 1080, "fps": 24,
                          "scenes": ["title_card", "big_number", "bar_chart", "text_bullets", "cta_screen"]},
        "news":          {"html": "news_reel",           "ratio": "16:9", "w": 1920, "h": 1080, "fps": 24,
                          "scenes": ["title_card", "big_number", "bar_chart", "text_bullets", "cta_screen"]},
        "corporate":     {"html": "corporate_minimal",   "ratio": "16:9", "w": 1920, "h": 1080, "fps": 24,
                          "scenes": ["title_card", "text_bullets", "split_screen", "process_steps", "cta_screen"]},
        "cre":           {"html": "cre",                 "ratio": "16:9", "w": 1920, "h": 1080, "fps": 24,
                          "scenes": ["title_card", "big_number", "bar_chart", "text_bullets", "cta_screen"]},
        "reel_premium":  {"html": "reel_premium",        "ratio": "9:16", "w": 1080, "h": 1920, "fps": 30,
                          "scenes": ["title_card", "big_number", "text_bullets", "bar_chart", "cta_screen"]},
        "reel_data":     {"html": "reel_data",           "ratio": "9:16", "w": 1080, "h": 1920, "fps": 30,
                          "scenes": ["title_card", "big_number", "bar_chart", "text_bullets", "cta_screen"]},
        "reel_bold":     {"html": "reel_bold",           "ratio": "9:16", "w": 1080, "h": 1920, "fps": 30,
                          "scenes": ["title_card", "big_number", "text_bullets", "bar_chart", "cta_screen"]},
        "reel_minimal":  {"html": "reel_minimal",        "ratio": "9:16", "w": 1080, "h": 1920, "fps": 30,
                          "scenes": ["title_card", "big_number", "text_bullets", "bar_chart", "cta_screen"]},
        "reel_gradient": {"html": "reel_gradient",       "ratio": "9:16", "w": 1080, "h": 1920, "fps": 30,
                          "scenes": ["title_card", "big_number", "text_bullets", "bar_chart", "cta_screen"]},
    }

    tpl_key = body.template
    if tpl_key not in _PREVIEW_TEMPLATES:
        raise HTTPException(422, f"Unknown template '{tpl_key}'. Valid: {', '.join(_PREVIEW_TEMPLATES)}")

    # Trigger a full script generation job in the background and return job_id,
    # OR do a synchronous Claude call here for the preview.
    # We do it synchronously since this endpoint is explicitly for previewing.
    brand_arg     = "rachid" if body.brand == "rachid" else "rodschinson"
    _bm           = await _brand_lookup(body.brand) or {}
    brand_display = _bm.get("name") or ("Rachid Chikhi" if brand_arg == "rachid" else "Rodschinson Investment")
    brand_context = _bm.get("context") or brand_display
    lang_map      = {"EN": "English", "FR": "French", "NL": "Dutch"}
    lang_name     = lang_map.get(body.language.upper(), "English")
    meta          = _PREVIEW_TEMPLATES[tpl_key]
    is_shortform  = meta["ratio"] == "9:16"
    avg_dur       = 5 if is_shortform else 8
    n_scenes      = max(3, min(5 if is_shortform else 8, round(body.duration / avg_dur)))

    style_hints = {
        "viral_hook":  "Hook-first, bold claim, curiosity gap.",
        "educational": "Teach one concept clearly. Problem → insight → solution.",
        "data_story":  "Lead every scene with a hard number.",
        "personal":    "First person, authentic voice.",
        "provocateur": "Contrarian angle backed by evidence.",
        "thread":      "Each scene is a standalone punchy point.",
    }

    allowed_types = meta["scenes"]
    prompt = f"""You are writing a {n_scenes}-scene video script for {brand_display}.
BRAND CONTEXT: {brand_context}
TOPIC: {body.subject}
LANGUAGE: {lang_name}
TEMPLATE: {tpl_key} ({meta['ratio']}, {meta['w']}×{meta['h']}px)
CONTENT STYLE: {style_hints.get(body.style, style_hints['educational'])}
DURATION: ~{body.duration} seconds

ALLOWED SCENE TYPES (use ONLY these — any other type will crash the renderer):
{', '.join(allowed_types)}

Return ONLY a JSON object:
{{"meta":{{"titre":"...","brand":"{brand_display}","template":"{meta['html']}","largeur":{meta['w']},"hauteur":{meta['h']},"fps":{meta['fps']},"duree_totale_sec":{body.duration},"langue":"{body.language.lower()}"}},"scenes":[{{"id":1,"nom":"intro","duree_sec":7,"type_visuel":"title_card","narration":"...","visuel":{{"titre_principal":"...","sous_titre":"...","eyebrow":"..."}}}}],"audio":{{"voix_style":"professional et posé","vitesse_parole":1.0}}}}
Scene 1 must be title_card, last scene must be cta_screen. Return ONLY valid JSON."""

    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-sonnet-4-6", "max_tokens": 3000,
                  "messages": [{"role": "user", "content": prompt}]},
        )
    if res.status_code != 200:
        raise HTTPException(500, f"Claude API error {res.status_code}: {res.text[:200]}")

    raw = res.json()["content"][0]["text"].strip()
    try:
        script = _parse_json(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(500, f"Claude returned invalid JSON: {e}")

    return {"script": script, "template": tpl_key}


# ── Carousel Slide Preview ──────────────────────────────────────────────────────

@app.post("/api/preview-carousel")
async def preview_carousel(body: dict):
    """Generate carousel slide JSON for preview (no rendering). Returns slides array."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(503, "ANTHROPIC_API_KEY not set in .env")

    subject    = body.get("subject", "").strip()
    brand      = body.get("brand", "rodschinson")
    language   = body.get("language", "EN")
    style      = body.get("style", "educational")
    num_slides = min(max(int(body.get("slides", 6)), 3), 12)

    if not subject:
        raise HTTPException(422, "subject is required")

    _bm2          = await _brand_lookup(brand) or {}
    brand_display = _bm2.get("name") or ("Rachid Chikhi" if brand == "rachid" else "Rodschinson Investment")
    brand_context = _bm2.get("context") or brand_display
    lang_map = {"EN": "English", "FR": "French", "NL": "Dutch"}
    lang_name = lang_map.get(language.upper(), "English")
    style_hints = {
        "viral_hook":   "Hook-first, bold statements, curiosity gap.",
        "educational":  "Teach one clear concept per slide. Use data.",
        "data_story":   "Lead each slide with a key stat.",
        "personal":     "First person, personal story, authentic.",
        "provocateur":  "Challenge assumptions, contrarian.",
        "thread":       "Each slide is a standalone punchy point.",
    }

    prompt = f"""Write a {num_slides}-slide LinkedIn carousel in {lang_name}.
TOPIC: {subject}
BRAND: {brand_display}
BRAND CONTEXT: {brand_context}
STYLE: {style_hints.get(style, style_hints["educational"])}

Return ONLY a JSON array with exactly {num_slides} objects:
[
  {{"index": 1, "type": "title", "headline": "...", "subheadline": "...", "cta": "Swipe →", "brand": "{brand_display}"}},
  {{"index": 2, "type": "content", "headline": "...", "body": "2-3 sentences", "stat": "VALUE — description"}},
  ...
  {{"index": {num_slides}, "type": "cta", "headline": "...", "body": "...", "hashtags": ["#Tag1","#Tag2","#Tag3"]}}
]
Slide 1 = title. Last slide = cta. All middle slides = content.
No markdown, no explanation — JSON array only."""

    res = None
    for _attempt in range(4):
        async with httpx.AsyncClient(timeout=90) as client:
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json={"model": "claude-sonnet-4-6", "max_tokens": 3000,
                      "messages": [{"role": "user", "content": prompt}]},
            )
        if res.status_code not in (429, 529):
            break
        await asyncio.sleep(2 ** (_attempt + 1))
    if res is None:
        raise HTTPException(502, "Claude API: no response received")
    if res.status_code != 200:
        raise HTTPException(502, f"Claude API error {res.status_code}: {res.text[:200]}")

    raw = res.json()["content"][0]["text"].strip()
    try:
        slides = _parse_json(raw)
    except json.JSONDecodeError:
        slides = []

    return {"slides": slides, "total": len(slides)}


# ── Content Variations ────────────────────────────────────────────────────────

def _variations_prompt(content_type: str, subject: str, language: str,
                        style: str, brand: str, count: int) -> str:
    lang_map = {"EN": "English", "FR": "French", "NL": "Dutch"}
    lang = lang_map.get(language.upper(), "English")
    brand_ctx = ("Rodschinson Investment — premium CRE & M&A advisory, Brussels/Dubai/Casablanca"
                 if brand != "rachid" else "Rachid Chikhi — personal brand, entrepreneur & investor")
    style_hint = {
        "viral_hook": "Bold hook-first, curiosity gap, contrarian statement.",
        "educational": "Teach one clear concept. Data-backed, structured.",
        "data_story": "Lead with a key stat, build the narrative around numbers.",
        "personal": "First-person story, authentic, vulnerable moment.",
        "provocateur": "Challenge conventional wisdom, strong opinion.",
        "thread": "Each point standalone, punchy, Twitter-style.",
    }.get(style, "")

    if content_type in ("video", "reel", "story"):
        duration = "60-90s" if content_type == "reel" else "2-5 min"
        return f"""You are a content strategist for {brand_ctx}.
Generate {count} DISTINCT script concepts for a {content_type} ({duration}) in {lang}.
Topic: {subject}
Style directive: {style_hint}

Return ONLY a valid JSON array with exactly {count} objects. Each object:
{{
  "id": 1,
  "angle": "one-line creative angle / approach",
  "title": "compelling video title",
  "hook": "opening line / first sentence that grabs attention",
  "scenes": ["Scene 1: description", "Scene 2: description", ...],
  "cta": "closing call to action"
}}

Each concept must have a DIFFERENT angle (e.g. data-led, story-led, provocateur, how-to, myth-busting).
Scenes array: 4-7 items, each a brief description of what that scene covers.
Return ONLY the JSON array, no markdown, no explanation."""

    if content_type == "carousel":
        return f"""You are a content strategist for {brand_ctx}.
Generate {count} DISTINCT carousel concepts in {lang}.
Topic: {subject}
Style directive: {style_hint}

Return ONLY a valid JSON array with exactly {count} objects. Each object has ONLY these fields:
{{
  "id": 1,
  "angle": "one-line creative angle",
  "title": "carousel cover headline",
  "hook": "one sentence — what makes someone swipe",
  "outline": "slide 1: cover hook. slide 2: key stat. slide 3: main insight. slide 4: proof. slide 5: takeaway. slide 6: CTA."
}}

Rules: no nested arrays, no nested objects, all values are plain strings.
Each concept must have a radically different angle.
Return ONLY the JSON array, no markdown, no explanation."""

    if content_type == "text_only":
        return f"""You are a content writer for {brand_ctx}.
Write {count} DISTINCT versions of a {lang} social media post (LinkedIn / newsletter style).
Topic: {subject}
Style directive: {style_hint}

Return ONLY a valid JSON array with exactly {count} objects:
{{
  "id": 1,
  "angle": "one-line description of the angle used",
  "hook": "the opening line",
  "text": "the FULL post text, ready to publish, 150-400 words, proper line breaks with \\n"
}}

Each version must have a radically different hook and angle.
Return ONLY the JSON array, no markdown."""

    # image_post / story / default
    return f"""You are a content strategist for {brand_ctx}.
Generate {count} DISTINCT content concepts for a {content_type} in {lang}.
Topic: {subject}
Style: {style_hint}

Return ONLY a valid JSON array with exactly {count} objects:
{{
  "id": 1,
  "angle": "creative angle",
  "title": "headline / main text",
  "hook": "attention-grabbing first element",
  "description": "brief description of visual layout and copy"
}}
Return ONLY the JSON array."""


@app.post("/api/generate-variations")
async def generate_variations(body: dict):
    """Generate 3-5 content propositions using Claude. User picks one before full generation."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(503, "ANTHROPIC_API_KEY not set in .env")

    content_type = body.get("contentType", "video")
    subject      = body.get("subject", "").strip()
    language     = body.get("language", "EN")
    style        = body.get("style", "viral_hook")
    brand        = body.get("brand", "rodschinson")
    count        = min(max(int(body.get("count", 3)), 2), 5)

    if not subject:
        raise HTTPException(422, "subject is required")

    prompt = _variations_prompt(content_type, subject, language, style, brand, count)

    async with httpx.AsyncClient(timeout=90) as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": "claude-opus-4-6",
                  "max_tokens": 4096,
                  "messages": [{"role": "user", "content": prompt}]},
        )

    if res.status_code != 200:
        raise HTTPException(502, f"Claude API error {res.status_code}: {res.text[:300]}")

    raw = res.json()["content"][0]["text"].strip()
    # Strip markdown code fences
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw.strip())

    # Extract JSON array
    m = re.search(r'\[.*\]', raw, re.DOTALL)
    if not m:
        raise HTTPException(502, "Could not parse variations JSON from Claude response")

    json_str = m.group()

    def _repair(s: str) -> str:
        """Fix smart quotes, trailing commas, bare control chars inside strings."""
        s = s.replace('\u201c', '"').replace('\u201d', '"')
        s = s.replace('\u2018', "'").replace('\u2019', "'")
        s = re.sub(r',\s*([}\]])', r'\1', s)
        out, in_str, esc = [], False, False
        for ch in s:
            if esc:
                out.append(ch); esc = False
            elif ch == '\\':
                out.append(ch); esc = True
            elif ch == '"':
                out.append(ch); in_str = not in_str
            elif in_str:
                if   ch == '\n': out.append('\\n')
                elif ch == '\r': out.append('\\r')
                elif ch == '\t': out.append('\\t')
                else:            out.append(ch)
            else:
                out.append(ch)
        return ''.join(out)

    def _extract_objects(s: str) -> list:
        """Balanced-brace scan: parse each top-level {} independently."""
        results, depth, start, in_str, esc = [], 0, -1, False, False
        for i, ch in enumerate(s):
            if esc:             esc = False; continue
            if ch == '\\' and in_str: esc = True; continue
            if ch == '"':       in_str = not in_str; continue
            if in_str:          continue
            if ch == '{':
                if depth == 0: start = i
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0 and start != -1:
                    chunk = s[start:i + 1]
                    for attempt in (chunk, _repair(chunk)):
                        try:
                            results.append(json.loads(attempt)); break
                        except json.JSONDecodeError:
                            pass
                    start = -1
        return results

    # Pass 1: parse the whole array
    for attempt in (json_str, _repair(json_str)):
        try:
            variations = _parse_json(attempt)
            if isinstance(variations, list) and variations:
                return {"variations": variations[:count], "content_type": content_type}
        except json.JSONDecodeError:
            pass

    # Pass 2: recover individual objects from the broken array
    variations = _extract_objects(json_str)
    if not variations:
        raise HTTPException(502, "Could not parse any variations from Claude response")

    return {"variations": variations[:count], "content_type": content_type}


# ── Job status ─────────────────────────────────────────────────────────────────

@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    path = JOBS_DIR / f"{job_id}.json"
    # Always prefer disk for terminal jobs — disk is the authoritative record
    # after _save_job(); in-memory dict may lag on concurrent access.
    if path.exists():
        try:
            async with aiofiles.open(path) as f:
                job = json.loads(await f.read())
            _jobs[job_id] = job  # keep in-memory cache in sync
            return job
        except Exception as e:
            log.warning("Could not read job file %s: %s", job_id[:8], e)
    # Fall back to in-memory dict (job not yet persisted — still in-flight)
    if job_id in _jobs:
        return _jobs[job_id]
    raise HTTPException(404, "Job not found")


@app.post("/api/jobs/{job_id}/abort", status_code=200)
async def abort_job(job_id: str):
    """Cancel an in-progress generation job."""
    # Kill the active subprocess first (stops renderer/ffmpeg/etc. immediately)
    proc = _job_procs.get(job_id)
    if proc:
        try:
            proc.kill()
        except Exception:
            pass

    # Cancel the asyncio task (triggers CancelledError in the pipeline)
    task = _job_tasks.get(job_id)
    if task and not task.done():
        task.cancel()
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=3)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass

    # If the job was already done/errored, just report it
    path = JOBS_DIR / f"{job_id}.json"
    if path.exists():
        async with aiofiles.open(path) as f:
            job = json.loads(await f.read())
        if job.get("status") not in ("running", "pending"):
            return {"status": job["status"], "detail": "Job was already finished."}

    # Ensure the file is marked aborted (pipeline may not have handled CancelledError yet)
    if job_id in _jobs:
        job = _jobs[job_id]
    elif path.exists():
        async with aiofiles.open(path) as f:
            job = json.loads(await f.read())
    else:
        raise HTTPException(404, "Job not found")

    if job.get("status") not in ("aborted", "error", "done"):
        _job_update(job, status="aborted", step="Aborted", detail="Generation cancelled by user.")
        _jobs[job_id] = job
        await _save_job(job)

    return {"status": "aborted"}


# ── Video streaming ────────────────────────────────────────────────────────────

from fastapi.responses import FileResponse, StreamingResponse

@app.get("/api/video/{job_id}")
async def serve_video(job_id: str):
    """Stream the output video for a job."""
    lib = await _library_load()
    entry = next((e for e in lib if e.get("job_id") == job_id), None)
    if not entry or not entry.get("output_file"):
        raise HTTPException(404, "Video not found")
    path = Path(entry["output_file"])
    if not path.exists():
        raise HTTPException(404, "Video file missing on disk")
    return FileResponse(path, media_type="video/mp4")


@app.get("/api/image/{job_id}")
async def serve_image(job_id: str):
    """Serve the rendered PNG for an image_post or teaser thumbnail."""
    lib = await _library_load()
    entry = next((e for e in lib if e.get("job_id") == job_id), None)
    if not entry:
        raise HTTPException(404, "Image not found")
    # Teasers store a separate thumbnail PNG
    thumb = entry.get("thumbnail")
    if thumb and Path(thumb).exists():
        return FileResponse(thumb, media_type="image/png")
    if not entry.get("output_file"):
        raise HTTPException(404, "Image not found")
    path = Path(entry["output_file"])
    if not path.exists():
        raise HTTPException(404, "Image file missing on disk")
    return FileResponse(path, media_type="image/png")


@app.get("/api/carousel-slides/{job_id}")
async def get_carousel_slides(job_id: str):
    """Return the slide JSON array for a carousel job."""
    lib = await _library_load()
    entry = next((e for e in lib if e.get("job_id") == job_id), None)
    if not entry or not entry.get("output_file"):
        raise HTTPException(404, "Carousel not found")
    path = Path(entry["output_file"])
    if not path.exists():
        raise HTTPException(404, "Carousel file missing on disk")
    slides = json.loads(path.read_text(encoding="utf-8"))
    # Attach PNG URLs so the frontend can display individual slide thumbnails
    slide_images = entry.get("slide_images", [])
    for i, s in enumerate(slides):
        if i < len(slide_images) and Path(slide_images[i]).exists():
            s["png_url"] = f"/api/carousel-png/{job_id}/{i}"
    return {"slides": slides}


@app.get("/api/carousel-png/{job_id}/{index}")
async def get_carousel_png(job_id: str, index: int):
    """Serve a single rendered PNG slide by index."""
    lib = await _library_load()
    entry = next((e for e in lib if e.get("job_id") == job_id), None)
    if not entry:
        raise HTTPException(404, "Job not found")
    slide_images = entry.get("slide_images", [])
    if index < 0 or index >= len(slide_images):
        raise HTTPException(404, "Slide index out of range")
    p = Path(slide_images[index])
    if not p.exists():
        raise HTTPException(404, "PNG file missing on disk")
    return FileResponse(str(p), media_type="image/png")


@app.get("/api/download/{job_id}")
async def download_asset(job_id: str):
    """Download the output asset for a job. Carousels are served as styled HTML."""
    lib = await _library_load()
    entry = next((e for e in lib if e.get("job_id") == job_id), None)
    if not entry or not entry.get("output_file"):
        raise HTTPException(404, "Asset not found")
    path = Path(entry["output_file"])
    if not path.exists():
        raise HTTPException(404, "Asset file missing on disk")

    # Carousels: always serve a ZIP of PNGs — never fall through to JSON
    if entry.get("content_type") == "carousel":
        # 1. Try recorded slide_images paths
        recorded = entry.get("slide_images", [])
        existing = [p for p in recorded if Path(p).exists()]
        if not existing:
            # 2. Read manifest file if present (has correct paths from renderer)
            carousel_dir = OUTPUT / "carousel"
            prefix = job_id[:8]
            manifest_file = carousel_dir / f"{prefix}_manifest.json"
            if manifest_file.exists():
                try:
                    mdata = json.loads(manifest_file.read_text())
                    existing = [p for p in mdata.get("slides", []) if Path(p).exists()]
                except Exception:
                    pass
        if not existing:
            # 3. Glob by prefix pattern
            carousel_dir = OUTPUT / "carousel"
            prefix = job_id[:8]
            existing = sorted(str(p) for p in carousel_dir.glob(f"{prefix}_*.png"))
        if not existing:
            raise HTTPException(404, "No rendered slide images found — please regenerate the carousel")
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, p in enumerate(existing, 1):
                zf.write(p, f"slide_{i:02d}.png")
        buf.seek(0)
        raw_title = (entry.get("title") or job_id)[:40].replace(" ", "_").replace("/", "-")
        safe_title = raw_title.encode("ascii", "ignore").decode("ascii")  # strip non-ASCII
        return StreamingResponse(
            buf,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}_slides.zip"'},
        )

    content_type_map = {
        ".mp4":  "video/mp4",
        ".txt":  "text/plain",
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".pdf":  "application/pdf",
    }
    suffix = path.suffix.lower()
    media_type = content_type_map.get(suffix, "application/octet-stream")
    raw_title = (entry.get("title") or job_id)[:40].replace(" ", "_").replace("/", "-")
    safe_title = raw_title.encode("ascii", "ignore").decode("ascii")  # strip non-ASCII
    filename = f"{safe_title}{suffix}"
    return FileResponse(path, media_type=media_type, filename=filename)


# ── Templates ──────────────────────────────────────────────────────────────────

@app.get("/api/templates/scene-types")
async def get_scene_types():
    return _SCENE_TYPE_SCHEMAS


@app.get("/api/templates")
async def list_templates():
    customs = await _custom_templates_load()
    return _BUILTIN_TEMPLATE_META + customs


@app.post("/api/templates", status_code=201)
async def create_template(data: str = Form(...), html_file: Optional[UploadFile] = File(None)):
    try:
        body = json.loads(data)
    except json.JSONDecodeError:
        raise HTTPException(422, "Invalid JSON in data field")
    if not body.get("label", "").strip():
        raise HTTPException(422, "label is required")
    if not body.get("scenes"):
        raise HTTPException(422, "at least one scene type is required")

    ratio = body.get("ratio", "16:9")
    canvas = {"16:9": (1920, 1080, 24), "9:16": (1080, 1920, 30), "1:1": (1080, 1080, 24)}.get(ratio, (1920, 1080, 24))

    tmpl_id = re.sub(r"[^a-z0-9_]", "_", body["label"].lower())[:32]
    tmpl_id = f"custom_{tmpl_id}"

    customs = await _custom_templates_load()
    if any(t["id"] == tmpl_id for t in customs):
        raise HTTPException(409, f"Template id '{tmpl_id}' already exists")

    # Save HTML file if provided
    html_url = None
    if html_file and html_file.filename:
        dest = CUSTOM_TMPL_DIR / f"{tmpl_id}.html"
        async with aiofiles.open(dest, "wb") as f:
            await f.write(await html_file.read())
        html_url = f"/api/templates/{tmpl_id}/html"

    tmpl = {
        "id":        tmpl_id,
        "label":     body["label"].strip(),
        "html":      f"custom/{tmpl_id}",
        "ratio":     ratio,
        "w":         canvas[0],
        "h":         canvas[1],
        "fps":       canvas[2],
        "formats":   body.get("formats", ["video"]),
        "builtin":   False,
        "accent":    body.get("accent", "#00B6FF"),
        "gradient":  body.get("gradient", "linear-gradient(135deg,#08316F,#00B6FF)"),
        "style":     body.get("style", body["label"]),
        "scenes":    body.get("scenes", []),
        "htmlUrl":   html_url,
        "createdAt": _now(),
    }
    customs.append(tmpl)
    await _custom_templates_save(customs)
    await _rebuild_template_registry()
    return tmpl


@app.put("/api/templates/{tmpl_id}")
async def update_template(tmpl_id: str, data: str = Form(...), html_file: Optional[UploadFile] = File(None)):
    try:
        body = json.loads(data)
    except json.JSONDecodeError:
        raise HTTPException(422, "Invalid JSON in data field")

    customs = await _custom_templates_load()
    idx = next((i for i, t in enumerate(customs) if t["id"] == tmpl_id), None)
    if idx is None:
        raise HTTPException(404, "Template not found (built-in templates cannot be edited)")

    tmpl = customs[idx]
    for field in ("label", "style", "accent", "gradient", "formats", "scenes"):
        if field in body:
            tmpl[field] = body[field]

    if html_file and html_file.filename:
        dest = CUSTOM_TMPL_DIR / f"{tmpl_id}.html"
        async with aiofiles.open(dest, "wb") as f:
            await f.write(await html_file.read())
        tmpl["htmlUrl"] = f"/api/templates/{tmpl_id}/html"

    tmpl["updatedAt"] = _now()
    customs[idx] = tmpl
    await _custom_templates_save(customs)
    await _rebuild_template_registry()
    return tmpl


@app.delete("/api/templates/{tmpl_id}", status_code=204)
async def delete_template(tmpl_id: str):
    customs = await _custom_templates_load()
    updated = [t for t in customs if t["id"] != tmpl_id]
    if len(updated) == len(customs):
        raise HTTPException(404, "Template not found (built-in templates cannot be deleted)")
    await _custom_templates_save(updated)
    await _rebuild_template_registry()
    # Remove HTML file
    html_path = CUSTOM_TMPL_DIR / f"{tmpl_id}.html"
    if html_path.exists():
        html_path.unlink()


@app.get("/api/templates/{tmpl_id}/html")
async def get_template_html(tmpl_id: str):
    from fastapi.responses import FileResponse as FR
    p = CUSTOM_TMPL_DIR / f"{tmpl_id}.html"
    if not p.exists():
        raise HTTPException(404, "Template HTML not found")
    return FR(str(p), media_type="text/html", filename=f"{tmpl_id}.html")


# ── Library ────────────────────────────────────────────────────────────────────

# ── Brands ─────────────────────────────────────────────────────────────────────

@app.get("/api/brands")
async def list_brands():
    return await _brands_load()


@app.post("/api/brands", status_code=201)
async def create_brand(data: str = Form(...), logo: Optional[UploadFile] = File(None)):
    try:
        body = json.loads(data)
    except json.JSONDecodeError:
        raise HTTPException(422, "Invalid JSON in data field")
    if not body.get("name", "").strip():
        raise HTTPException(422, "name is required")

    brand_id = body.get("id") or re.sub(r"[^a-z0-9_-]", "_", body["name"].lower())[:32]
    brands   = await _brands_load()
    if any(b["id"] == brand_id for b in brands):
        raise HTTPException(409, f"Brand id '{brand_id}' already exists")

    logo_url = None
    if logo and logo.filename:
        ext  = Path(logo.filename).suffix.lower() or ".png"
        dest = BRAND_LOGOS / f"{brand_id}{ext}"
        async with aiofiles.open(dest, "wb") as f:
            await f.write(await logo.read())
        logo_url = f"/api/brands/{brand_id}/logo"

    brand = {
        "id":               brand_id,
        "name":             body["name"].strip(),
        "shortName":        body.get("shortName", body["name"][:2].upper()),
        "slug":             brand_id,
        "primaryColor":     body.get("primaryColor",     "#08316F"),
        "accentColor":      body.get("accentColor",      "#C8A96E"),
        "textColor":        body.get("textColor",        "#FFFFFF"),
        "backgroundColor":  body.get("backgroundColor",  body.get("primaryColor", "#08316F")),
        "headingFont":      body.get("headingFont",      "Inter"),
        "bodyFont":         body.get("bodyFont",         "Inter"),
        "headingFontSize":  body.get("headingFontSize",  "64"),
        "bodyFontSize":     body.get("bodyFontSize",     "18"),
        "captionFontSize":  body.get("captionFontSize",  "14"),
        "headingWeight":    body.get("headingWeight",    "700"),
        "bodyWeight":       body.get("bodyWeight",       "400"),
        "logoUrl":          logo_url,
        "website":          body.get("website",  ""),
        "tagline":          body.get("tagline",  ""),
        "context":          body.get("context",  body["name"].strip()),
        "icp": {
            "jobTitle":     body.get("icp", {}).get("jobTitle",    ""),
            "industry":     body.get("icp", {}).get("industry",    ""),
            "painPoints":   body.get("icp", {}).get("painPoints",  ""),
            "goals":        body.get("icp", {}).get("goals",       ""),
            "demographics": body.get("icp", {}).get("demographics",""),
        },
        "createdAt":        _now(),
    }
    brands.append(brand)
    await _brands_save(brands)
    return brand


@app.put("/api/brands/{brand_id}")
async def update_brand(brand_id: str, data: str = Form(...), logo: Optional[UploadFile] = File(None)):
    try:
        body = json.loads(data)
    except json.JSONDecodeError:
        raise HTTPException(422, "Invalid JSON in data field")

    brands = await _brands_load()
    idx    = next((i for i, b in enumerate(brands) if b["id"] == brand_id), None)
    if idx is None:
        raise HTTPException(404, "Brand not found")

    brand = brands[idx]
    for field in ("name", "shortName", "primaryColor", "accentColor", "textColor",
                  "backgroundColor", "headingFont", "bodyFont",
                  "headingFontSize", "bodyFontSize", "captionFontSize",
                  "headingWeight", "bodyWeight",
                  "website", "tagline", "context", "icp"):
        if field in body:
            brand[field] = body[field]

    if logo and logo.filename:
        ext  = Path(logo.filename).suffix.lower() or ".png"
        dest = BRAND_LOGOS / f"{brand_id}{ext}"
        async with aiofiles.open(dest, "wb") as f:
            await f.write(await logo.read())
        brand["logoUrl"] = f"/api/brands/{brand_id}/logo"

    brand["updatedAt"] = _now()
    brands[idx] = brand
    await _brands_save(brands)
    return brand


@app.delete("/api/brands/{brand_id}", status_code=204)
async def delete_brand(brand_id: str):
    brands = await _brands_load()
    updated = [b for b in brands if b["id"] != brand_id]
    if len(updated) == len(brands):
        raise HTTPException(404, "Brand not found")
    await _brands_save(updated)
    # Remove logo file if present
    for ext in (".png", ".jpg", ".jpeg", ".webp", ".svg"):
        p = BRAND_LOGOS / f"{brand_id}{ext}"
        if p.exists():
            p.unlink()


@app.get("/api/brands/{brand_id}/logo")
async def get_brand_logo(brand_id: str):
    from fastapi.responses import FileResponse
    for ext in (".png", ".jpg", ".jpeg", ".webp", ".svg"):
        p = BRAND_LOGOS / f"{brand_id}{ext}"
        if p.exists():
            return FileResponse(str(p))
    raise HTTPException(404, "Logo not found")


# ── Library ─────────────────────────────────────────────────────────────────────

@app.get("/api/library")
async def get_library(brand: Optional[str] = None, status: Optional[str] = None, language: Optional[str] = None):
    entries = await _library_load()
    if brand:    entries = [e for e in entries if e.get("brand") == brand]
    if status:   entries = [e for e in entries if e.get("status") == status]
    if language: entries = [e for e in entries if e.get("language", "").upper() == language.upper()]
    return {"items": entries, "total": len(entries)}


class StatusUpdate(BaseModel):
    status: str


@app.delete("/api/library/{job_id}", status_code=204)
async def delete_library_entry(job_id: str):
    entries = await _library_load()
    updated = [e for e in entries if e.get("job_id") != job_id]
    if len(updated) == len(entries):
        raise HTTPException(404, "Library entry not found")
    await _library_save(updated)


@app.patch("/api/library/{job_id}/status")
async def update_library_status(job_id: str, body: StatusUpdate, request: Request):
    if body.status not in VALID_STATUSES:
        raise HTTPException(422, f"status must be one of {sorted(VALID_STATUSES)}")
    entries = await _library_load()
    for entry in entries:
        if entry.get("job_id") == job_id:
            old_status = entry.get("status", "")
            entry["status"] = body.status
            entry["updated_at"] = _now()
            await _library_save(entries)
            if old_status != body.status:
                _tok = _get_request_token(request)
                actor = (_verify_token(_tok) if _tok else None) or "system"
                asyncio.create_task(_send_notification(
                    subject=f"Content status: {old_status} → {body.status}",
                    body=f'"{entry.get("title","")}" moved from {old_status} to {body.status} by {actor}.',
                ))
            return entry
    raise HTTPException(404, "Library entry not found")


@app.get("/api/platforms")
async def list_platforms():
    """Return all platforms supported for publishing via Metricool."""
    _META = {
        "linkedin":  {"name": "LinkedIn",   "color": "#0077B5", "icon": "in"},
        "instagram": {"name": "Instagram",  "color": "#E1306C", "icon": "◻"},
        "facebook":  {"name": "Facebook",   "color": "#1877F2", "icon": "f"},
        "tiktok":    {"name": "TikTok",     "color": "#ff2d55", "icon": "♪"},
        "youtube":   {"name": "YouTube",    "color": "#FF0000", "icon": "▶"},
        "twitter":   {"name": "X / Twitter","color": "#000000", "icon": "✕"},
        "bluesky":   {"name": "Bluesky",    "color": "#0085ff", "icon": "☁"},
        "pinterest": {"name": "Pinterest",  "color": "#E60023", "icon": "P"},
        "gmb":       {"name": "Google Business", "color": "#4285F4", "icon": "G"},
    }
    return [{"id": k, **v} for k, v in _META.items()]


# ── Publish (Ayrshare) ─────────────────────────────────────────────────────────

_METRICOOL_BASE = "https://app.metricool.com/api"

# Metricool platform category → display name + impressions/views field key
# Metricool response keys vary per platform — list all known field names for views/impressions
_MC_PLATFORMS = {
    "instagram": ("Instagram", ["views", "reach", "igImpressions", "igReach", "Followers"]),
    "facebook":  ("Facebook",  ["page_posts_impressions", "page_media_view", "pageViews", "fbImpressions", "fbReach"]),
    "linkedin":  ("LinkedIn",  ["CompanyImpressions", "liImpressions", "liReach", "Followers"]),
    "youtube":   ("YouTube",   ["ytViews", "views"]),
    "tiktok":    ("TikTok",    ["ttViews", "views"]),
    "twitter":   ("Twitter",   ["twImpressions", "impressions"]),
}


def _metricool_token() -> str:
    return os.getenv("METRICOOL_API_TOKEN", os.getenv("METRICOOL_TOKEN", ""))

def _metricool_blog_id(brand: str = "rodschinson") -> str:
    if brand and "rachid" in brand.lower():
        return os.getenv("METRICOOL_BLOG_ID_RACHID", os.getenv("METRICOOL_BLOG_ID", ""))
    return os.getenv("METRICOOL_BLOG_ID_RODSCHINSON", os.getenv("METRICOOL_BLOG_ID", ""))

async def _metricool_headers() -> dict:
    return {"X-Mc-Auth": _metricool_token(), "Content-Type": "application/json"}

# Platform key → Metricool v2 field name for per-platform data
_MC_PLATFORM_FIELD = {
    "linkedin":  "linkedinData",
    "instagram": "instagramData",
    "facebook":  "facebookData",
    "tiktok":    "tiktokData",
    "youtube":   "youtubeData",
    "twitter":   "twitterData",
    "bluesky":   "blueskyData",
    "pinterest": "pinterestData",
    "gmb":       "gmbData",
}

ALL_SUPPORTED_PLATFORMS = sorted(_MC_PLATFORM_FIELD.keys())

def _metricool_payload(caption: str, platforms: list[str], pub_dt: str,
                       media_urls: list[str] | None = None,
                       fmt: str = "16:9",
                       content_type: str = "video",
                       title: str = "") -> dict:
    """Build a valid Metricool v2 ScheduledPost payload.

    Correct v2 structure (confirmed from Metricool's own MCP source):
    - "text"            → top-level post copy (not inside any platformData)
    - "providers"       → [{"network": "linkedin"}, ...] — which platforms to post to
    - "publicationDate" → {"dateTime": "YYYY-MM-DDTHH:MM:SS", "timezone": "UTC"}
    - "autoPublish"     → true
    - "media"           → [{"url": "..."}] — one video or multiple images for carousel
    - Platform data objects only hold platform-specific settings, NOT the text:
        linkedinData  → {"type": "post"}
        instagramData → {"type": "POST|REEL|STORY", "showReelOnFeed": bool}
        facebookData  → {"type": "POST|REEL|STORY"}
        youtubeData   → {"title": "...", "type": "video|short", "privacy": "public"}
        tiktokData    → {}   (text is top-level)
        twitterData   → {"tags": []}
    """
    is_vertical  = fmt == "9:16"
    is_shortform = content_type in ("reel", "story") or is_vertical

    # Network keys Metricool expects in the providers array
    _NETWORK_NAME = {
        "linkedin":  "linkedin",
        "instagram": "instagram",
        "facebook":  "facebook",
        "tiktok":    "tiktok",
        "youtube":   "youtube",
        "twitter":   "twitter",
        "bluesky":   "bluesky",
        "pinterest": "pinterest",
        "gmb":       "gmb",
    }

    payload: dict = {
        "text": caption,
        "providers": [{"network": _NETWORK_NAME[p]} for p in platforms if p in _NETWORK_NAME],
        "publicationDate": {"dateTime": pub_dt, "timezone": "UTC"},
        "autoPublish": True,
    }

    # Platform-specific settings (no text here)
    for platform in platforms:
        if platform == "linkedin":
            payload["linkedinData"] = {"type": "post", "previewIncluded": True}

        elif platform == "instagram":
            ig_type = "REEL" if is_vertical else "POST"
            payload["instagramData"] = {
                "type": ig_type,
                "showReelOnFeed": True if ig_type == "REEL" else False,
            }

        elif platform == "facebook":
            fb_type = "REEL" if is_vertical else "POST"
            payload["facebookData"] = {"type": fb_type}

        elif platform == "youtube":
            yt_title = (title or caption)[:100]
            payload["youtubeData"] = {
                "title": yt_title,
                "type": "short" if is_shortform else "video",
                "privacy": "public",
            }

        elif platform == "tiktok":
            payload["tiktokData"] = {
                "disableComment": False,
                "disableDuet": False,
                "disableStitch": False,
            }

        elif platform == "twitter":
            payload["twitterData"] = {"tags": []}

        elif platform == "bluesky":
            payload["blueskyData"] = {}

        elif platform == "pinterest":
            payload["pinterestData"] = {"boardId": ""}

        elif platform == "gmb":
            payload["gmbData"] = {"type": "STANDARD"}

    if media_urls:
        payload["media"] = [{"url": u} for u in media_urls]

    return payload


class PublishRequest(BaseModel):
    platforms: Optional[list[str]] = None   # override which platforms to post to
    publish_now: bool = True                # False = schedule 5min from now, True = immediate


@app.post("/api/publish/{job_id}")
async def publish_content(job_id: str, body: PublishRequest = PublishRequest()):
    """
    Publish content to selected platforms via Metricool.
    Requires METRICOOL_API_TOKEN, METRICOOL_USER_ID, METRICOOL_BLOG_ID_* in .env.
    """
    token   = _metricool_token()
    user_id = os.getenv("METRICOOL_USER_ID", "")

    lib = await _library_load()
    entry = next((e for e in lib if e.get("job_id") == job_id), None)
    if not entry:
        raise HTTPException(404, "Library entry not found")

    brand   = entry.get("brand", "rodschinson")
    blog_id = _metricool_blog_id(brand)

    if not all([token, user_id, blog_id]):
        raise HTTPException(
            503,
            "Metricool not configured — add METRICOOL_API_TOKEN, METRICOOL_USER_ID, "
            "METRICOOL_BLOG_ID_RODSCHINSON to your .env file",
        )

    # Use caller-supplied platforms or fall back to what's stored on the entry
    platforms = body.platforms or entry.get("platforms", [])
    if not platforms:
        raise HTTPException(422, "No platforms specified")

    # Validate platform names
    valid_platforms = set(_MC_PLATFORM_FIELD.keys())
    platforms = [p for p in platforms if p in valid_platforms]
    if not platforms:
        raise HTTPException(422, f"No valid platforms. Supported: {', '.join(sorted(valid_platforms))}")

    ctype = entry.get("content_type", "video")
    backend_url = os.getenv("BACKEND_PUBLIC_URL", "").rstrip("/")

    # ── Caption ───────────────────────────────────────────────────────────────
    caption = entry.get("output_text", "")
    if not caption:
        if ctype == "carousel":
            # Build caption from slides: cover body → content headlines → CTA body + hashtags
            output_file = entry.get("output_file", "")
            if output_file and os.path.isfile(output_file):
                try:
                    slides = json.loads(open(output_file, encoding="utf-8").read())
                    parts: list[str] = []
                    hashtags: list[str] = []
                    for s in slides:
                        stype = s.get("type", "")
                        if stype == "title" and s.get("body"):
                            parts.append(s["body"])
                        elif stype == "content":
                            if s.get("headline"):
                                parts.append(f"▸ {s['headline']}")
                            if s.get("body"):
                                parts.append(s["body"])
                        elif stype in ("kpi", "metric"):
                            if s.get("body"):
                                parts.append(s["body"])
                        elif stype == "cta":
                            if s.get("body"):
                                parts.append(s["body"])
                            hashtags = s.get("hashtags", [])
                    caption = "\n\n".join(p for p in parts if p)
                    if hashtags:
                        caption += "\n\n" + " ".join(hashtags)
                except Exception:
                    pass
        else:
            script_path = entry.get("script_path")
            if script_path and os.path.isfile(script_path):
                try:
                    _sdata = json.loads(open(script_path, encoding="utf-8").read())
                    meta = _sdata.get("meta", {})
                    desc = meta.get("description", "")
                    tags = meta.get("hashtags_linkedin", [])
                    if desc:
                        caption = desc
                        if tags:
                            caption += "\n\n" + " ".join(tags)
                except Exception:
                    pass
    if not caption:
        caption = entry.get("title", "")
    caption = caption[:2200]

    # ── Media URLs ────────────────────────────────────────────────────────────
    media_urls: list[str] = []
    if backend_url:
        if ctype == "carousel":
            slide_images = entry.get("slide_images", [])
            media_urls = [
                f"{backend_url}/api/carousel-png/{job_id}/{i}"
                for i in range(len(slide_images))
            ]
        elif ctype in ("video", "reel"):
            media_urls = [f"{backend_url}/api/video/{job_id}"]
        elif ctype == "image_post":
            media_urls = [f"{backend_url}/api/image/{job_id}"]
    elif entry.get("public_media_url"):
        media_urls = [entry["public_media_url"]]

    from datetime import datetime, timezone, timedelta
    delay = 0 if body.publish_now else 5
    pub_dt = (datetime.now(timezone.utc) + timedelta(minutes=delay)).strftime("%Y-%m-%dT%H:%M:%S")

    payload = _metricool_payload(
        caption=caption,
        platforms=platforms,
        pub_dt=pub_dt,
        media_urls=media_urls or None,
        fmt=entry.get("format", "16:9"),
        content_type=ctype,
        title=entry.get("title", ""),
    )

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{_METRICOOL_BASE}/v2/scheduler/posts",
            headers=await _metricool_headers(),
            params={"userId": user_id, "blogId": blog_id},
            json=payload,
        )

    if res.status_code not in (200, 201):
        log.error("Metricool publish error: %s %s", res.status_code, res.text[:400])
        raise HTTPException(502, f"Metricool returned {res.status_code}: {res.text[:300]}")

    entry["status"] = "Published"
    entry["published_platforms"] = platforms
    entry["updated_at"] = _now()
    await _library_save(lib)

    return {"status": "published", "metricool": res.json()}


# ── Schedule ───────────────────────────────────────────────────────────────────

@app.get("/api/schedule/week")
async def get_schedule_week(start: Optional[str] = None):
    from datetime import date, timedelta
    if start:
        try: week_start = date.fromisoformat(start)
        except ValueError: raise HTTPException(422, "start must be YYYY-MM-DD")
    else:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    all_entries = await _schedule_load()
    week_entries = [e for e in all_entries
                    if week_start.isoformat() <= e.get("date", "") <= week_end.isoformat()]
    return {"week_start": week_start.isoformat(), "week_end": week_end.isoformat(), "entries": week_entries}


class ScheduleCreate(BaseModel):
    job_id: str; date: str; slot: str; platform: str
    scheduled_time: Optional[str] = None   # "HH:MM" e.g. "09:30"


@app.post("/api/schedule", status_code=201)
async def create_schedule_entry(body: ScheduleCreate):
    if body.slot not in VALID_SLOTS:
        raise HTTPException(422, f"slot must be one of {sorted(VALID_SLOTS)}")
    lib = await _library_load()
    lib_entry = next((e for e in lib if e["job_id"] == body.job_id), None)
    entry_id = str(uuid.uuid4())
    entry = {
        "id": entry_id, "job_id": body.job_id, "date": body.date,
        "slot": body.slot, "platform": body.platform,
        "scheduled_time": body.scheduled_time or "",
        "title": lib_entry["title"] if lib_entry else "",
        "content_type": lib_entry.get("content_type", "") if lib_entry else "",
        "status": "Scheduled", "publish_status": "local",
        "created_at": _now(),
    }
    entries = await _schedule_load()
    entries.append(entry)
    await _schedule_save(entries)
    if lib_entry:
        lib_entry["status"] = "Scheduled"; lib_entry["updated_at"] = _now()
        await _library_save(lib)
    return entry


@app.post("/api/schedule/{entry_id}/publish")
async def publish_schedule_entry(entry_id: str, request: Request):
    """Send a scheduled entry to Metricool.
    If the entry isn't in the local schedule file (e.g. Railway stateless deploy),
    the caller can pass the full entry object in the request body as fallback.
    """
    entries = await _schedule_load()
    entry   = next((e for e in entries if e.get("id") == entry_id), None)

    # Fallback: use body data if entry not in DB (stateless deploy / Railway)
    if not entry:
        try:
            body = await request.json()
            if body and isinstance(body, dict):
                entry = {**body, "id": entry_id}
        except Exception:
            pass

    if not entry:
        raise HTTPException(404, f"Schedule entry '{entry_id}' not found")

    job_id  = entry.get("job_id", "")
    brand   = "rodschinson"
    lib     = await _library_load()
    lib_entry = next((e for e in lib if e.get("job_id") == job_id), None)
    if lib_entry:
        brand = lib_entry.get("brand", "rodschinson")

    token   = _metricool_token()
    user_id = os.getenv("METRICOOL_USER_ID", "")
    blog_id = _metricool_blog_id(brand)

    if not all([token, user_id, blog_id]):
        raise HTTPException(503, "Metricool not configured")

    # Build publication datetime from entry date + scheduled_time
    from datetime import datetime, timezone
    entry_date = entry.get("date", "")
    entry_time = entry.get("scheduled_time", "") or "09:00"
    try:
        pub_dt_obj = datetime.fromisoformat(f"{entry_date}T{entry_time}:00")
    except ValueError:
        pub_dt_obj = datetime.now(timezone.utc)
    pub_dt = pub_dt_obj.strftime("%Y-%m-%dT%H:%M:%S")

    platform = entry.get("platform", "linkedin")
    backend_url = os.getenv("BACKEND_PUBLIC_URL", "").rstrip("/")

    if lib_entry:
        _ctype = lib_entry.get("content_type", "video")
        caption = lib_entry.get("output_text", "")
        if not caption and _ctype == "carousel":
            _of = lib_entry.get("output_file", "")
            if _of and os.path.isfile(_of):
                try:
                    _slides = json.loads(open(_of, encoding="utf-8").read())
                    _parts: list[str] = []
                    _tags: list[str] = []
                    for _s in _slides:
                        _st = _s.get("type", "")
                        if _st == "title" and _s.get("body"):
                            _parts.append(_s["body"])
                        elif _st == "content":
                            if _s.get("headline"): _parts.append(f"▸ {_s['headline']}")
                            if _s.get("body"): _parts.append(_s["body"])
                        elif _st in ("kpi", "metric") and _s.get("body"):
                            _parts.append(_s["body"])
                        elif _st == "cta":
                            if _s.get("body"): _parts.append(_s["body"])
                            _tags = _s.get("hashtags", [])
                    caption = "\n\n".join(p for p in _parts if p)
                    if _tags: caption += "\n\n" + " ".join(_tags)
                except Exception:
                    pass
        if not caption:
            _sp = lib_entry.get("script_path")
            if _sp and os.path.isfile(_sp):
                try:
                    _m = json.loads(open(_sp, encoding="utf-8").read()).get("meta", {})
                    caption = _m.get("description", "")
                    if caption and _m.get("hashtags_linkedin"):
                        caption += "\n\n" + " ".join(_m["hashtags_linkedin"])
                except Exception:
                    pass
        if not caption:
            caption = lib_entry.get("title", "")
        # Build media URLs
        _jid = lib_entry.get("job_id", job_id)
        if backend_url:
            if _ctype == "carousel":
                _nimgs = len(lib_entry.get("slide_images", []))
                _sched_media = [f"{backend_url}/api/carousel-png/{_jid}/{i}" for i in range(_nimgs)] or None
            elif _ctype in ("video", "reel"):
                _sched_media = [f"{backend_url}/api/video/{_jid}"]
            elif _ctype == "image_post":
                _sched_media = [f"{backend_url}/api/image/{_jid}"]
            else:
                _sched_media = None
        elif lib_entry.get("public_media_url"):
            _sched_media = [lib_entry["public_media_url"]]
        else:
            _sched_media = None
        fmt_val = lib_entry.get("format", "16:9")
    else:
        caption = entry.get("title", "")
        _ctype = "video"
        _sched_media = None
        fmt_val = "16:9"
    caption = caption[:2200]

    payload = _metricool_payload(
        caption=caption,
        platforms=[platform],
        pub_dt=pub_dt,
        media_urls=_sched_media,
        fmt=fmt_val,
        content_type=_ctype,
    )

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{_METRICOOL_BASE}/v2/scheduler/posts",
            headers=await _metricool_headers(),
            params={"userId": user_id, "blogId": blog_id},
            json=payload,
        )

    in_db = any(e.get("id") == entry_id for e in entries)

    if res.status_code not in (200, 201):
        if in_db:
            entry["publish_status"] = "failed"
            entry["publish_error"]  = res.text[:300]
            await _schedule_save(entries)
        raise HTTPException(502, f"Metricool returned {res.status_code}: {res.text[:300]}")

    if in_db:
        entry["publish_status"] = "sent"
        entry["published_at"]   = _now()
        await _schedule_save(entries)
    if lib_entry:
        lib_entry["status"] = "Published"; lib_entry["updated_at"] = _now()
        await _library_save(lib)

    return {"status": "sent", "scheduled_for": pub_dt, "metricool": res.json()}


@app.delete("/api/schedule/{entry_id}", status_code=204)
async def delete_schedule_entry(entry_id: str):
    entries = await _schedule_load()
    updated = [e for e in entries if e.get("id") != entry_id]
    if len(updated) == len(entries):
        raise HTTPException(404, "Schedule entry not found")
    await _schedule_save(updated)


# ── Email Notification ─────────────────────────────────────────────────────────

class NotifyRequest(BaseModel):
    email: str
    schedule_entry: dict


@app.post("/api/notify")
async def send_notification(body: NotifyRequest):
    """
    Send a reminder email for a scheduled post.
    Requires SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env.
    """
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")

    entry = body.schedule_entry
    subject_line = f"[Rodschinson Studio] Reminder: {entry.get('title','Post')} — {entry.get('date','')} {entry.get('slot','')}"
    body_text = (
        f"You have content scheduled:\n\n"
        f"Title:    {entry.get('title','')}\n"
        f"Platform: {entry.get('platform','').title()}\n"
        f"Date:     {entry.get('date','')}\n"
        f"Time:     {entry.get('slot','').title()}\n\n"
        f"Log in to Rodschinson Content Studio to review or publish."
    )

    if not smtp_host or not smtp_user:
        # Log but return success (graceful degradation)
        log.warning("SMTP not configured — skipping email to %s", body.email)
        return {"status": "skipped", "reason": "SMTP not configured"}

    try:
        msg = MIMEText(body_text)
        msg["Subject"] = subject_line
        msg["From"]    = smtp_user
        msg["To"]      = body.email

        def _send():
            with smtplib.SMTP(smtp_host, smtp_port) as s:
                s.starttls()
                s.login(smtp_user, smtp_pass)
                s.send_message(msg)

        await asyncio.to_thread(_send)
        log.info("Reminder sent to %s", body.email)
        return {"status": "sent", "to": body.email}
    except Exception as exc:
        log.error("Email send failed: %s", exc)
        raise HTTPException(502, f"Email send failed: {exc}")


# ── Brief Templates ────────────────────────────────────────────────────────────

class TemplateCreate(BaseModel):
    name: str
    form: dict


@app.get("/api/brief-templates")
async def list_brief_templates():
    return {"templates": await _templates_load()}


@app.post("/api/brief-templates", status_code=201)
async def create_brief_template(body: TemplateCreate):
    templates = await _templates_load()
    tpl = {"id": str(uuid.uuid4()), "name": body.name, "form": body.form, "created_at": _now()}
    templates.insert(0, tpl)
    await _templates_save(templates[:20])  # keep last 20
    return tpl


@app.delete("/api/brief-templates/{tpl_id}", status_code=204)
async def delete_brief_template(tpl_id: str):
    templates = await _templates_load()
    updated = [t for t in templates if t.get("id") != tpl_id]
    if len(updated) == len(templates):
        raise HTTPException(404, "Template not found")
    await _templates_save(updated)


# ── Canva Templates ────────────────────────────────────────────────────────────

CANVA_TEMPLATES_FILE = OUTPUT / "canva_templates.json"


async def _canva_load() -> list[dict]:
    if not CANVA_TEMPLATES_FILE.exists(): return []
    async with aiofiles.open(CANVA_TEMPLATES_FILE) as f:
        return json.loads(await f.read())


async def _canva_save(entries: list[dict]) -> None:
    async with aiofiles.open(CANVA_TEMPLATES_FILE, "w") as f:
        await f.write(json.dumps(entries, indent=2, default=str))


class CanvaTemplateCreate(BaseModel):
    name: str
    url: str               # Canva share URL e.g. https://www.canva.com/design/{id}/...
    type: str = "carousel" # carousel | video | image
    thumbnail_url: str = ""


@app.get("/api/canva-templates")
async def list_canva_templates(type: Optional[str] = None):
    templates = await _canva_load()
    if type:
        templates = [t for t in templates if t.get("type") == type]
    return {"templates": templates}


@app.post("/api/canva-templates", status_code=201)
async def add_canva_template(body: CanvaTemplateCreate):
    if "canva.com" not in body.url:
        raise HTTPException(422, "URL must be a Canva share link (canva.com)")

    # Extract design ID from URL for embed
    # e.g. https://www.canva.com/design/DAxxxxxx/view
    design_id = ""
    m = re.search(r"/design/([A-Za-z0-9_-]+)", body.url)
    if m:
        design_id = m.group(1)

    embed_url = f"https://www.canva.com/design/{design_id}/view?embed=1" if design_id else ""
    thumbnail = body.thumbnail_url or (
        f"https://www.canva.com/design/{design_id}/thumbnail" if design_id else ""
    )

    templates = await _canva_load()
    tpl = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "url": body.url,
        "embed_url": embed_url,
        "thumbnail_url": thumbnail,
        "design_id": design_id,
        "type": body.type,
        "created_at": _now(),
    }
    templates.insert(0, tpl)
    await _canva_save(templates[:50])
    return tpl


@app.delete("/api/canva-templates/{tpl_id}", status_code=204)
async def delete_canva_template(tpl_id: str):
    templates = await _canva_load()
    updated = [t for t in templates if t.get("id") != tpl_id]
    if len(updated) == len(templates):
        raise HTTPException(404, "Canva template not found")
    await _canva_save(updated)


# ── AI Template Generator ──────────────────────────────────────────────────────

class TemplateGenRequest(BaseModel):
    name: str
    description: str
    type: str = "video"   # video | carousel | image
    bg_color: str = "#08316F"
    accent_color: str = "#C8A96E"


@app.post("/api/generate-template", status_code=201)
async def generate_template(body: TemplateGenRequest):
    """
    Use Claude to generate a new Puppeteer HTML template.
    Saves to puppeteer/templates/{slug}.html and returns the template metadata.
    Requires ANTHROPIC_API_KEY in .env.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(503, "ANTHROPIC_API_KEY not configured in .env")

    slug = re.sub(r"[^a-z0-9]+", "_", body.name.lower().strip()).strip("_")
    if not slug:
        raise HTTPException(422, "Invalid template name")

    dest = PUPPET / "templates" / f"{slug}.html"

    # Resolve dimensions and type-specific contract from type
    if body.type == "carousel":
        width, height = 1080, 1080
        data_contract = """window.loadScene receives a slide object:
  { index, type ("title"|"content"|"cta"), headline, subheadline, body, stat, cta, hashtags[], brand, total }
  The function must populate a <div id="scene-container"> with the rendered slide HTML and return true.
  Design three CSS classes: .slide-title, .slide-content, .slide-cta.
  For "title": show headline, subheadline, brand name, swipe CTA.
  For "content": show point number, headline, body text, optional stat callout block.
  For "cta": show headline, body, hashtag pills.
  window.animateScene() triggers CSS transitions to final state."""
        extra_design = "Square 1080×1080px slides. Bold typography. Rich visual hierarchy. Each slide must look like a standalone premium social media post."
    elif body.type == "image":
        width, height = 1080, 1080
        data_contract = """window.loadScene receives:
  { type_visuel, visuel: { titre_principal, sous_titre, eyebrow, valeur, unite, ... } }
  Implement SCENE_BUILDERS for at least: title_card, big_number, text_bullets, cta_screen.
  Populate <div id="scene-container"> and return true."""
        extra_design = "Square 1080×1080px single branded image. Clean, impactful layout."
    else:  # video
        width, height = 1920, 1080
        data_contract = """window.loadScene receives a scene object:
  { type_visuel, visuel: { titre_principal, sous_titre, eyebrow, valeur, unite, contexte,
    formule, series[], etapes[], items[], headline, body, stat, colonne_gauche, colonne_droite, ... } }
  Implement SCENE_BUILDERS for ALL these type_visuel values:
    title_card, big_number, bar_chart, process_steps, text_bullets,
    cta_screen, split_screen, comparison_table, quote_card.
  Populate <div id="scene-container"> with the built HTML and return true.
  window.animateScene() triggers CSS enter transitions."""
        extra_design = "16:9 widescreen 1920×1080px. Cinematic layout. This template must match the premium Rodschinson brand."

    # Compute text colour based on background luminance
    def _luminance(hex_color: str) -> float:
        h = hex_color.lstrip("#")
        r, g, b = int(h[0:2],16)/255, int(h[2:4],16)/255, int(h[4:6],16)/255
        return 0.299*r + 0.587*g + 0.114*b
    text_color = "#0a0a0a" if _luminance(body.bg_color) > 0.5 else "#ffffff"
    text_sub   = "rgba(0,0,0,0.55)" if text_color == "#0a0a0a" else "rgba(255,255,255,0.65)"

    prompt = f"""You are a world-class creative director and senior front-end engineer specialising in Puppeteer-rendered branded content templates. Generate a VISUALLY STUNNING, production-ready HTML file.

═══════════════════════════════════════════
BRIEF
═══════════════════════════════════════════
Name        : {body.name}
Description : {body.description}
Type        : {body.type}
Canvas      : {width} × {height} px
Background  : {body.bg_color}
Accent      : {body.accent_color}
Text        : {text_color}

═══════════════════════════════════════════
MANDATORY VISUAL REQUIREMENTS — every item is non-negotiable
═══════════════════════════════════════════

TYPOGRAPHY
- Google Fonts via @import (choose 2 complementary families that match the brand mood)
- Minimum 3 typographic sizes: eyebrow/label (10-14px), body (18-26px), headline (40-90px)
- Use font-weight variation (300, 400, 700, 900) to create hierarchy

COLOUR SYSTEM — CSS custom properties in :root:
  --bg      : {body.bg_color}
  --accent  : {body.accent_color}
  --text    : {text_color}
  --text-sub: {text_sub}
  --sans    : (your chosen sans font)
  --serif   : (your chosen serif font, or same as sans)
- html/body: exactly {width}px × {height}px, overflow hidden, background: var(--bg), color: var(--text)

DECORATIVE BACKGROUND (CRITICAL — this is what makes it look premium):
- Full-canvas inline SVG positioned absolute, pointer-events:none, z-index 0:
  • At minimum 3 geometric shapes: large circle/arc, diagonal line cluster, polygon/grid
  • Use accent colour at 8-20% opacity for subtle depth
  • Add a radial or mesh gradient overlay
- Optional: CSS grid dots pattern, diagonal stripe, or noise texture overlay
- Top accent bar: 4-6px gradient strip across full width using accent colour

BRAND BLOCK (top-left or top-right):
- .logo-block div: contains .logo-monogram (36-44px square, accent bg, brand initial letter) + .logo-text (brand name — injected dynamically at render time)
- IMPORTANT: .logo-text should say the brand name as a placeholder; it will be replaced at render
- Do NOT hardcode "RODSCHINSON" or "Investment" anywhere — use a placeholder that JS replaces

LAYOUT — at minimum implement these 3 scene types with dramatically different layouts:
  1. "title" / "title_card" — full-canvas hero: giant headline, eyebrow label, subtitle, visual impact
  2. "content" / "text_bullets" — data/points layout: numbered list or bullet grid with icon placeholders
  3. "cta" / "cta_screen" — call-to-action: strong closing line, supporting text, styled CTA button/badge
Each scene must fill the ENTIRE canvas with purposeful whitespace, never feel empty.

ANIMATIONS — every element enters with CSS transitions:
  - Stagger: eyebrow → headline → body → accent line (50-80ms delay between each)
  - Use opacity 0 → 1 + translateY(12px) → translateY(0) or translateX
  - .scene.anim class triggers all elements to their final state
  - Disable all transition delays when .anim is applied so Puppeteer screenshots are immediate

SLIDE COUNTER (for carousel type): bottom-right, "01 / 06" format, small, low opacity
{extra_design}

═══════════════════════════════════════════
JAVASCRIPT CONTRACT — Puppeteer calls EXACTLY these functions
═══════════════════════════════════════════
{data_contract}

REQUIRED window functions:
```
window.loadScene(data)         → populates <div id="scene-container">, returns true/false
window.animateScene()          → adds .active + .anim to #scene after one requestAnimationFrame
window.isAnimationComplete(ms) → returns Promise that resolves after ms milliseconds
```

CRITICAL RULES:
- <div id="scene-container"> must exist in body
- loadScene MUST return true for every supported type, false for unknown
- All scene HTML must be injected inside #scene-container
- Never use external JS libraries (no jQuery, no GSAP, no React)
- Template must render identically in Puppeteer headless Chrome (no WebGL, no canvas needed)
- Text must be fully readable: ensure contrast between text color and background at every scene type
- Brand name in logo block will be replaced at render time — design for variable-length names

OUTPUT: Return ONLY the complete HTML file. No explanation. No markdown fences. Start with <!DOCTYPE html>"""

    async with httpx.AsyncClient(timeout=300) as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-6",
                "max_tokens": 16000,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if res.status_code != 200:
        log.error("Anthropic API error: %s %s", res.status_code, res.text[:300])
        raise HTTPException(502, f"Claude API returned {res.status_code}")

    result = res.json()
    html_content = result["content"][0]["text"].strip()

    # Strip markdown code fences if Claude wrapped it
    if html_content.startswith("```"):
        html_content = re.sub(r"^```[a-z]*\n?", "", html_content)
        html_content = re.sub(r"\n?```$", "", html_content.strip())

    dest.write_text(html_content, encoding="utf-8")
    log.info("Template generated: %s → %s", body.name, dest)

    # Derive a gradient from the colors for the frontend card
    gradient = f"linear-gradient(135deg,{body.bg_color},{body.accent_color}33)"

    return {
        "id": slug,
        "name": body.name,
        "type": body.type,
        "gradient": gradient,
        "accent": body.accent_color,
        "path": str(dest),
    }


# ── Analytics ──────────────────────────────────────────────────────────────────

async def _metricool_analytics(token: str, user_id: str, blog_id: str) -> dict | None:
    """Fetch analytics data from Metricool. Returns None on any failure."""
    from datetime import date, timedelta

    today = date.today()
    start = (today - timedelta(days=29)).strftime("%Y%m%d")
    end   = today.strftime("%Y%m%d")

    params  = {"userId": user_id, "blogId": blog_id, "start": start, "end": end}
    headers = {"X-Mc-Auth": token}

    platforms_out: list[dict] = []
    total_views   = 0
    total_eng     = 0.0
    eng_count     = 0

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            # Per-platform aggregated metrics
            for platform_id, (display_name, view_keys) in _MC_PLATFORMS.items():
                try:
                    r = await client.get(
                        f"{_METRICOOL_BASE}/stats/aggregations/{platform_id}",
                        headers=headers, params=params,
                    )
                    if r.status_code != 200:
                        continue
                    d = r.json()
                    if not d or not isinstance(d, dict):
                        continue
                    # Pick the first non-zero views/impressions field
                    views = 0
                    for k in view_keys:
                        v = d.get(k)
                        if v and float(v) > 0:
                            views = int(float(v))
                            break
                    # Engagement: try several known field names
                    eng = 0.0
                    for ek in ("engagement", "accounts_engaged", f"{platform_id[:2]}Engagement",
                               "page_total_actions", "page_actions_post_reactions_total"):
                        ev = d.get(ek)
                        if ev and float(ev) > 0:
                            eng = float(ev)
                            break
                    # Also grab followers if available
                    followers = int(float(d.get("Followers") or d.get("Friends") or d.get("pageFollows") or 0))
                    if views > 0:
                        entry = {"platform": display_name, "views": views}
                        if followers > 0:
                            entry["followers"] = followers
                        platforms_out.append(entry)
                        total_views += views
                    elif followers > 0:
                        # Even if no views, include platform with followers count
                        platforms_out.append({"platform": display_name, "views": 0, "followers": followers})
                    if eng > 0:
                        total_eng += eng; eng_count += 1
                except Exception as exc:
                    log.warning("Metricool %s fetch error: %s", platform_id, exc)
                    continue

            # 30-day timeline — try multiple metrics, pick first with data
            views30: list[dict] = []
            timeline_metrics = ["CompanyImpressions", "views", "reach",
                                "page_posts_impressions", "igImpressions", "liImpressions", "fbImpressions"]
            for metric in timeline_metrics:
                try:
                    r = await client.get(
                        f"{_METRICOOL_BASE}/stats/timeline/{metric}",
                        headers=headers, params=params,
                    )
                    if r.status_code != 200:
                        continue
                    raw = r.json()
                    # Metricool returns [[date_str, value_str], ...] OR [{"date":..., "value":...}]
                    items = raw if isinstance(raw, list) else raw.get("data", [])
                    if not items:
                        continue
                    from datetime import datetime as _dt
                    parsed = []
                    for item in items:
                        if isinstance(item, (list, tuple)) and len(item) >= 2:
                            dt_str, val_str = str(item[0]), item[1]
                        elif isinstance(item, dict):
                            dt_str = str(item.get("date") or item.get("day") or "")
                            val_str = item.get("value") or item.get("count") or 0
                        else:
                            continue
                        val = int(float(val_str)) if val_str else 0
                        try:
                            dt_fmt = _dt.strptime(dt_str[:8], "%Y%m%d").strftime("%d %b")
                        except Exception:
                            dt_fmt = dt_str
                        parsed.append({
                            "date": dt_fmt, "views": val,
                            "rodschinson": round(val * 0.62),
                            "rachid":      round(val * 0.38),
                        })
                    if parsed and any(p["views"] > 0 for p in parsed):
                        views30 = parsed
                        break
                    elif parsed and not views30:
                        views30 = parsed  # keep as fallback, continue trying
                except Exception as exc:
                    log.warning("Metricool timeline %s error: %s", metric, exc)
                    continue

    except Exception as exc:
        log.warning("Metricool analytics request failed: %s", exc)
        return None

    if not platforms_out and not views30:
        return None  # nothing usable — let caller fall back

    platforms_out.sort(key=lambda x: x["views"], reverse=True)
    avg_eng = round(total_eng / max(eng_count, 1), 1)

    return {
        "totalViews":  total_views,
        "viewsDelta":  0,
        "engagement":  avg_eng or 0.0,
        "engDelta":    0,
        "platforms":   platforms_out,
        "views30":     views30,
        "source":      "metricool",
    }


@app.get("/api/analytics")
async def get_analytics(brand: Optional[str] = None):
    lib   = await _library_load()
    token   = _metricool_token()
    user_id = os.getenv("METRICOOL_USER_ID", "")
    brand_q = brand or "rodschinson"
    blog_id = _metricool_blog_id(brand_q)

    mc_data: dict | None = None
    if token and user_id and blog_id:
        mc_data = await _metricool_analytics(token, user_id, blog_id)

    # Library-derived counts (always available)
    if brand and brand != "both":
        lib_f = [e for e in lib if e.get("brand") == brand]
        mul   = 0.62 if brand == "rodschinson" else 0.38
    else:
        lib_f = lib; mul = 1.0

    videos_gen = len(lib_f)
    leads      = len([e for e in lib_f if e.get("status") in {"Scheduled", "Published"}]) * 5 + 14

    if mc_data:
        # Blend brand filter multiplier into Metricool totals
        total_views   = round(mc_data["totalViews"]  * mul)
        platforms_out = [{"platform": p["platform"], "views": round(p["views"] * mul)} for p in mc_data["platforms"]]
        views30       = [
            {**row,
             "views":       round(row["views"] * mul),
             "rodschinson": round(row["rodschinson"] * mul),
             "rachid":      round(row["rachid"] * mul),
            } for row in mc_data["views30"]
        ] if mc_data["views30"] else _fallback_views30(mul, videos_gen)
        engagement = mc_data["engagement"]
        source     = "metricool"
    else:
        # Pure internal fallback
        platforms_out, views30 = _fallback_platforms(lib_f, mul), _fallback_views30(mul, videos_gen)
        total_views = sum(e["views"] for e in views30) * 4
        engagement  = round(4.2 * mul + (videos_gen * 0.02), 1)
        source      = "internal"

    return {
        "brand":       brand or "both",
        "totalViews":  total_views,
        "viewsDelta":  round(12 + videos_gen * 0.5, 1),
        "engagement":  engagement,
        "engDelta":    0.5,
        "videosGen":   videos_gen or 38,
        "videosDelta": max(1, videos_gen // 5),
        "leads":       leads or 214,
        "leadsDelta":  max(1, leads // 7),
        "views30":     views30,
        "platforms":   platforms_out,
        "source":      source,
    }


def _fallback_platforms(lib_f: list, mul: float) -> list[dict]:
    base_views = {"LinkedIn": 48200, "YouTube": 31500, "Instagram": 27800, "TikTok": 19400, "Facebook": 8100}
    name_map   = {"linkedin": "LinkedIn", "youtube": "YouTube", "instagram": "Instagram",
                  "tiktok": "TikTok", "facebook": "Facebook"}
    counts: dict[str, int] = {}
    for e in lib_f:
        for p in e.get("platforms", []):
            k: str = name_map.get(str(p), str(p).title())
            counts[k] = counts.get(k, 0) + 1
    out = [{"platform": n, "views": round(base * mul * (1 + counts.get(n, 0) * 0.05))}
           for n, base in base_views.items()]
    return sorted(out, key=lambda x: x["views"], reverse=True)


def _fallback_views30(mul: float, videos_gen: int) -> list[dict]:
    import math
    from datetime import date, timedelta
    today = date.today(); scale = max(1.0, videos_gen / 10); rows = []
    for i in range(30):
        d    = today - timedelta(days=29 - i)
        base = abs(1200 + math.sin(i * 0.4) * 600 + (hash(str(d)) % 400))
        v    = round(base * mul * min(scale, 3))
        rows.append({"date": d.strftime("%d %b"), "views": v,
                     "rodschinson": round(base * 0.62 * min(scale, 3)),
                     "rachid":      round(base * 0.38 * min(scale, 3))})
    return rows


# ══════════════════════════════════════════════════════════════════════════════
# CANVA CONNECT API
# ══════════════════════════════════════════════════════════════════════════════

_CANVA_BASE      = "https://api.canva.com/rest/v1"
_CANVA_AUTH_URL  = "https://www.canva.com/api/oauth/authorize"
_CANVA_TOKEN_URL = "https://www.canva.com/api/oauth/token"

# In-memory PKCE store (code_verifier keyed by state) — fine for single-instance
_canva_pkce: dict[str, str] = {}
# In-memory token store keyed by brand ("rodschinson" | "rachid")
_canva_tokens: dict[str, dict] = {}

_CANVA_SCOPES = " ".join([
    "design:content:read",
    "design:content:write",
    "design:meta:read",
    "asset:read",
    "asset:write",
    "brandtemplate:content:read",
    "brandtemplate:meta:read",
    "profile:read",
])

def _canva_client_id() -> str:
    return os.getenv("CANVA_CLIENT_ID", "")

def _canva_client_secret() -> str:
    return os.getenv("CANVA_CLIENT_SECRET", "")

def _canva_redirect_uri() -> str:
    base = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
    return f"{base}/api/canva/callback"

def _pkce_pair() -> tuple[str, str]:
    """Generate a PKCE code_verifier + code_challenge (S256)."""
    verifier  = base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"=").decode()
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


@app.get("/api/canva/auth")
async def canva_auth(brand: str = Query("rodschinson")):
    """Redirect user to Canva OAuth consent screen."""
    if not _canva_client_id():
        raise HTTPException(503, "CANVA_CLIENT_ID not configured")
    verifier, challenge = _pkce_pair()
    state = f"{brand}:{secrets.token_urlsafe(16)}"
    _canva_pkce[state] = verifier

    params = {
        "response_type":         "code",
        "client_id":             _canva_client_id(),
        "redirect_uri":          _canva_redirect_uri(),
        "scope":                 _CANVA_SCOPES,
        "state":                 state,
        "code_challenge":        challenge,
        "code_challenge_method": "S256",
    }
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(f"{_CANVA_AUTH_URL}?{qs}")


@app.get("/api/canva/callback")
async def canva_callback(
    code:              Optional[str] = Query(None),
    state:             Optional[str] = Query(None),
    error:             Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
):
    """Exchange OAuth code for access token and store it."""
    # Canva sends ?error=... when the user denies or something goes wrong
    if error:
        raise HTTPException(400, f"Canva OAuth error: {error} — {error_description or 'no description'}")

    if not code or not state:
        raise HTTPException(400, "Missing code or state — start the flow at /api/canva/auth")

    verifier = _canva_pkce.pop(state, None)
    if not verifier:
        raise HTTPException(400, "Invalid or expired OAuth state — restart at /api/canva/auth")

    brand = state.split(":")[0]

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            _CANVA_TOKEN_URL,
            data={
                "grant_type":    "authorization_code",
                "code":          code,
                "redirect_uri":  _canva_redirect_uri(),
                "code_verifier": verifier,
            },
            auth=(_canva_client_id(), _canva_client_secret()),
        )

    if res.status_code != 200:
        raise HTTPException(502, f"Canva token exchange failed: {res.text[:300]}")

    token_data = res.json()
    token_data["obtained_at"] = _now()
    _canva_tokens[brand] = token_data

    # Save to disk so tokens survive restarts
    tokens_file = OUTPUT / "canva_tokens.json"
    existing = {}
    if tokens_file.exists():
        try: existing = json.loads(tokens_file.read_text())
        except Exception: pass
    existing[brand] = token_data
    tokens_file.write_text(json.dumps(existing, indent=2))

    return {"status": "connected", "brand": brand, "scope": token_data.get("scope", "")}


async def _canva_token(brand: str = "rodschinson") -> str:
    """Return a valid Canva access token, refreshing if needed."""
    # Load from disk if not in memory
    if brand not in _canva_tokens:
        tokens_file = OUTPUT / "canva_tokens.json"
        if tokens_file.exists():
            try:
                data = json.loads(tokens_file.read_text())
                if brand in data:
                    _canva_tokens[brand] = data[brand]
            except Exception:
                pass

    token_data = _canva_tokens.get(brand)
    if not token_data:
        raise HTTPException(401, f"Canva not connected for brand '{brand}'. Visit /api/canva/auth?brand={brand}")

    # Refresh if expired (expires_in seconds from obtained_at)
    obtained   = datetime.fromisoformat(token_data.get("obtained_at", _now()))
    expires_in = int(token_data.get("expires_in", 3600))
    age        = (datetime.now(timezone.utc) - obtained.replace(tzinfo=timezone.utc)).total_seconds()

    if age > expires_in - 120 and token_data.get("refresh_token"):
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                _CANVA_TOKEN_URL,
                data={"grant_type": "refresh_token", "refresh_token": token_data["refresh_token"]},
                auth=(_canva_client_id(), _canva_client_secret()),
            )
        if res.status_code == 200:
            refreshed = res.json()
            refreshed["obtained_at"] = _now()
            _canva_tokens[brand] = refreshed
            tokens_file = OUTPUT / "canva_tokens.json"
            try:
                existing = json.loads(tokens_file.read_text()) if tokens_file.exists() else {}
                existing[brand] = refreshed
                tokens_file.write_text(json.dumps(existing, indent=2))
            except Exception:
                pass
            return refreshed["access_token"]

    return token_data["access_token"]


@app.get("/api/canva/status")
async def canva_status():
    """Check which brands have a valid Canva token."""
    tokens_file = OUTPUT / "canva_tokens.json"
    connected = {}
    if tokens_file.exists():
        try:
            data = json.loads(tokens_file.read_text())
            for brand, td in data.items():
                connected[brand] = {
                    "connected": True,
                    "obtained_at": td.get("obtained_at"),
                    "scope": td.get("scope", ""),
                }
        except Exception:
            pass
    return {"brands": connected, "auth_url": "/api/canva/auth?brand=rodschinson"}


@app.get("/api/canva/templates")
async def canva_brand_templates(brand: str = Query("rodschinson"), q: str = Query("")):
    """List brand templates from Canva."""
    token = await _canva_token(brand)
    params: dict = {"limit": 50}
    if q:
        params["query"] = q
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.get(
            f"{_CANVA_BASE}/brandtemplates",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
        )
    if res.status_code != 200:
        raise HTTPException(502, f"Canva templates error: {res.text[:300]}")
    data = res.json()
    items = data.get("items", [])
    return {
        "templates": [
            {
                "id":       t.get("id"),
                "title":    t.get("title", ""),
                "type":     t.get("design_type", {}).get("name", ""),
                "thumbnail": t.get("thumbnail", {}).get("url", ""),
            }
            for t in items
        ]
    }


class CanvaDesignRequest(BaseModel):
    brand:        str = "rodschinson"
    title:        str = "Rodschinson — Content"
    design_type:  str = "SOCIAL_MEDIA_SQUARE"   # or INSTAGRAM_REEL, PRESENTATION, etc.
    template_id:  Optional[str] = None           # brand template ID to start from


@app.post("/api/canva/design")
async def canva_create_design(body: CanvaDesignRequest):
    """Create a new Canva design (blank or from brand template)."""
    token = await _canva_token(body.brand)

    # Design type name → Canva design_type object
    DESIGN_TYPES = {
        "SOCIAL_MEDIA_SQUARE":  {"name": "SOCIAL_MEDIA_SQUARE"},
        "INSTAGRAM_POST":       {"name": "SOCIAL_MEDIA_PORTRAIT"},
        "INSTAGRAM_REEL":       {"name": "INSTAGRAM_REEL"},
        "TIKTOK":               {"name": "TIKTOK_VIDEO"},
        "YOUTUBE_THUMBNAIL":    {"name": "YOUTUBE_THUMBNAIL"},
        "LINKEDIN_POST":        {"name": "SOCIAL_MEDIA_LANDSCAPE"},
        "PRESENTATION":         {"name": "PRESENTATION"},
        "A4_DOCUMENT":          {"name": "DOCUMENT"},
    }
    dtype = DESIGN_TYPES.get(body.design_type, {"name": body.design_type})

    if body.template_id:
        design_payload = {"design_type": dtype, "asset_id": body.template_id, "title": body.title}
    else:
        design_payload = {"design_type": dtype, "title": body.title}

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{_CANVA_BASE}/designs",
            headers={"Authorization": f"Bearer {token}"},
            json=design_payload,
        )

    if res.status_code not in (200, 201):
        raise HTTPException(502, f"Canva create design failed: {res.text[:300]}")

    design = res.json().get("design", res.json())
    return {
        "design_id":  design.get("id"),
        "title":      design.get("title"),
        "edit_url":   design.get("urls", {}).get("edit_url"),
        "view_url":   design.get("urls", {}).get("view_url"),
        "thumbnail":  design.get("thumbnail", {}).get("url"),
    }


class CanvaExportRequest(BaseModel):
    brand:      str = "rodschinson"
    design_id:  str
    format:     str = "PNG"   # PNG | PDF | MP4 | GIF | PPTX


@app.post("/api/canva/export")
async def canva_export_design(body: CanvaExportRequest):
    """Start an export job for a Canva design and wait for the download URL(s)."""
    token = await _canva_token(body.brand)

    FORMAT_MAP = {
        "PNG":  {"type": "PNG",  "export_quality": "regular", "lossless": False},
        "PDF":  {"type": "PDF",  "export_quality": "regular"},
        "MP4":  {"type": "MP4",  "export_quality": "regular"},
        "GIF":  {"type": "GIF",  "export_quality": "regular"},
        "PPTX": {"type": "PPTX"},
    }
    fmt_opts = FORMAT_MAP.get(body.format.upper(), {"type": body.format.upper()})

    # Start export
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{_CANVA_BASE}/exports",
            headers={"Authorization": f"Bearer {token}"},
            json={"design_id": body.design_id, "format": fmt_opts},
        )

    if res.status_code not in (200, 201):
        raise HTTPException(502, f"Canva export failed: {res.text[:300]}")

    export_data = res.json().get("job", res.json())
    export_id   = export_data.get("id")
    if not export_id:
        return export_data  # Already has URLs (sync export)

    # Poll until complete (max 60s)
    for _ in range(30):
        await asyncio.sleep(2)
        async with httpx.AsyncClient(timeout=15) as client:
            poll = await client.get(
                f"{_CANVA_BASE}/exports/{export_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
        if poll.status_code != 200:
            continue
        job = poll.json().get("job", poll.json())
        status = job.get("status", "")
        if status == "success":
            urls = [u.get("url") for u in job.get("urls", []) if u.get("url")]
            return {"status": "success", "export_id": export_id, "urls": urls, "format": body.format}
        if status in ("failed", "error"):
            raise HTTPException(502, f"Canva export job failed: {job}")

    raise HTTPException(504, "Canva export timed out after 60s")


# ── Auth endpoints ─────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/auth/login")
async def auth_login(body: LoginRequest):
    users = await _users_load()
    user = next((u for u in users if u["username"] == body.username and u["password"] == body.password), None)
    # Legacy fallback: single admin credentials from env
    if not user and body.username == _APP_USERNAME and body.password == _APP_PASSWORD:
        user = {"username": body.username, "role": "admin", "email": ""}
    if not user:
        raise HTTPException(401, "Invalid credentials")
    token = _make_token(user["username"])
    return {"token": token, "username": user["username"], "role": user.get("role", "admin")}

@app.post("/api/auth/logout")
async def auth_logout():
    return {"status": "ok"}

@app.get("/api/auth/me")
async def auth_me(request: Request):
    token = _get_request_token(request)
    username = _verify_token(token) if token else None
    if not username:
        raise HTTPException(401, "Not authenticated")
    user = await _get_user(username)
    role = user.get("role", "admin") if user else "admin"
    return {"username": username, "role": role}


# ── Users management endpoints ─────────────────────────────────────────────────

@app.get("/api/users")
async def list_users(request: Request):
    u = await _get_request_user(request)
    _require_role(u, "admin")
    users = await _users_load()
    return [{"id": x["id"], "username": x["username"], "role": x["role"], "email": x.get("email",""), "created_at": x.get("created_at","")} for x in users]

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "creator"
    email: str = ""

@app.post("/api/users", status_code=201)
async def create_user(body: UserCreate, request: Request):
    u = await _get_request_user(request)
    _require_role(u, "admin")
    if body.role not in _ROLE_RANK:
        raise HTTPException(422, f"role must be one of {list(_ROLE_RANK)}")
    users = await _users_load()
    if any(x["username"] == body.username for x in users):
        raise HTTPException(409, "Username already exists")
    entry = {"id": str(uuid.uuid4()), "username": body.username, "password": body.password,
             "role": body.role, "email": body.email, "created_at": _now()}
    users.append(entry)
    await _users_save(users)
    return {"id": entry["id"], "username": entry["username"], "role": entry["role"]}

class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None

@app.put("/api/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, request: Request):
    u = await _get_request_user(request)
    _require_role(u, "admin")
    users = await _users_load()
    target = next((x for x in users if x["id"] == user_id or x["username"] == user_id), None)
    if not target:
        raise HTTPException(404, "User not found")
    if body.password: target["password"] = body.password
    if body.role:
        if body.role not in _ROLE_RANK:
            raise HTTPException(422, f"role must be one of {list(_ROLE_RANK)}")
        target["role"] = body.role
    if body.email is not None: target["email"] = body.email
    await _users_save(users)
    return {"id": target["id"], "username": target["username"], "role": target["role"]}

@app.delete("/api/users/{user_id}", status_code=204)
async def delete_user(user_id: str, request: Request):
    u = await _get_request_user(request)
    _require_role(u, "admin")
    users = await _users_load()
    updated = [x for x in users if x["id"] != user_id and x["username"] != user_id]
    if len(updated) == len(users):
        raise HTTPException(404, "User not found")
    await _users_save(updated)


# ── Comments endpoints ─────────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    text: str

@app.get("/api/library/{job_id}/comments")
async def get_comments(job_id: str):
    comments = await _comments_load()
    return [c for c in comments if c.get("job_id") == job_id]

@app.post("/api/library/{job_id}/comments", status_code=201)
async def add_comment(job_id: str, body: CommentCreate, request: Request):
    token = _get_request_token(request)
    username = _verify_token(token) if token else "anonymous"
    comments = await _comments_load()
    entry = {
        "id": str(uuid.uuid4()),
        "job_id": job_id,
        "text": body.text,
        "author": username or "anonymous",
        "created_at": _now(),
    }
    comments.append(entry)
    await _comments_save(comments)
    # Fire notification to other users about new comment
    asyncio.create_task(_notify_comment(job_id, username or "anonymous", body.text))
    return entry

@app.delete("/api/library/{job_id}/comments/{comment_id}", status_code=204)
async def delete_comment(job_id: str, comment_id: str, request: Request):
    await _get_request_user(request)  # auth check; role enforcement can be added
    comments = await _comments_load()
    updated = [c for c in comments if not (c["id"] == comment_id and c["job_id"] == job_id)]
    await _comments_save(updated)

async def _notify_comment(job_id: str, author: str, text: str):
    """Send email notification when a comment is added (non-blocking)."""
    try:
        lib = await _library_load()
        entry = next((e for e in lib if e.get("job_id") == job_id), None)
        title = entry.get("title", job_id) if entry else job_id
        await _send_notification(
            subject=f"New comment on: {title}",
            body=f"{author} commented:\n\n{text}\n\nContent: {title}",
        )
    except Exception as exc:
        log.warning("Comment notify failed: %s", exc)


# ── Status-change notification helper ─────────────────────────────────────────

async def _send_notification(subject: str, body: str):
    """Send email via SMTP if configured. Silent on failure."""
    host  = os.getenv("SMTP_HOST", "")
    port  = int(os.getenv("SMTP_PORT", "587"))
    user  = os.getenv("SMTP_USER", "")
    pw    = os.getenv("SMTP_PASS", "")
    to    = os.getenv("NOTIFY_EMAIL", user)
    slack = os.getenv("SLACK_WEBHOOK_URL", "")

    if slack:
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                await c.post(slack, json={"text": f"*{subject}*\n{body}"})
        except Exception as exc:
            log.warning("Slack notify failed: %s", exc)

    if not all([host, user, pw, to]):
        return
    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = user
        msg["To"] = to
        import asyncio as _aio
        loop = _aio.get_event_loop()
        await loop.run_in_executor(None, _smtp_send, host, port, user, pw, to, msg)
    except Exception as exc:
        log.warning("Email notify failed: %s", exc)

def _smtp_send(host, port, user, pw, to, msg):
    with smtplib.SMTP(host, port, timeout=10) as s:
        s.starttls()
        s.login(user, pw)
        s.sendmail(user, [to], msg.as_string())




# ── Repurpose engine ───────────────────────────────────────────────────────────

class RepurposeRequest(BaseModel):
    formats: Optional[list[str]] = None  # e.g. ["reel","carousel","text_only"] — default all
    brand: Optional[str] = None
    language: Optional[str] = None

@app.post("/api/repurpose/{job_id}", status_code=202)
async def repurpose_content(job_id: str, body: RepurposeRequest = RepurposeRequest()):
    """
    Generate all missing formats from an existing piece of content.
    Reads the original brief/subject from the library entry's script and
    queues new generation jobs for each requested format.
    Returns a list of new job IDs.
    """
    lib = await _library_load()
    source = next((e for e in lib if e.get("job_id") == job_id), None)
    if not source:
        raise HTTPException(404, "Source library entry not found")

    # Extract subject from script metadata
    subject = source.get("title", "")
    brand   = body.brand or source.get("brand", "rodschinson")
    lang    = body.language or source.get("language", "EN")
    script_path = source.get("script_path")
    if script_path and os.path.isfile(script_path):
        try:
            sdata = json.loads(open(script_path, encoding="utf-8").read())
            subject = sdata.get("meta", {}).get("titre") or subject
        except Exception:
            pass

    # Default: generate all complementary formats not already produced
    existing_type = source.get("content_type", "video")
    all_formats = ["video", "reel", "carousel", "text_only"]
    requested = body.formats or [f for f in all_formats if f != existing_type]

    FORMAT_DEFAULTS = {
        "video":     {"format": "16:9", "template": "educational", "duration": 60},
        "reel":      {"format": "9:16", "template": "reel_premium", "duration": 30},
        "carousel":  {"format": "1:1",  "template": "carousel_bold", "duration": 0},
        "text_only": {"format": "text", "template": "",              "duration": 0},
    }

    new_jobs = []
    for fmt_type in requested:
        if fmt_type not in FORMAT_DEFAULTS:
            continue
        d = FORMAT_DEFAULTS[fmt_type]
        new_job_id = str(uuid.uuid4())
        new_job = {
            "job_id": new_job_id,
            "status": "pending",
            "step": "Queued",
            "detail": f"Repurposed from {job_id[:8]}",
            "content_type": fmt_type,
            "brand": brand,
            "language": lang,
            "subject": subject,
            "format": d["format"],
            "template": d["template"],
            "source_job_id": job_id,
            "created_at": _now(),
            "updated_at": _now(),
        }
        await _save_job(new_job)
        asyncio.create_task(_run_repurpose_job(new_job_id, subject, brand, lang, d, fmt_type))
        new_jobs.append({"job_id": new_job_id, "content_type": fmt_type, "status": "pending"})

    return {"source_job_id": job_id, "jobs": new_jobs}

async def _run_repurpose_job(job_id: str, subject: str, brand: str, lang: str, d: dict, fmt_type: str):
    """Background task: run a single repurpose generation."""
    try:
        brands = await _brands_load()
        brand_obj = next((b for b in brands if b["id"] == brand or b.get("slug") == brand), {})
        # Reuse the same generate pipeline — build a minimal form payload
        # We'll call generate_content internals by constructing the right args
        job = json.loads((JOBS_DIR / f"{job_id}.json").read_text())
        _job_update(job, status="running", step="Script", detail="Generating script…")
        await _save_job(job)

        # Script generation
        script_args = [
            str(PYTHON), str(SCRIPTS / "generate_video_script.py"),
            "--subject", subject,
            "--brand", brand_obj.get("name", brand),
            "--language", lang,
            "--content_type", fmt_type,
            "--template", d["template"],
            "--output_dir", str(OUTPUT / "scripts"),
            "--job_id", job_id,
        ]
        rc, _out, err = await _run(script_args, job_id=job_id)
        if rc != 0:
            _job_update(job, status="error", step="Script", detail=err[:400])
            await _save_job(job)
            return

        script_file = OUTPUT / "scripts" / f"{job_id}.json"
        if not script_file.exists():
            _job_update(job, status="error", step="Script", detail="Script file not found")
            await _save_job(job)
            return

        if fmt_type == "text_only":
            script_data = json.loads(script_file.read_text())
            output_text = script_data.get("text") or script_data.get("meta", {}).get("description", "")
            _job_update(job, status="done", step="Done", detail="Text post ready",
                        script_path=str(script_file), output_text=output_text)
            await _save_job(job)
        else:
            _job_update(job, step="Render", detail="Rendering…")
            await _save_job(job)
            render_args = [
                "node", str(PUPPET / "renderer.js"),
                "--script", str(script_file),
                "--output", str(OUTPUT / "scenes"),
                "--job_id", job_id,
            ]
            rc2, _out2, err2 = await _run(render_args, job_id=job_id)
            if rc2 != 0:
                _job_update(job, status="error", step="Render", detail=err2[:400])
                await _save_job(job)
                return
            _job_update(job, status="done", step="Done", detail="Ready",
                        script_path=str(script_file))
            await _save_job(job)

        lib_entry = {
            "job_id": job_id,
            "title": f"[Repurposed] {subject[:60]}",
            "brand": brand,
            "language": lang,
            "content_type": fmt_type,
            "format": d["format"],
            "template": d["template"],
            "platforms": [],
            "status": "Draft",
            "script_path": str(OUTPUT / "scripts" / f"{job_id}.json"),
            "source_job_id": job["source_job_id"],
            "created_at": _now(),
            "updated_at": _now(),
        }
        await _library_append(lib_entry)

    except Exception as exc:
        log.exception("Repurpose job %s failed: %s", job_id, exc)
        try:
            job = json.loads((JOBS_DIR / f"{job_id}.json").read_text())
            _job_update(job, status="error", step="Error", detail=str(exc)[:300])
            await _save_job(job)
        except Exception:
            pass


# ── Per-platform caption generator ────────────────────────────────────────────

class CaptionRequest(BaseModel):
    job_id: str
    platforms: list[str]
    base_caption: Optional[str] = None

@app.post("/api/captions/generate")
async def generate_platform_captions(body: CaptionRequest):
    """
    Use Claude to produce platform-optimised captions for each requested platform.
    Returns a dict of {platform: caption_text}.
    """
    lib = await _library_load()
    entry = next((e for e in lib if e.get("job_id") == body.job_id), None)
    base = body.base_caption or (entry.get("output_text") if entry else "") or ""
    title = (entry.get("title", "") if entry else "")
    brand_id = (entry.get("brand", "") if entry else "")
    brands = await _brands_load()
    brand = next((b for b in brands if b["id"] == brand_id), {})
    brand_name = brand.get("name", brand_id)
    brand_ctx  = brand.get("context", "")

    if not base and entry:
        # Try to extract from script
        sp = entry.get("script_path")
        if sp and os.path.isfile(sp):
            try:
                sd = json.loads(open(sp).read())
                base = sd.get("meta", {}).get("description") or title
            except Exception:
                pass
    if not base:
        base = title

    _PLATFORM_GUIDANCE = {
        "linkedin":  "Professional tone. 1200–1500 chars. Hook sentence, 3 insight bullets, strong CTA. No emoji spam. End with 3–5 relevant hashtags.",
        "instagram": "Conversational and engaging. 150–300 chars visible above fold, expand below. 5–10 relevant hashtags. 1–2 emojis in first line.",
        "twitter":   "Max 280 chars. Punchy. One clear point. 1–2 hashtags max. Optional thread indicator (🧵 1/x).",
        "tiktok":    "Casual, energetic. Under 150 chars. Trending hashtags. Hook word in first 5 words.",
        "facebook":  "Friendly and conversational. 80–120 chars optimal. Can include question to drive comments. 2–3 hashtags.",
        "youtube":   "SEO-optimised description. 200–300 chars first paragraph (shows above fold). Include target keywords naturally. Then timestamps if applicable.",
        "bluesky":   "Thoughtful, community-focused. Max 300 chars. 1–2 hashtags. Similar to Twitter but more longform-friendly.",
    }

    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not anthropic_key:
        # Return plain base caption for all platforms if no AI key
        return {p: base for p in body.platforms}

    results = {}
    for platform in body.platforms:
        guidance = _PLATFORM_GUIDANCE.get(platform, "Adapt the caption for this platform.")
        prompt = f"""You are a social media copywriter for {brand_name}.
{brand_ctx}

Original content: "{base}"
Title: "{title}"

Write a caption optimised for {platform.upper()}.
Guidelines: {guidance}

Return ONLY the caption text, no explanation, no quotes around it."""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": anthropic_key, "anthropic-version": "2023-06-01",
                             "content-type": "application/json"},
                    json={"model": "claude-haiku-4-5-20251001", "max_tokens": 500,
                          "messages": [{"role": "user", "content": prompt}]},
                )
                if resp.status_code == 200:
                    results[platform] = resp.json()["content"][0]["text"].strip()
                else:
                    results[platform] = base
        except Exception:
            results[platform] = base

    return results


# ── Recurring series ───────────────────────────────────────────────────────────

class SeriesCreate(BaseModel):
    name: str
    brand: str
    language: str = "EN"
    content_type: str = "carousel"
    template: str = "carousel_bold"
    format: str = "1:1"
    platforms: list[str] = []
    subject_template: str  # e.g. "Weekly market update for {brand} — week {week}"
    cadence: str = "weekly"   # weekly | biweekly | monthly
    day_of_week: int = 1      # 0=Mon … 6=Sun
    slot: str = "morning"
    active: bool = True

@app.get("/api/series")
async def list_series():
    return await _series_load()

@app.post("/api/series", status_code=201)
async def create_series(body: SeriesCreate):
    if body.slot not in VALID_SLOTS:
        raise HTTPException(422, f"slot must be one of {sorted(VALID_SLOTS)}")
    entry = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "brand": body.brand,
        "language": body.language,
        "content_type": body.content_type,
        "template": body.template,
        "format": body.format,
        "platforms": body.platforms,
        "subject_template": body.subject_template,
        "cadence": body.cadence,
        "day_of_week": body.day_of_week,
        "slot": body.slot,
        "active": body.active,
        "last_run": None,
        "created_at": _now(),
    }
    series = await _series_load()
    series.append(entry)
    await _series_save(series)
    return entry

@app.put("/api/series/{series_id}")
async def update_series(series_id: str, body: SeriesCreate):
    series = await _series_load()
    s = next((x for x in series if x["id"] == series_id), None)
    if not s:
        raise HTTPException(404, "Series not found")
    s.update(body.model_dump())
    await _series_save(series)
    return s

@app.delete("/api/series/{series_id}", status_code=204)
async def delete_series(series_id: str):
    series = await _series_load()
    updated = [x for x in series if x["id"] != series_id]
    if len(updated) == len(series):
        raise HTTPException(404, "Series not found")
    await _series_save(updated)

@app.post("/api/series/{series_id}/run")
async def run_series_now(series_id: str):
    """Manually trigger a series run (generate + queue next post)."""
    series = await _series_load()
    s = next((x for x in series if x["id"] == series_id), None)
    if not s:
        raise HTTPException(404, "Series not found")
    job_id = await _trigger_series_run(s)
    return {"job_id": job_id, "series_id": series_id}

async def _trigger_series_run(s: dict) -> str:
    """Generate content for a series entry. Returns new job_id."""
    from datetime import date
    week_num = date.today().isocalendar()[1]
    brands = await _brands_load()
    brand_obj = next((b for b in brands if b["id"] == s["brand"]), {})
    subject = s["subject_template"].format(
        brand=brand_obj.get("name", s["brand"]),
        week=week_num,
        date=date.today().isoformat(),
    )
    new_job_id = str(uuid.uuid4())
    job = {
        "job_id": new_job_id, "status": "pending", "step": "Queued",
        "detail": f"Series: {s['name']}", "content_type": s["content_type"],
        "brand": s["brand"], "language": s["language"], "subject": subject,
        "format": s["format"], "template": s["template"],
        "series_id": s["id"], "created_at": _now(), "updated_at": _now(),
    }
    await _save_job(job)
    d = {"format": s["format"], "template": s["template"], "duration": 60}
    asyncio.create_task(_run_repurpose_job(new_job_id, subject, s["brand"], s["language"], d, s["content_type"]))
    # Update last_run
    series = await _series_load()
    for entry in series:
        if entry["id"] == s["id"]:
            entry["last_run"] = _now()
    await _series_save(series)
    return new_job_id


# ── Content gap detection ─────────────────────────────────────────────────────

@app.get("/api/schedule/gaps")
async def get_schedule_gaps(start: Optional[str] = None, brand: Optional[str] = None):
    """
    Analyse the next 14 days and return days/platforms with no scheduled content.
    Also flags any brand with < 3 posts in the coming 7 days.
    """
    from datetime import date, timedelta
    today = date.today()
    if start:
        try: today = date.fromisoformat(start)
        except ValueError: raise HTTPException(422, "start must be YYYY-MM-DD")

    all_entries = await _schedule_load()
    brands = await _brands_load()
    _brand_ids = [b["id"] for b in brands]  # noqa: used for future extension

    gaps = []
    for offset in range(14):
        d = today + timedelta(days=offset)
        d_str = d.isoformat()
        day_entries = [e for e in all_entries if e.get("date") == d_str
                       and (not brand or e.get("brand") == brand)]
        platforms_scheduled = {e.get("platform") for e in day_entries}
        core_platforms = {"linkedin", "instagram"}
        missing = core_platforms - platforms_scheduled
        if missing:
            gaps.append({
                "date": d_str,
                "weekday": d.strftime("%A"),
                "missing_platforms": sorted(missing),
                "severity": "high" if offset < 3 else "medium",
            })

    # Brand frequency warnings
    warnings = []
    week_end = (today + timedelta(days=7)).isoformat()
    for b in (brands if not brand else [x for x in brands if x["id"] == brand]):
        bid = b["id"]
        week_posts = [e for e in all_entries
                      if e.get("brand") == bid and today.isoformat() <= e.get("date","") <= week_end]
        if len(week_posts) < 3:
            warnings.append({
                "brand": bid,
                "brand_name": b.get("name", bid),
                "posts_next_7_days": len(week_posts),
                "recommended_minimum": 3,
                "message": f"{b.get('name', bid)} has only {len(week_posts)} post(s) in the next 7 days (min: 3)",
            })

    return {"gaps": gaps, "warnings": warnings, "analysed_days": 14}


# ── Weekly report ─────────────────────────────────────────────────────────────

@app.get("/api/reports/weekly")
async def weekly_report(send_email: bool = False, brand: Optional[str] = None):
    """
    Generate a text summary of last week's activity and optionally email it.
    """
    from datetime import date, timedelta
    today = date.today()
    week_start = today - timedelta(days=7)
    lib = await _library_load()
    sched = await _schedule_load()

    # Filter to last week
    recent_lib = [e for e in lib
                  if e.get("created_at", "")[:10] >= week_start.isoformat()
                  and (not brand or e.get("brand") == brand)]
    recent_sched = [e for e in sched
                    if e.get("date", "") >= week_start.isoformat()
                    and e.get("date", "") <= today.isoformat()
                    and (not brand or e.get("brand") == brand)]

    published = [e for e in recent_lib if e.get("status") == "Published"]
    by_type = {}
    for e in recent_lib:
        t = e.get("content_type", "unknown")
        by_type[t] = by_type.get(t, 0) + 1
    by_platform = {}
    for e in recent_sched:
        p = e.get("platform", "unknown")
        by_platform[p] = by_platform.get(p, 0) + 1

    sent_count = len([e for e in recent_sched if e.get("publish_status") in ("sent", "published")])

    report = {
        "period": {"start": week_start.isoformat(), "end": today.isoformat()},
        "content_created": len(recent_lib),
        "published": len(published),
        "scheduled_posts_sent": sent_count,
        "by_content_type": by_type,
        "by_platform": by_platform,
        "brand": brand or "all",
    }

    if send_email:
        lines = [
            f"Weekly Content Report — {week_start.isoformat()} to {today.isoformat()}",
            f"Brand: {brand or 'all'}",
            "",
            f"Content created:    {report['content_created']}",
            f"Published:          {report['published']}",
            f"Scheduled sent:     {report['scheduled_posts_sent']}",
            "",
            "By type: " + ", ".join(f"{k}: {v}" for k, v in by_type.items()),
            "By platform: " + ", ".join(f"{k}: {v}" for k, v in by_platform.items()),
        ]
        asyncio.create_task(_send_notification(
            subject=f"Weekly Report — {today.isoformat()}",
            body="\n".join(lines),
        ))
        report["email_sent"] = True

    return report


# ── Settings endpoints ─────────────────────────────────────────────────────────

_SETTINGS_SCHEMA = [
    # (key, label, group, type, sensitive)
    ("APP_USERNAME",                 "App username",          "security",     "text",     False),
    ("APP_PASSWORD",                 "App password",          "security",     "password", True),
    ("BACKEND_PUBLIC_URL",           "Backend public URL",    "publishing",   "text",     False),
    ("METRICOOL_API_TOKEN",          "Metricool API token",   "metricool",    "password", True),
    ("METRICOOL_USER_ID",            "Metricool user ID",     "metricool",    "text",     False),
    ("METRICOOL_BLOG_ID_RODSCHINSON","Blog ID — Rodschinson", "metricool",    "text",     False),
    ("METRICOOL_BLOG_ID_RACHID",     "Blog ID — Rachid",      "metricool",    "text",     False),
    ("ELEVENLABS_API_KEY",           "ElevenLabs API key",    "elevenlabs",   "password", True),
    ("ELEVENLABS_VOICE_ID_RACHID",   "Voice ID — Rachid",     "elevenlabs",   "text",     False),
    ("ELEVENLABS_VOICE_ID_STANDARD", "Voice ID — Standard",   "elevenlabs",   "text",     False),
    ("ANTHROPIC_API_KEY",            "Anthropic API key",     "ai",           "password", True),
    ("FRONTEND_URL",                 "Frontend URL (CORS)",   "general",      "text",     False),
    ("NOTIFY_EMAIL",                 "Notification email",    "notifications","text",     False),
    ("SLACK_WEBHOOK_URL",            "Slack webhook URL",     "notifications","text",     False),
    ("ADMIN_EMAIL",                  "Admin email",           "security",     "text",     False),
]

def _mask(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "•" * len(value)
    return value[:4] + "•" * (len(value) - 8) + value[-4:]

@app.get("/api/settings")
async def get_settings():
    overrides = _settings_load()
    result: dict[str, dict] = {}
    for key, label, group, ftype, sensitive in _SETTINGS_SCHEMA:
        env_val  = os.getenv(key, "")
        ovr_val  = overrides.get(key, "")
        actual   = ovr_val or env_val
        result[key] = {
            "label":     label,
            "group":     group,
            "type":      ftype,
            "sensitive": sensitive,
            "value":     _mask(actual) if sensitive else actual,
            "source":    "override" if ovr_val else ("env" if env_val else "unset"),
            "hasValue":  bool(actual),
        }
    return result

class SettingsUpdateRequest(BaseModel):
    updates: dict[str, str]

@app.put("/api/settings")
async def update_settings(body: SettingsUpdateRequest, request: Request):
    allowed_keys = {s[0] for s in _SETTINGS_SCHEMA}
    overrides = _settings_load()

    for key, value in body.updates.items():
        if key not in allowed_keys:
            continue
        # If the value looks like a masked string, skip it (user didn't change it)
        if value and all(c == "•" for c in value.replace(value[:4], "").replace(value[-4:], "")):
            continue
        if value == "":
            overrides.pop(key, None)  # clear override → fall back to env
        else:
            overrides[key] = value
            # Also update process env so changes take effect without restart
            os.environ[key] = value

    _settings_save(overrides)

    # Re-apply special vars that are cached at startup
    global _APP_USERNAME, _APP_PASSWORD, _APP_SECRET
    _APP_USERNAME = overrides.get("APP_USERNAME") or os.getenv("APP_USERNAME", "admin")
    _APP_PASSWORD = overrides.get("APP_PASSWORD") or os.getenv("APP_PASSWORD", "")
    _APP_SECRET   = overrides.get("APP_SECRET")   or os.getenv("APP_SECRET", "")

    return {"status": "saved", "keys": list(body.updates.keys())}


# ══════════════════════════════════════════════════════════════════════════════
# AI STRATEGY LAYER
# ══════════════════════════════════════════════════════════════════════════════

# ── Storage helpers ────────────────────────────────────────────────────────────
async def _strategy_load() -> list[dict]:
    if not STRATEGY_FILE.exists():
        return []
    async with aiofiles.open(STRATEGY_FILE) as f:
        return json.loads(await f.read())

async def _strategy_save(data: list[dict]) -> None:
    async with aiofiles.open(STRATEGY_FILE, "w") as f:
        await f.write(json.dumps(data, indent=2, default=str))

async def _ab_tests_load() -> list[dict]:
    if not AB_TESTS_FILE.exists():
        return []
    async with aiofiles.open(AB_TESTS_FILE) as f:
        return json.loads(await f.read())

async def _ab_tests_save(data: list[dict]) -> None:
    async with aiofiles.open(AB_TESTS_FILE, "w") as f:
        await f.write(json.dumps(data, indent=2, default=str))

async def _assets_load() -> list[dict]:
    if not ASSETS_FILE.exists():
        return []
    async with aiofiles.open(ASSETS_FILE) as f:
        return json.loads(await f.read())

async def _assets_save(data: list[dict]) -> None:
    async with aiofiles.open(ASSETS_FILE, "w") as f:
        await f.write(json.dumps(data, indent=2, default=str))

# ── Shared Claude call helper ──────────────────────────────────────────────────
async def _claude_strategy(prompt: str, model: str = "claude-haiku-4-5-20251001") -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(503, "ANTHROPIC_API_KEY not configured")
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=api_key)
    msg = await client.messages.create(
        model=model,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    return next((getattr(b, "text", "") for b in msg.content if getattr(b, "text", None)), "")


# ── 1. Content Strategy Generator ─────────────────────────────────────────────
class StrategyRequest(BaseModel):
    brand: str
    industry: str
    audience: str
    goals: list[str]              # ["leads", "awareness", "authority"]
    platforms: list[str]
    duration_days: int = 30

@app.post("/api/strategy/generate")
async def generate_strategy(body: StrategyRequest):
    brand_meta = await _brand_lookup(body.brand) or {}
    brand_name = brand_meta.get("name", body.brand)
    icp = brand_meta.get("icp") or {}

    prompt = f"""You are a senior content strategist. Generate a {body.duration_days}-day content strategy.

BRAND: {brand_name}
INDUSTRY: {body.industry}
TARGET AUDIENCE: {body.audience}
{f'ICP: {icp.get("jobTitle","")} — Pain points: {icp.get("painPoints","")}' if icp.get("jobTitle") else ""}
GOALS: {", ".join(body.goals)}
PLATFORMS: {", ".join(body.platforms)}

Return a JSON object with this exact structure:
{{
  "summary": "2-sentence strategy overview",
  "content_pillars": [
    {{"name": "Educational", "percentage": 40, "description": "...", "examples": ["topic1", "topic2", "topic3"]}},
    {{"name": "Authority", "percentage": 30, "description": "...", "examples": ["topic1", "topic2", "topic3"]}},
    {{"name": "Storytelling", "percentage": 20, "description": "...", "examples": ["topic1", "topic2", "topic3"]}},
    {{"name": "Promotional", "percentage": 10, "description": "...", "examples": ["topic1", "topic2"]}}
  ],
  "platform_mix": [
    {{"platform": "linkedin", "posts_per_week": 3, "best_times": ["08:00", "12:00"], "content_types": ["video", "carousel"]}},
    {{"platform": "instagram", "posts_per_week": 4, "best_times": ["09:00", "18:00"], "content_types": ["reel", "story"]}}
  ],
  "weekly_themes": [
    {{"week": 1, "theme": "...", "topics": ["topic1", "topic2", "topic3"]}},
    {{"week": 2, "theme": "...", "topics": ["topic1", "topic2", "topic3"]}},
    {{"week": 3, "theme": "...", "topics": ["topic1", "topic2", "topic3"]}},
    {{"week": 4, "theme": "...", "topics": ["topic1", "topic2", "topic3"]}}
  ],
  "kpis": ["KPI1", "KPI2", "KPI3"],
  "warnings": []
}}
Return only valid JSON, no markdown."""

    raw = await _claude_strategy(prompt, model="claude-haiku-4-5-20251001")
    try:
        strategy_data = _parse_json(raw)
    except json.JSONDecodeError:
        strategy_data = {}

    record = {
        "id": str(uuid.uuid4()),
        "brand": body.brand,
        "industry": body.industry,
        "audience": body.audience,
        "goals": body.goals,
        "platforms": body.platforms,
        "duration_days": body.duration_days,
        "strategy": strategy_data,
        "createdAt": _now(),
    }
    strategies = await _strategy_load()
    strategies.insert(0, record)
    await _strategy_save(strategies[:20])  # keep last 20
    return record


# ── 2. Auto Calendar Fill ──────────────────────────────────────────────────────
class CalendarFillRequest(BaseModel):
    strategy_id: str
    start_date: str   # YYYY-MM-DD

@app.post("/api/strategy/calendar-fill")
async def calendar_fill(body: CalendarFillRequest):
    strategies = await _strategy_load()
    strat = next((s for s in strategies if s["id"] == body.strategy_id), None)
    if not strat:
        raise HTTPException(404, "Strategy not found")

    platform_mix = strat["strategy"].get("platform_mix", [])
    weekly_themes = strat["strategy"].get("weekly_themes", [])
    content_pillars = strat["strategy"].get("content_pillars", [])

    # Build pillar weights for random selection
    pillar_pool: list[str] = []
    for p in content_pillars:
        count = max(1, round(p.get("percentage", 25) / 10))
        pillar_pool.extend(p.get("examples", [p["name"]]) * count)

    import random, datetime as _dt
    start = _dt.date.fromisoformat(body.start_date)
    schedule = await _schedule_load()
    library = await _library_load()
    approved_jobs = [j for j in library if j.get("status") in ("Approved", "Ready")]

    created: list[dict] = []
    day_offset = 0
    for week_idx, week in enumerate(weekly_themes):
        week_platforms = {}
        for pm in platform_mix:
            ppw = pm.get("posts_per_week", 3)
            times = pm.get("best_times", ["09:00"])
            week_platforms[pm["platform"]] = {"ppw": ppw, "times": times, "posted": 0}

        for d in range(7):
            date_obj = start + _dt.timedelta(days=day_offset)
            date_str  = date_obj.isoformat()
            day_offset += 1

            for platform, cfg in week_platforms.items():
                remaining_days = 7 - d
                remaining_posts = cfg["ppw"] - cfg["posted"]
                if remaining_posts <= 0:
                    break
                # probabilistic post placement
                if random.random() < remaining_posts / max(remaining_days, 1):
                    time_str = cfg["times"][cfg["posted"] % len(cfg["times"])]
                    slot = "morning" if int(time_str[:2]) < 11 else "noon" if int(time_str[:2]) < 14 else "afternoon" if int(time_str[:2]) < 18 else "evening"
                    topic = random.choice(week.get("topics", [week["theme"]]))
                    # pick an approved job if available, else placeholder
                    job = random.choice(approved_jobs) if approved_jobs else None
                    entry = {
                        "id": str(uuid.uuid4()),
                        "date": date_str,
                        "slot": slot,
                        "scheduled_time": time_str,
                        "platform": platform,
                        "title": f"[{week['theme']}] {topic}",
                        "content_type": random.choice(["video", "carousel", "reel"]),
                        "status": "Scheduled",
                        "publish_status": "local",
                        "job_id": job["job_id"] if job else None,
                        "strategy_id": body.strategy_id,
                        "week_theme": week["theme"],
                    }
                    schedule.append(entry)
                    created.append(entry)
                    cfg["posted"] += 1

    await _schedule_save(schedule)
    return {"created": len(created), "entries": created}


# ── 3. Content Mix Analysis ────────────────────────────────────────────────────
@app.get("/api/strategy/content-mix/{brand_id}")
async def content_mix(brand_id: str):
    library = await _library_load()
    items = [j for j in library if j.get("brand") == brand_id or brand_id == "all"]

    type_counts: dict[str, int] = {}
    platform_counts: dict[str, int] = {}
    status_counts: dict[str, int] = {}
    total = len(items)

    for item in items:
        ct = item.get("content_type") or item.get("contentType") or "video"
        type_counts[ct] = type_counts.get(ct, 0) + 1
        for p in (item.get("platforms") or []):
            platform_counts[p] = platform_counts.get(p, 0) + 1
        st = item.get("status", "Draft")
        status_counts[st] = status_counts.get(st, 0) + 1

    # Infer content pillars from titles (simple keyword matching)
    pillar_counts = {"Educational": 0, "Authority": 0, "Storytelling": 0, "Promotional": 0}
    edu_kw    = ["how", "tips", "guide", "explained", "what is", "learn", "steps"]
    auth_kw   = ["market", "data", "analysis", "research", "report", "insight"]
    story_kw  = ["story", "journey", "case", "behind", "personal"]
    promo_kw  = ["offer", "service", "consultation", "free", "apply", "join"]
    for item in items:
        title = (item.get("title") or "").lower()
        if any(k in title for k in promo_kw):  pillar_counts["Promotional"] += 1
        elif any(k in title for k in story_kw): pillar_counts["Storytelling"] += 1
        elif any(k in title for k in auth_kw):  pillar_counts["Authority"] += 1
        else:                                    pillar_counts["Educational"] += 1

    # Ideal mix targets
    targets = {"Educational": 40, "Authority": 30, "Storytelling": 20, "Promotional": 10}
    warnings: list[str] = []
    if total > 0:
        for pillar, target in targets.items():
            actual = round(pillar_counts[pillar] / total * 100)
            if abs(actual - target) > 15:
                warnings.append(f"{pillar} is {actual}% (target {target}%) — {'too much' if actual > target else 'too little'}")

    return {
        "total": total,
        "by_type": type_counts,
        "by_platform": platform_counts,
        "by_status": status_counts,
        "pillars": {k: {"count": v, "pct": round(v/total*100) if total else 0, "target": targets[k]} for k,v in pillar_counts.items()},
        "warnings": warnings,
    }


# ── 4. Hook Generator ──────────────────────────────────────────────────────────
class HookRequest(BaseModel):
    topic: str
    brand: str = ""
    content_type: str = "video"
    audience: str = ""

@app.post("/api/hooks/generate")
async def generate_hooks(body: HookRequest):
    brand_meta = (await _brand_lookup(body.brand) or {}) if body.brand else {}
    brand_name = brand_meta.get("name", "")
    icp = brand_meta.get("icp") or {}
    audience = body.audience or icp.get("jobTitle", "business professionals")

    prompt = f"""Generate 10 powerful hooks for this content. Each hook must be different in style.

TOPIC: {body.topic}
CONTENT TYPE: {body.content_type}
AUDIENCE: {audience}
{f'BRAND: {brand_name}' if brand_name else ''}

Hook styles to cover: Curiosity, Controversial, Data-driven, Story-based, Question, Bold Statement, Contrast, Fear of Missing Out, How-to Promise, Relatable Problem.

Return JSON array only:
[
  {{
    "style": "Curiosity",
    "hook": "The hook text here",
    "score": {{
      "scroll_stopping": 8,
      "clarity": 9,
      "emotional_impact": 7,
      "total": 8
    }},
    "why": "One sentence explaining why this hook works"
  }}
]
Return only valid JSON array, no markdown."""

    raw = await _claude_strategy(prompt)
    try:
        hooks = _parse_json(raw)
    except json.JSONDecodeError:
        hooks = []

    # Sort by score descending
    hooks.sort(key=lambda h: h.get("score", {}).get("total", 0), reverse=True)
    return {"hooks": hooks, "topic": body.topic}


# ── 5. Content Improvement ─────────────────────────────────────────────────────
class ImproveRequest(BaseModel):
    job_id: str
    aspect: str = "overall"   # "hook" | "cta" | "structure" | "virality" | "overall"

@app.post("/api/content/improve")
async def improve_content(body: ImproveRequest):
    library = await _library_load()
    job = next((j for j in library if j.get("job_id") == body.job_id), None)
    if not job:
        raise HTTPException(404, "Job not found")

    script_path = OUTPUT / "jobs" / f"{body.job_id}_script.json"
    script_data: dict = {}
    if script_path.exists():
        script_data = json.loads(script_path.read_text())

    title    = job.get("title", "")
    platform = (job.get("platforms") or ["linkedin"])[0]

    prompt = f"""You are an expert content strategist. Analyze this content and provide specific improvements.

TITLE: {title}
PLATFORM: {platform}
CONTENT TYPE: {job.get("content_type") or job.get("contentType", "video")}
FOCUS: {body.aspect}
{f'SCRIPT EXCERPT: {str(script_data)[:1000]}' if script_data else ''}

Return JSON:
{{
  "score": {{
    "hook_strength": 7,
    "clarity": 8,
    "engagement_potential": 6,
    "platform_fit": 8,
    "cta_effectiveness": 5,
    "overall": 7
  }},
  "why_it_works": ["Point 1", "Point 2"],
  "improvements": [
    {{"area": "Hook", "issue": "...", "suggestion": "...", "rewrite": "..."}},
    {{"area": "Structure", "issue": "...", "suggestion": "...", "rewrite": "..."}}
  ],
  "improved_title": "Better title here",
  "improved_hook": "Stronger opening hook here",
  "improved_cta": "More compelling CTA here"
}}
Return only valid JSON."""

    raw = await _claude_strategy(prompt)
    try:
        analysis = _parse_json(raw)
    except json.JSONDecodeError:
        analysis = {}

    return {"job_id": body.job_id, "title": title, "analysis": analysis}


# ── 6. Viral Rewrite ───────────────────────────────────────────────────────────
class ViralRewriteRequest(BaseModel):
    job_id: str
    platform: str = "linkedin"

@app.post("/api/content/viral-rewrite")
async def viral_rewrite(body: ViralRewriteRequest):
    library = await _library_load()
    job = next((j for j in library if j.get("job_id") == body.job_id), None)
    if not job:
        raise HTTPException(404, "Job not found")

    platform_guides = {
        "linkedin":  "Professional authority voice. Short punchy sentences. Pattern interrupts. Strong data points. End with a question.",
        "tiktok":    "Fast, punchy, hook in first 2 seconds. Casual language. Relatable. Trend-aware. Use brackets [like this] for emphasis.",
        "instagram": "Emotional, visual language. Lifestyle focus. Aspirational. Emojis where appropriate. Story-driven.",
        "twitter":   "Controversial or surprising. Very concise. Thread-worthy. Quotable. Under 280 chars for hook.",
        "youtube":   "Curiosity gap in title. Promise transformation. Conversational but authoritative.",
    }
    guide = platform_guides.get(body.platform, platform_guides["linkedin"])

    prompt = f"""Transform this content to maximize virality on {body.platform}.

ORIGINAL TITLE: {job.get("title","")}
PLATFORM GUIDE: {guide}

Rewrite using:
- Storytelling arc: Hook → Problem → Story → Lesson → CTA
- Shorter, punchier sentences
- Stronger emotional language
- Pattern interrupts
- Social proof or data if applicable

Return JSON:
{{
  "viral_title": "...",
  "viral_hook": "...",
  "structure": [
    {{"stage": "Hook",    "content": "...", "duration_sec": 5}},
    {{"stage": "Problem", "content": "...", "duration_sec": 10}},
    {{"stage": "Story",   "content": "...", "duration_sec": 20}},
    {{"stage": "Lesson",  "content": "...", "duration_sec": 10}},
    {{"stage": "CTA",     "content": "...", "duration_sec": 5}}
  ],
  "caption": "Full {body.platform}-optimized caption with hashtags",
  "predicted_boost": "Estimated engagement improvement explanation"
}}
Return only valid JSON."""

    raw = await _claude_strategy(prompt)
    try:
        rewrite = _parse_json(raw)
    except json.JSONDecodeError:
        rewrite = {}

    return {"job_id": body.job_id, "platform": body.platform, "rewrite": rewrite}


# ── 7. A/B Test ────────────────────────────────────────────────────────────────
class ABTestRequest(BaseModel):
    job_id: str
    test_type: str = "hook"   # "hook" | "caption" | "title"

@app.post("/api/ab-test")
async def create_ab_test(body: ABTestRequest):
    library = await _library_load()
    job = next((j for j in library if j.get("job_id") == body.job_id), None)
    if not job:
        raise HTTPException(404, "Job not found")

    prompt = f"""Generate 2 distinct A/B test variants for this content.

TITLE: {job.get("title","")}
CONTENT TYPE: {job.get("content_type") or job.get("contentType","video")}
TEST TYPE: {body.test_type}

Return JSON:
{{
  "variant_a": {{
    "label": "Control",
    "{'hook' if body.test_type == 'hook' else 'caption' if body.test_type == 'caption' else 'title'}": "...",
    "strategy": "What makes this work",
    "target_emotion": "curiosity / authority / urgency / etc"
  }},
  "variant_b": {{
    "label": "Challenger",
    "{'hook' if body.test_type == 'hook' else 'caption' if body.test_type == 'caption' else 'title'}": "...",
    "strategy": "What makes this work differently",
    "target_emotion": "curiosity / authority / urgency / etc"
  }},
  "hypothesis": "We believe variant B will outperform A because...",
  "success_metric": "Click-through rate / Watch time / Comments"
}}
Return only valid JSON."""

    raw = await _claude_strategy(prompt)
    try:
        variants = _parse_json(raw)
    except json.JSONDecodeError:
        variants = {}

    test = {
        "id": str(uuid.uuid4()),
        "job_id": body.job_id,
        "title": job.get("title",""),
        "test_type": body.test_type,
        "variants": variants,
        "status": "running",
        "winner": None,
        "createdAt": _now(),
    }
    tests = await _ab_tests_load()
    tests.insert(0, test)
    await _ab_tests_save(tests[:100])
    return test

@app.get("/api/ab-test")
async def list_ab_tests():
    return await _ab_tests_load()

@app.patch("/api/ab-test/{test_id}/winner")
async def set_ab_winner(test_id: str, body: dict = Body(...)):
    tests = await _ab_tests_load()
    idx = next((i for i,t in enumerate(tests) if t["id"] == test_id), None)
    if idx is None:
        raise HTTPException(404, "Test not found")
    tests[idx]["winner"] = body.get("winner")  # "a" | "b"
    tests[idx]["status"] = "completed"
    await _ab_tests_save(tests)
    return tests[idx]


# ── 8. Top Performers ─────────────────────────────────────────────────────────
@app.get("/api/analytics/top-performers")
async def top_performers(brand: str = ""):
    library = await _library_load()
    items = [j for j in library if (not brand or j.get("brand") == brand) and j.get("status") == "Published"]

    # Sort by views/engagement if available, else by recency
    def _score(j: dict) -> float:
        v = j.get("views", 0) or 0
        e = j.get("engagement", 0) or 0
        return v + e * 10

    scored = sorted(items, key=_score, reverse=True)

    # Best formats
    fmt_scores: dict[str, list] = {}
    for j in items:
        ct = j.get("content_type") or j.get("contentType") or "video"
        fmt_scores.setdefault(ct, []).append(_score(j))
    best_formats = sorted(
        [{"format": k, "avg_score": round(sum(v)/len(v),1), "count": len(v)} for k,v in fmt_scores.items()],
        key=lambda x: x["avg_score"], reverse=True
    )

    # Best platforms
    plt_scores: dict[str, list] = {}
    for j in items:
        for p in (j.get("platforms") or []):
            plt_scores.setdefault(p, []).append(_score(j))
    best_platforms = sorted(
        [{"platform": k, "avg_score": round(sum(v)/len(v),1), "count": len(v)} for k,v in plt_scores.items()],
        key=lambda x: x["avg_score"], reverse=True
    )

    # Best topics (top words in titles)
    from collections import Counter
    stop = {"the","a","an","is","in","of","to","for","and","or","with","on","at","this","that","how","what","why","your","our"}
    words: list[str] = []
    for j in items:
        words += [w.lower() for w in (j.get("title","")).split() if w.lower() not in stop and len(w) > 3]
    top_topics = [{"topic": w, "count": c} for w, c in Counter(words).most_common(10)]

    return {
        "total_published": len(items),
        "top_posts": [{"job_id": j.get("job_id"), "title": j.get("title"), "score": _score(j), "content_type": j.get("content_type") or j.get("contentType"), "platforms": j.get("platforms",[])} for j in scored[:5]],
        "best_formats": best_formats[:5],
        "best_platforms": best_platforms[:5],
        "top_topics": top_topics,
    }


# ── 9. Asset Library ───────────────────────────────────────────────────────────
@app.get("/api/assets")
async def list_assets(brand: str = ""):
    assets = await _assets_load()
    if brand:
        assets = [a for a in assets if a.get("brand") == brand or not a.get("brand")]
    return assets

@app.post("/api/assets")
async def upload_asset(
    file: UploadFile = File(...),
    brand: str = Form(""),
    label: str = Form(""),
    asset_type: str = Form("logo"),   # logo | icon | visual | font
    
):
    ext  = Path(file.filename or "upload.png").suffix.lower() or ".png"
    aid  = str(uuid.uuid4())
    dest = ASSETS_DIR / f"{aid}{ext}"
    async with aiofiles.open(dest, "wb") as f:
        await f.write(await file.read())
    record = {
        "id": aid, "brand": brand, "label": label or file.filename,
        "asset_type": asset_type, "filename": dest.name,
        "url": f"/api/assets/{aid}/file",
        "createdAt": _now(),
    }
    assets = await _assets_load()
    assets.insert(0, record)
    await _assets_save(assets)
    return record

@app.get("/api/assets/{asset_id}/file")
async def get_asset_file(asset_id: str):
    assets = await _assets_load()
    asset = next((a for a in assets if a["id"] == asset_id), None)
    if not asset:
        raise HTTPException(404, "Asset not found")
    path = ASSETS_DIR / asset["filename"]
    if not path.exists():
        raise HTTPException(404, "File not found")
    from fastapi.responses import FileResponse
    return FileResponse(str(path))

@app.delete("/api/assets/{asset_id}", status_code=204)
async def delete_asset(asset_id: str):
    assets = await _assets_load()
    asset  = next((a for a in assets if a["id"] == asset_id), None)
    if asset:
        path = ASSETS_DIR / asset["filename"]
        if path.exists():
            path.unlink()
        await _assets_save([a for a in assets if a["id"] != asset_id])


# ══════════════════════════════════════════════════════════════════════════════
# ODOO PROPERTY MANAGEMENT — Sync + Teaser Generation
# ══════════════════════════════════════════════════════════════════════════════

_ODOO_URL  = os.getenv("ODOO_URL", "https://portal.rodschinson.com")
_ODOO_DB   = os.getenv("ODOO_DB", "swancharpp17")
_ODOO_USER = os.getenv("ODOO_USER", "mouline.ammar@rodschinson.com")
_ODOO_PASS = os.getenv("ODOO_API_KEY", "")  # API key doubles as password
_ODOO_MODEL = "property.details"

_ODOO_FIELDS = [
    "id", "name", "asset_code", "responsable", "type", "type_prop",
    "sale_price", "description", "all_secteur_prop", "all_brand_prop",
    "property_images_ids", "stage", "regle_nda", "create_date", "write_date",
]

# Cache for property.type id→name mapping
_property_type_cache: dict[int, str] = {}

# ── Asset-type mapping (Odoo type_prop → template ID) ─────────────────────────
ASSET_TYPE_MAP = {
    "hotel":      {"icon": "🏨", "label": "Hotel",            "template": "teaser_hotel"},
    "clinic":     {"icon": "🏥", "label": "Clinic / Medical", "template": "teaser_clinic"},
    "building":   {"icon": "🏢", "label": "Office Building",  "template": "teaser_building"},
    "office":     {"icon": "🏢", "label": "Office Building",  "template": "teaser_building"},
    "warehouse":  {"icon": "🏭", "label": "Warehouse",        "template": "teaser_warehouse"},
    "logistics":  {"icon": "🏭", "label": "Logistics",        "template": "teaser_warehouse"},
    "resort":     {"icon": "🏖️", "label": "Resort",            "template": "teaser_resort"},
    "pharmacy":   {"icon": "💊", "label": "Pharmacy",          "template": "teaser_pharmacy"},
    "gym":        {"icon": "🏋️", "label": "Gym / Fitness",     "template": "teaser_gym"},
    "fitness":    {"icon": "🏋️", "label": "Fitness",           "template": "teaser_gym"},
    "parking":    {"icon": "🅿️", "label": "Parking",           "template": "teaser_parking"},
    "student":    {"icon": "🎓", "label": "Student Housing",   "template": "teaser_student"},
    "senior":     {"icon": "🏡", "label": "Senior Housing",    "template": "teaser_senior"},
    "retail":     {"icon": "🛍️", "label": "Retail",            "template": "teaser_retail"},
    "residential":{"icon": "🏠", "label": "Residential",       "template": "teaser_residential"},
    "mixed":      {"icon": "🏢", "label": "Mixed-Use",         "template": "teaser_building"},
    "land":       {"icon": "🏗️", "label": "Land",              "template": "teaser_building"},
    "industrial": {"icon": "🏭", "label": "Industrial",        "template": "teaser_warehouse"},
}

TEASER_TEMPLATES = set(t["template"] for t in ASSET_TYPE_MAP.values())

VALUATION_METHODS: dict[str, list[str]] = {
    "hotel":       ["Income Capitalization", "Discounted Cash Flow (DCF)", "Price per Room", "RevPAR Analysis"],
    "clinic":      ["Income Capitalization", "Discounted Cash Flow (DCF)", "Replacement Cost"],
    "pharmacy":    ["Income Capitalization", "Discounted Cash Flow (DCF)", "Replacement Cost"],
    "building":    ["Income Capitalization", "Comparable Sales", "Cost Approach", "Price per m\u00b2"],
    "office":      ["Income Capitalization", "Comparable Sales", "Cost Approach", "Price per m\u00b2"],
    "warehouse":   ["Income Capitalization", "Price per m\u00b2", "Replacement Cost"],
    "logistics":   ["Income Capitalization", "Price per m\u00b2", "Replacement Cost"],
    "industrial":  ["Income Capitalization", "Price per m\u00b2", "Replacement Cost"],
    "retail":      ["Income Capitalization", "Sales Comparison", "Gross Rent Multiplier"],
    "residential": ["Comparable Sales", "Income Approach", "Cost Approach", "Price per Unit"],
    "student":     ["Comparable Sales", "Income Approach", "Cost Approach", "Price per Unit"],
    "senior":      ["Comparable Sales", "Income Approach", "Cost Approach", "Price per Unit"],
    "land":        ["Comparable Sales", "Residual Land Value", "Development Potential Analysis"],
    "resort":      ["Discounted Cash Flow (DCF)", "Income Capitalization", "Price per Room"],
    "parking":     ["Income Capitalization", "Price per Space"],
    "gym":         ["Income Capitalization", "Discounted Cash Flow (DCF)"],
    "fitness":     ["Income Capitalization", "Discounted Cash Flow (DCF)"],
    "mixed":       ["Income Capitalization", "Comparable Sales", "Weighted Multi-Method"],
}


async def _properties_load() -> list[dict]:
    if not PROPERTIES_FILE.exists(): return []
    try:
        async with aiofiles.open(PROPERTIES_FILE) as f:
            return json.loads(await f.read())
    except Exception as e:
        log.error("Failed to load properties.json: %s", e)
        return []


async def _properties_save(entries: list[dict]) -> None:
    async with aiofiles.open(PROPERTIES_FILE, "w") as f:
        await f.write(json.dumps(entries, indent=2, default=str))


def _map_odoo_property(raw: dict, type_names: dict[int, str] | None = None) -> dict:
    """Transform a raw Odoo property.details record to our platform format."""
    # stage is a selection field with values like 'sale', 'sold', 'draft', etc.
    stage_raw = raw.get("stage") or ""
    status_map = {"sale": "Sale", "sold": "Sold", "booked": "Reserved", "on_lease": "Leased",
                  "available": "Available", "draft": "Draft", "standby": "Standby"}
    status = status_map.get(stage_raw, stage_raw.capitalize() if stage_raw else "Sale")

    # type_prop is many2many → list of IDs. Resolve first ID to a name for template matching.
    type_ids = raw.get("type_prop") or []
    type_name_list = [type_names.get(tid, "") for tid in type_ids] if type_names else []
    # Pick the best type for template matching (first recognized keyword)
    asset_type_key = "building"  # default
    for tname in type_name_list:
        tlow = tname.lower()
        for key in ASSET_TYPE_MAP:
            if key in tlow:
                asset_type_key = key
                break
        else:
            continue
        break

    asset_info = ASSET_TYPE_MAP.get(asset_type_key, {"icon": "🏢", "label": "Property", "template": "teaser_building"})
    type_labels = ", ".join(type_name_list) if type_name_list else asset_info["label"]

    # Format price nicely
    price_raw = raw.get("sale_price") or 0
    if isinstance(price_raw, (int, float)) and price_raw > 0:
        if price_raw >= 1_000_000:
            price_str = f"€{price_raw/1_000_000:.1f}M"
        else:
            price_str = f"€{price_raw:,.0f}"
    else:
        price_str = str(price_raw) if price_raw else ""

    return {
        "odoo_id":     raw.get("id"),
        "title":       raw.get("name") or "",
        "reference":   raw.get("asset_code") or "",
        "asset_type":  asset_type_key,
        "asset_label": type_labels,
        "asset_icon":  asset_info["icon"],
        "template":    asset_info["template"],
        "price":       price_str,
        "price_raw":   price_raw,
        "description": raw.get("description") or "",
        "sectors":     raw.get("all_secteur_prop") or "",
        "brands":      raw.get("all_brand_prop") or "",
        "agent":       raw.get("responsable") or "",
        "property_type": raw.get("type") or "",
        "type_ids":    type_ids,
        "type_names":  type_name_list,
        "status":      status,
        "nda":         raw.get("regle_nda") or "",
        "image_ids":   raw.get("property_images_ids") or [],
        "created_at":  raw.get("create_date") or "",
        "updated_at":  raw.get("write_date") or "",
    }


async def _odoo_get_uid():
    """Authenticate with Odoo via XML-RPC (supports API keys). Returns uid."""
    import xmlrpc.client
    def _auth():
        common = xmlrpc.client.ServerProxy(f"{_ODOO_URL}/xmlrpc/2/common", allow_none=True)
        uid = common.authenticate(_ODOO_DB, _ODOO_USER, _ODOO_PASS, {})
        return uid
    try:
        uid = await asyncio.to_thread(_auth)
        if not uid:
            log.error("Odoo XML-RPC auth failed: no uid returned")
        return uid
    except Exception as e:
        log.error("Odoo XML-RPC auth error: %s", e)
        return None


async def _odoo_search_read(uid, model: str, domain: list, fields: list, limit: int = 200):
    """Fetch records via Odoo XML-RPC object endpoint."""
    import xmlrpc.client
    def _fetch():
        models = xmlrpc.client.ServerProxy(f"{_ODOO_URL}/xmlrpc/2/object", allow_none=True)
        return models.execute_kw(
            _ODOO_DB, uid, _ODOO_PASS,
            model, 'search_read',
            [domain],
            {'fields': fields, 'limit': limit},
        )
    return await asyncio.to_thread(_fetch)


@app.post("/api/odoo/sync-properties")
async def sync_properties_from_odoo():
    """Fetch properties from Odoo (stage = sale) and cache locally."""
    if not _ODOO_PASS:
        raise HTTPException(503, "Odoo credentials not configured (ODOO_API_KEY)")

    uid = await _odoo_get_uid()
    if not uid:
        raise HTTPException(502, "Failed to authenticate with Odoo — check ODOO_API_KEY")

    try:
        # Fetch properties in "sale" stage
        records = await _odoo_search_read(
            uid, _ODOO_MODEL,
            [["stage", "=", "sale"]],
            _ODOO_FIELDS, limit=200,
        )

        records = list(records)  # ensure list (XML-RPC returns _Marshallable)

        # Resolve property.type many2many IDs to names
        all_type_ids: set[int] = set()
        for r in records:
            all_type_ids.update(r.get("type_prop") or [])
        type_names: dict[int, str] = {}
        if all_type_ids:
            type_records = list(await _odoo_search_read(
                uid, "property.type",
                [["id", "in", list(all_type_ids)]],
                ["id", "name"], limit=500,
            ))
            type_names = {t["id"]: t["name"] for t in type_records}
            _property_type_cache.update(type_names)

    except Exception as e:
        log.error("Odoo fetch error: %s", e)
        raise HTTPException(502, f"Failed to fetch from Odoo: {e}")

    properties = [_map_odoo_property(r, type_names) for r in records]
    await _properties_save(properties)
    log.info("Synced %d properties from Odoo", len(properties))
    return {"synced": len(properties), "properties": properties}


@app.get("/api/properties")
async def list_properties():
    """Return cached properties list."""
    return await _properties_load()


@app.get("/api/properties/{odoo_id}")
async def get_property(odoo_id: int):
    """Return a single property by Odoo ID."""
    props = await _properties_load()
    prop = next((p for p in props if p.get("odoo_id") == odoo_id), None)
    if not prop:
        raise HTTPException(404, "Property not found")
    return prop


@app.get("/api/odoo/asset-types")
async def list_asset_types():
    """Return the asset type → template mapping."""
    return ASSET_TYPE_MAP
