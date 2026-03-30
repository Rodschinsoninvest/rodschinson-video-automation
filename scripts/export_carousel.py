#!/usr/bin/env python3
"""
Rodschinson Content Studio — Carousel Export
Takes a script JSON and exports slide content as individual JSON files
ready for display/PDF generation.

Usage:
  python export_carousel.py --script <path> [--output-dir <dir>]
"""
import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")


def generate_slides(script_data: dict, language: str = "EN") -> list:
    """Generate structured carousel slide content from script JSON."""
    meta   = script_data.get("meta", {})
    scenes = script_data.get("scenes", [])
    title  = meta.get("titre", "Carousel")
    brand  = meta.get("brand", "Rodschinson Investment")
    hashtags = meta.get("hashtags_linkedin", [])

    slides = []

    # Slide 1: Title/Hook
    slides.append({
        "index": 1,
        "type": "title",
        "headline": title,
        "subheadline": meta.get("description", "")[:120],
        "brand": brand,
        "cta": "Swipe →",
    })

    # Content slides from scenes (up to 7)
    for i, scene in enumerate(scenes[:7], start=2):
        narration = scene.get("narration", "")
        visuel    = scene.get("visuel", {})
        slides.append({
            "index": i,
            "type": "content",
            "headline": visuel.get("titre_principal", scene.get("nom", f"Point {i-1}")),
            "body": narration[:300] if narration else visuel.get("sous_titre", ""),
            "stat": visuel.get("titre_principal", "") if scene.get("type_visuel") == "big_number" else "",
            "source": next((e for e in visuel.get("elements", []) if "Source" in str(e)), ""),
        })

    # Last slide: CTA
    slides.append({
        "index": len(slides) + 1,
        "type": "cta",
        "headline": "Interested?",
        "body": "Follow for more insights on real estate & investment.",
        "brand": brand,
        "hashtags": hashtags[:3],
    })

    return slides


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--script",     required=True)
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--language",   default="EN")
    args = parser.parse_args()

    script_path = Path(args.script)
    if not script_path.exists():
        print(f"ERROR: Script not found: {script_path}", file=sys.stderr)
        sys.exit(1)

    script_data = json.loads(script_path.read_text(encoding="utf-8"))
    job_slug    = script_path.stem[:8]

    out_dir = Path(args.output_dir) if args.output_dir else (
        script_path.parent.parent / "carousel"
    )
    out_dir.mkdir(parents=True, exist_ok=True)

    slides = generate_slides(script_data, args.language)

    # Save combined slides JSON
    out_file = out_dir / f"{job_slug}_slides.json"
    out_file.write_text(json.dumps(slides, ensure_ascii=False, indent=2), encoding="utf-8")

    # Save individual slide files
    for slide in slides:
        slide_file = out_dir / f"{job_slug}_slide_{slide['index']:02d}.json"
        slide_file.write_text(json.dumps(slide, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"✅ {len(slides)} slides exported → {out_dir}")


if __name__ == "__main__":
    main()
