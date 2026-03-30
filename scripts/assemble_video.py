#!/usr/bin/env python3
"""
=============================================================================
RODSCHINSON — Pipeline Vidéo — Étape D : Assemblage FFmpeg
=============================================================================

Assemble les scènes Manim + audio ElevenLabs + sous-titres Whisper
en une vidéo finale prête pour YouTube et LinkedIn.

USAGE :
    python scripts/assemble_video.py \
        --script output/scripts/script_rod_cap_rate.json

    # Forcer sans sous-titres
    python scripts/assemble_video.py --script ... --no-subtitles

RÉSULTAT :
    output/video/cap_rate_youtube_16x9.mp4   ← YouTube / LinkedIn
    output/video/cap_rate_reel_9x16.mp4      ← Reel Instagram (si applicable)
=============================================================================
"""

import os
import json
import argparse
import subprocess
import tempfile
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

OUTPUT_SCENES    = ROOT / "output" / "scenes"
OUTPUT_AUDIO     = ROOT / "output" / "audio"
OUTPUT_SUBTITLES = ROOT / "output" / "subtitles"
OUTPUT_VIDEO     = ROOT / "output" / "video"
OUTPUT_VIDEO.mkdir(parents=True, exist_ok=True)

LOGO_PATH        = ROOT / os.getenv("LOGO_PATH", "assets/logo_rodschinson.png")
VIDEO_BITRATE    = os.getenv("VIDEO_BITRATE", "8000k")
AUDIO_BITRATE    = os.getenv("AUDIO_BITRATE", "192k")
FPS              = int(os.getenv("VIDEO_FPS", "30"))


def run_ffmpeg(cmd: list, label: str = "") -> bool:
    """Exécute une commande FFmpeg et affiche les erreurs si échec."""
    if label:
        print(f"  ⚙️  {label}...", end=" ", flush=True)

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode == 0:
        if label:
            print("✅")
        return True
    else:
        if label:
            print("❌")
        # Afficher seulement les lignes d'erreur pertinentes
        for line in result.stderr.split("\n"):
            if any(w in line for w in ["Error", "error", "Invalid", "No such"]):
                print(f"     {line}")
        return False


# ─── ÉTAPE 1 : CONCAT DES SCÈNES ─────────────────────────────────────────────

def concat_scenes(scene_files: list, output: Path, width: int = 1920, height: int = 1080) -> bool:
    if not scene_files:
        print("  ❌ Aucune scène MP4 trouvée")
        return False
    n = len(scene_files)
    inputs = []
    for sf in scene_files:
        inputs += ["-i", str(sf)]
    scale = "".join(
        f"[{i}:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height}[v{i}];"
        for i in range(n)
    )
    concat = "".join(f"[v{i}]" for i in range(n))
    concat += f"concat=n={n}:v=1[outv]"
    filter_str = scale + concat
    cmd = ["ffmpeg", "-y", *inputs,
           "-filter_complex", filter_str,
           "-map", "[outv]", str(output)]
    return run_ffmpeg(cmd, f"Concat {n} scènes")


# ─── ÉTAPE 2 : MERGE AUDIO ────────────────────────────────────────────────────

