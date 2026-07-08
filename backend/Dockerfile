# ── Stage 1: Python deps ───────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim

# Step 1: base tools
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl gnupg ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Step 2: Node.js 20 (separate layer so it's cached independently)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Step 3: FFmpeg (heavy — own layer)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Step 4: Chromium + base fonts (own layer — KEEP this RUN identical across builds
# so the Chromium version stays pinned to the cached layer; changing it re-pulls a
# possibly-broken newer Chromium).
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Step 4b: Emoji font in its OWN layer so it never busts the Chromium layer cache.
# Noto Color Emoji renders the 📍/↗ icons used in the teaser (map/docs buttons).
RUN apt-get update && apt-get install -y --no-install-recommends \
        fonts-noto-color-emoji \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Puppeteer downloads and uses its OWN version-matched Chrome (deterministic).
# The Debian system chromium is kept only for its shared libraries + fonts — its
# version updates unpredictably and a newer one crashed on launch.
ENV PUPPETEER_CACHE_DIR=/root/.cache/puppeteer \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Copy Python packages from builder
COPY --from=builder /install /usr/local

WORKDIR /app

# Copy backend + supporting dirs from repo root
COPY backend/ .
COPY puppeteer/ ./puppeteer/
COPY scripts/ ./scripts/

# Install Node deps for Puppeteer renderer
RUN if [ -f puppeteer/package.json ]; then \
        cd puppeteer && npm ci --omit=dev && npx puppeteer browsers install chrome; \
    fi

# Output directories (persisted via Railway volume)
RUN mkdir -p output/jobs output/scripts output/audio output/video \
             output/scenes output/subtitles output/images output/text output/carousel

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
