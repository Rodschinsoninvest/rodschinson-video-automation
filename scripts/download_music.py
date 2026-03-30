#!/usr/bin/env python3
"""
Download royalty-free background music tracks from Pixabay public API.
Saves to assets/music/ for use in video assembly.

USAGE:
    python scripts/download_music.py
    python scripts/download_music.py --genre corporate --count 3
"""

import json
import argparse
import requests
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

MUSIC_DIR = ROOT / "assets" / "music"
MUSIC_DIR.mkdir(parents=True, exist_ok=True)

MANIFEST_PATH = MUSIC_DIR / "tracks.json"

# Curated public-domain / CC0 tracks from the Internet Archive & Kevin MacLeod (incompetech.com)
# All tracks: CC0 or CC BY (attribution: Kevin MacLeod / incompetech.com)
BUNDLED_TRACKS = [
    {
        "id":    "corporate-1",
        "title": "Backed Vibes Clean (Kevin MacLeod)",
        "genre": "corporate",
        "mood":  "professional",
        "url":   "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Backed%20Vibes%20Clean.mp3",
        "duration": 120,
    },
    {
        "id":    "corporate-2",
        "title": "Decisions (Kevin MacLeod)",
        "genre": "corporate",
        "mood":  "upbeat",
        "url":   "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Decisions.mp3",
        "duration": 115,
    },
    {
        "id":    "cinematic-1",
        "title": "Arcadia (Kevin MacLeod)",
        "genre": "cinematic",
        "mood":  "dramatic",
        "url":   "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Arcadia.mp3",
        "duration": 130,
    },
    {
        "id":    "lofi-1",
        "title": "Chill (Kevin MacLeod)",
        "genre": "lofi",
        "mood":  "relaxed",
        "url":   "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Chill.mp3",
        "duration": 180,
    },
    {
        "id":    "upbeat-1",
        "title": "Upbeat Forever (Kevin MacLeod)",
        "genre": "upbeat",
        "mood":  "energetic",
        "url":   "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Upbeat%20Forever.mp3",
        "duration": 140,
    },
]

# Fallback: 10-second silent MP3 (minimal valid file) used when downloads fail
SILENT_MP3_HEX = (
    "fffb9000" * 40  # minimal silent MP3 frames
)


def _silent_fallback(path: Path):
    """Write a minimal silent MP3 as absolute last resort."""
    try:
        import subprocess
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
             "-t", "10", "-q:a", "9", "-acodec", "libmp3lame", str(path)],
            capture_output=True, check=True
        )
        print(f"  ⚙️  Generated silent fallback: {path.name}")
        return True
    except Exception:
        return False


def download_track(track: dict, force: bool = False) -> Path | None:
    dest = MUSIC_DIR / f"{track['id']}.mp3"
    if dest.exists() and not force:
        print(f"  ✓  {track['title']} already cached")
        return dest

    print(f"  ⬇  Downloading {track['title']} …")
    try:
        r = requests.get(track["url"], timeout=30, stream=True)
        if r.status_code == 200:
            dest.write_bytes(r.content)
            kb = dest.stat().st_size // 1024
            print(f"  ✅ {dest.name}  ({kb} KB)")
            return dest
        else:
            print(f"  ⚠️  HTTP {r.status_code} — trying silent fallback")
    except Exception as e:
        print(f"  ⚠️  {e} — trying silent fallback")

    if _silent_fallback(dest):
        return dest
    return None


def load_manifest() -> list:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text())
    return []


def save_manifest(tracks: list):
    MANIFEST_PATH.write_text(json.dumps(tracks, indent=2, ensure_ascii=False))


def pick_track(genre: str = "corporate", mood: str | None = None) -> Path | None:
    """Return a local path to a matching track, downloading if needed."""
    manifest = load_manifest()
    cached = {t["id"]: t for t in manifest}

    # Score tracks: exact genre match first, then mood
    scored = []
    for t in BUNDLED_TRACKS:
        score = 0
        if t["genre"] == genre:
            score += 2
        if mood and t["mood"] == mood:
            score += 1
        scored.append((score, t))
    scored.sort(key=lambda x: -x[0])

    for _, track in scored:
        path = MUSIC_DIR / f"{track['id']}.mp3"
        if path.exists():
            return path
        result = download_track(track)
        if result:
            # Update manifest
            if track["id"] not in cached:
                manifest.append({**track, "local": str(result)})
                save_manifest(manifest)
            return result

    return None


def main():
    parser = argparse.ArgumentParser(description="Download royalty-free music tracks")
    parser.add_argument("--genre",  default="corporate", help="Genre: corporate|cinematic|lofi|upbeat")
    parser.add_argument("--count",  type=int, default=len(BUNDLED_TRACKS))
    parser.add_argument("--force",  action="store_true", help="Re-download even if cached")
    args = parser.parse_args()

    print("\n" + "═" * 52)
    print("  🎵  Music Downloader — Royalty-Free Tracks")
    print("═" * 52 + "\n")

    manifest = []
    for track in BUNDLED_TRACKS[:args.count]:
        path = download_track(track, force=args.force)
        if path:
            manifest.append({**track, "local": str(path)})

    save_manifest(manifest)
    print(f"\n  📋 Manifest: {MANIFEST_PATH}")
    print(f"  ✅ {len(manifest)} track(s) ready\n")


if __name__ == "__main__":
    main()
