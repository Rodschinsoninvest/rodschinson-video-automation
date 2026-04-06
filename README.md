# Rodschinson Content Studio

A full-stack marketing automation platform for generating, managing, and publishing branded video and social media content across multiple platforms — powered by AI.

---

## Overview

Content Studio automates the entire content lifecycle: from a one-line brief to a published video on LinkedIn, Instagram, TikTok, and beyond. It handles script generation, voiceover synthesis, scene rendering, approval workflows, scheduling, and Metricool publishing — all from a single interface.

---

## Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS — deployed on Netlify |
| **Backend** | FastAPI (Python 3.11) — deployed on Railway |
| **Video rendering** | Puppeteer (Chromium) + HTML/CSS/JS templates |
| **Voiceover** | ElevenLabs TTS API |
| **Video assembly** | FFmpeg (scene stitching, transitions, captions) |
| **AI / Script** | Anthropic Claude API (Opus for scripts, Haiku for captions) |
| **Publishing** | Metricool API (9 platforms) |
| **Auth** | JWT Bearer tokens, role-based access |

---

## Features

### 1 · Content Creation
Create any content type from a brief. Supports video (16:9, 9:16, 1:1), carousels, image posts, stories, and reels. Choose language (EN / FR / NL), style, template, and target platforms. The AI generates a full scene-by-scene script, ElevenLabs renders the voiceover, Puppeteer captures each scene as frames, and FFmpeg assembles the final video with transitions and burned-in captions.

### 2 · Library & Approval Workflow
All generated content lives in the Library with a structured status flow:

```
Draft → Ready → Approved → Scheduled → Published
```

Team members can leave comments per job. Role-based access controls who can move content through each stage:

| Role | Permissions |
|---|---|
| `creator` | Create content, view library |
| `reviewer` | Add comments, approve/reject |
| `publisher` | Schedule and publish to Metricool |
| `admin` | Full access including user management |

### 3 · Schedule
Weekly calendar view (or list view) showing all scheduled posts across platforms. Click any empty slot to schedule content from the library. Content gap detection (`GET /api/schedule/gaps`) automatically warns about days with missing platform coverage or brand frequency below minimum threshold.

### 4 · Publishing via Metricool
One-click publish to all 9 supported platforms:

`LinkedIn` · `Instagram` · `Facebook` · `TikTok` · `YouTube` · `Twitter` · `Bluesky` · `Pinterest` · `Google Business`

Platform-specific AI captions are generated via Claude Haiku before publishing, tailored to each network's tone and character limits.

### 5 · Brands
Multi-brand workspace. Each brand stores:
- **Colors**: Primary, Accent, Text, Background
- **Typography**: Heading font, body font, sizes (heading / body / caption), weights
- **Identity**: Logo, tagline, initials, website
- **AI context**: Freeform text injected into every generation prompt for that brand

Brand colors and fonts are injected as CSS variables at render time by Puppeteer, so every generated visual automatically matches brand guidelines.

### 6 · Templates
Four built-in Puppeteer HTML templates plus a custom template registry:

| Template | Format | Style |
|---|---|---|
| `rodschinson_premium` | 16:9 | Dark navy, geometric SVG frames, premium investment |
| `tech_data` | 16:9 | Terminal / data dashboard, CRE market data |
| `news_reel` | 9:16 | Breaking news lower-thirds, editorial |
| `corporate_minimal` | 1:1 | Clean minimal, corporate white-label |

Custom templates can be added to `puppeteer/templates/custom/` and registered in `template_registry.json`.

### 7 · Analytics
Platform performance aggregation: views, engagement, leads by brand, platform, and content type. Weekly reports can be emailed automatically.

### 8 · Automation
- **Repurpose**: One click turns any video into all missing formats (carousel, reel, image post)
- **Recurring series**: Define a content series with weekly/biweekly/monthly cadence — the system auto-generates and queues new jobs
- **Notifications**: Slack webhook + SMTP email on status changes and new comments

---

## Project Structure

```
video_automation/
├── backend/
│   └── main.py              FastAPI app — all API endpoints
├── frontend/
│   └── src/
│       ├── pages/           React pages (NewContent, Library, Schedule, …)
│       ├── components/      Layout, Sidebar, TopBar
│       └── contexts/        Auth, Theme, Brand, Generation, Toast
├── puppeteer/
│   ├── renderer.js          Scene capture engine (Puppeteer)
│   ├── carousel_renderer.js Carousel slide renderer
│   └── templates/           HTML scene templates
├── scripts/
│   ├── generate_video_script.py   Claude script generation
│   ├── assemble_video.py          FFmpeg assembly
│   └── download_music.py          Background music
└── output/                  Generated videos, library.json, schedule.json, brands.json
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS |
| `METRICOOL_USER_TOKEN` | Metricool API token |
| `METRICOOL_BLOG_TOKEN` | Metricool blog ID |
| `APP_USERNAME` / `APP_PASSWORD` | Legacy single-user auth fallback |
| `JWT_SECRET` | Token signing secret |
| `SLACK_WEBHOOK_URL` | Slack notifications (optional) |
| `NOTIFY_EMAIL` | Email notifications recipient (optional) |
| `SMTP_*` | SMTP config for email sending (optional) |

---

## Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

The frontend proxies `/api/*` to `http://localhost:8000` via Vite config.

---

## Deployment

- **Backend** — Railway (`railway.json` included). Set all env vars in Railway dashboard.
- **Frontend** — Netlify. Set `VITE_API_BASE_URL` to the Railway backend URL.

---

*Rodschinson Investment · Brussels · Dubai · Casablanca*