def merge_audio(video_path: Path, audio_path: Path, output: Path) -> bool:
    """Fusionne la vidéo avec la narration audio."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(audio_path),
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", AUDIO_BITRATE,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        str(output),
    ]
    return run_ffmpeg(cmd, "Merge audio")


# ─── ÉTAPE 3 : WATERMARK LOGO ─────────────────────────────────────────────────

def add_watermark(video_path: Path, output: Path) -> bool:
    """Ajoute le logo Rodschinson en watermark (bas droite)."""
    if not LOGO_PATH.exists():
        print(f"  ⚠️  Logo introuvable : {LOGO_PATH} — watermark ignoré")
        # Copier sans watermark
        import shutil
        shutil.copy2(str(video_path), str(output))
        return True

    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(LOGO_PATH),
        "-filter_complex",
        # Logo en bas à droite, 30px des bords, opacité 70%
        "[1:v]scale=160:-1,format=rgba,colorchannelmixer=aa=0.7[logo];"
        "[0:v][logo]overlay=W-w-30:H-h-30",
        "-c:a", "copy",
        "-b:v", VIDEO_BITRATE,
        str(output),
    ]
    return run_ffmpeg(cmd, "Ajout watermark logo")


# ─── ÉTAPE 4 : SOUS-TITRES ────────────────────────────────────────────────────

def burn_subtitles(video_path: Path, srt_path: Path, output: Path) -> bool:
    """Intègre les sous-titres SRT dans la vidéo (burn-in)."""
    if not srt_path or not srt_path.exists():
        print("  ⚠️  SRT introuvable — sous-titres ignorés")
        import shutil
        shutil.copy2(str(video_path), str(output))
        return True

    # Style sous-titres : Space Grotesk blanc, ombre, bas de l'écran
    subtitle_style = (
        "FontName=Space Grotesk,"
        "FontSize=28,"
        "PrimaryColour=&H00FFFFFF,"    # Blanc
        "OutlineColour=&H00000000,"    # Noir
        "BackColour=&H80000000,"       # Fond semi-transparent
        "Bold=1,"
        "Outline=2,"
        "Shadow=1,"
        "MarginV=50,"                  # 50px du bas
        "Alignment=2"                  # Centré bas
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vf", f"subtitles={srt_path}:force_style='{subtitle_style}'",
        "-c:a", "copy",
        "-b:v", VIDEO_BITRATE,
        str(output),
    ]
    return run_ffmpeg(cmd, "Burn sous-titres")


# ─── ÉTAPE 5 : EXPORT REEL 9:16 ──────────────────────────────────────────────

def export_reel(video_16x9: Path, output: Path) -> bool:
    """
    Crée une version 9:16 pour Reels / Stories.
    Crop et zoom central depuis le 16:9.
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_16x9),
        "-vf",
        # Crop 9:16 depuis le centre du 16:9
        "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,"
        "scale=1080:1920",
        "-c:a", "copy",
        "-b:v", VIDEO_BITRATE,
        str(output),
    ]
    return run_ffmpeg(cmd, "Export Reel 9:16")


# ─── PIPELINE COMPLET ────────────────────────────────────────────────────────

MUSIC_DIR = ROOT / "assets" / "music"


def pick_music_track(genre: str = "corporate") -> Path | None:
    """Return path to a cached music track matching the genre."""
    manifest_path = MUSIC_DIR / "tracks.json"
    if manifest_path.exists():
        import json as _json
        tracks = _json.loads(manifest_path.read_text())
        # prefer matching genre
        for t in sorted(tracks, key=lambda x: x.get("genre") == genre, reverse=True):
            p = Path(t.get("local", ""))
            if p.exists():
                return p
    # fallback: any mp3 in music dir
    mp3s = sorted(MUSIC_DIR.glob("*.mp3"))
    return mp3s[0] if mp3s else None


def assemble(script_path: str, with_subtitles: bool = False,
             music_only: bool = False, music_genre: str = "corporate") -> dict:
    """Pipeline d'assemblage complet."""

    with open(script_path, encoding="utf-8") as f:
        script = json.load(f)

    meta   = script["meta"]
    scenes = script["scenes"]
    slug   = meta.get("id", "video").replace(" ", "_")
    fmt    = meta.get("format", "youtube")
    width  = meta.get("largeur", meta.get("width",  1920))
    height = meta.get("hauteur", meta.get("height", 1080))

    print(f"\n{'═'*55}")
    print(f"  🎬  ASSEMBLAGE — {meta.get('titre','')[:45]}")
    print(f"  Slug : {slug}  |  Format : {fmt}")
    print(f"{'═'*55}\n")

    tmp_dir = Path(tempfile.mkdtemp(prefix="rod_assemble_"))
    results = {}

    try:
        # ── Trouver les scènes MP4 dans l'ordre ──────────────────────────
        scene_files = []
        for s in sorted(scenes, key=lambda x: x["id"]):
            sid = s["id"]
            nom = s.get("nom", f"scene_{sid}")
            pattern = f"scene_{sid:02d}_{nom}"
            matches = list(OUTPUT_SCENES.glob(f"{pattern}*.mp4"))
            if matches:
                scene_files.append(sorted(matches)[-1])  # plus récent
            else:
                print(f"  ⚠️  Scène {sid} ({nom}) MP4 introuvable — ignorée")

        if not scene_files:
            print("  ❌ Aucune scène MP4 trouvée dans output/scenes/")
            print("  Lancez d'abord : python scripts/render_manim.py --script ...")
            return {}

        print(f"  {len(scene_files)}/{len(scenes)} scènes trouvées\n")

        # ── Étape 1 : Concat scènes ────────────────────────────────────
        concat_out = tmp_dir / "concat.mp4"
        if not concat_scenes(scene_files, concat_out, width=width, height=height):
            return {}

        # ── Étape 2 : Chercher l'audio ──────────────────────────────────
        if music_only:
            audio_file = pick_music_track(music_genre)
            if audio_file:
                print(f"  🎵  Music track : {audio_file.name}")
            else:
                print(f"  ⚠️  No music track found — run download_music.py first")
        else:
            audio_file = OUTPUT_AUDIO / f"narration_{slug}_full.mp3"
            if not audio_file.exists():
                alts = list(OUTPUT_AUDIO.glob(f"*{slug}*.mp3"))
                if alts:
                    audio_file = sorted(alts)[-1]
                    print(f"  ℹ️  Audio alternatif trouvé : {audio_file.name}")
                else:
                    print(f"  ⚠️  Audio introuvable — vidéo sans son")
                    audio_file = None

        # ── Étape 3 : Merge audio ──────────────────────────────────────
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        out_16x9 = OUTPUT_VIDEO / f"{slug}_youtube_{ts}.mp4"

        import subprocess as sp
        if audio_file and audio_file.exists():
            # For music-only: loop music to match video duration, set volume low
            if music_only:
                cmd = ["ffmpeg", "-y",
                       "-i", str(concat_out),
                       "-stream_loop", "-1", "-i", str(audio_file),
                       "-c:v", "copy", "-c:a", "aac", "-b:a", AUDIO_BITRATE,
                       "-filter:a", "volume=0.3",
                       "-map", "0:v:0", "-map", "1:a:0",
                       "-shortest", str(out_16x9)]
            else:
                cmd = ["ffmpeg", "-y",
                       "-i", str(concat_out),
                       "-i", str(audio_file),
                       "-c:v", "copy", "-c:a", "aac", "-shortest",
                       str(out_16x9)]
            r = sp.run(cmd, capture_output=True, text=True)
            if r.returncode != 0:
                print(f"  ❌ Merge audio failed: {r.stderr[-200:]}")
                import shutil
                shutil.copy2(str(concat_out), str(out_16x9))
            else:
                sz = out_16x9.stat().st_size // (1024*1024)
                print(f"  ✅ Merge audio OK — {sz} MB")
        else:
            import shutil
            shutil.copy2(str(concat_out), str(out_16x9))
        results["youtube"] = out_16x9
        size_mb = out_16x9.stat().st_size // (1024 * 1024)
        print(f"\n  ✅ YouTube 16:9 → {out_16x9.name}  ({size_mb} MB)")

        # ── Export Reel 9:16 (si format reel ou linkedin) ─────────────
        if fmt in ["reel", "linkedin"] or meta.get("ratio") == "9:16":
            out_reel = OUTPUT_VIDEO / f"{slug}_reel_{ts}.mp4"
            if export_reel(out_16x9, out_reel):
                results["reel"] = out_reel
                size_mb_r = out_reel.stat().st_size // (1024 * 1024)
                print(f"  ✅ Reel 9:16  → {out_reel.name}  ({size_mb_r} MB)")

    finally:
        import shutil as _s
        _s.rmtree(tmp_dir, ignore_errors=True)

    print(f"\n{'─'*55}")
    print(f"  📁 Vidéos dans : {OUTPUT_VIDEO}")
    print(f"\n  Prochaine étape :")
    print(f"  python scripts/upload_video.py --script {script_path}")

    return results


# ─── MAIN ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Rodschinson — Assemblage FFmpeg")
    parser.add_argument("--script",        help="Chemin JSON script")
    parser.add_argument("--no-subtitles",  action="store_true")
    parser.add_argument("--music-only",    action="store_true", help="Use background music instead of voiceover")
    parser.add_argument("--music-genre",   default="corporate", help="Music genre: corporate|cinematic|lofi|upbeat")
    args = parser.parse_args()

    if args.script:
        assemble(args.script,
                 with_subtitles=not args.no_subtitles,
                 music_only=args.music_only,
                 music_genre=args.music_genre)
    else:
        parser.print_help()
        print("\n  Exemple :")
        print("  python scripts/assemble_video.py --script output/scripts/script_rod_cap_rate.json")


if __name__ == "__main__":
    main()
