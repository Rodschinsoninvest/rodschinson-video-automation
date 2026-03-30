#!/usr/bin/env python3
"""
Rodschinson Content Studio — Text Post Generator
Generates a full social media text post from a script JSON outline.

Usage:
  python generate_text_post.py --script <path> --style <style> --output <path> [--polish] [--language EN]
"""
import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

STYLE_PROMPTS = {
    "viral_hook":   "Start with a bold controversial hook. Use short punchy lines. Build curiosity.",
    "educational":  "Teach one clear concept. Use numbered lists or bullet points. Add real data.",
    "data_story":   "Lead with a surprising statistic. Tell the story behind the numbers.",
    "personal":     "Write in first person. Share a personal lesson or experience. Be authentic.",
    "provocateur":  "Challenge a common belief. Take a contrarian stance. Invite debate.",
    "thread":       "Format as a numbered thread (1/ 2/ 3/...). Each point standalone. Max 10 points.",
}


def build_prompt(script_data: dict, style: str, language: str, polish: bool) -> str:
    meta   = script_data.get("meta", {})
    scenes = script_data.get("scenes", [])
    title  = meta.get("titre", "")
    desc   = meta.get("description", "")
    brand  = meta.get("brand", "Rodschinson Investment")
    hashtags = " ".join(meta.get("hashtags_linkedin", []))

    narrations = "\n".join(
        f"- {s.get('narration', s.get('nom', ''))}"
        for s in scenes[:6]
    )

    style_instruction = STYLE_PROMPTS.get(style, STYLE_PROMPTS["educational"])

    lang_map = {"EN": "English", "FR": "French", "NL": "Dutch"}
    lang_name = lang_map.get(language.upper(), "English")

    if polish:
        action = "Polish and refine the following text post. Improve flow, strengthen the hook, tighten the CTA. Keep the same language and tone. Return only the polished post text."
        content_ref = "(the post was already drafted — polish it)"
    else:
        action = f"Write a complete {lang_name} LinkedIn post."

    return f"""{action}

BRAND: {brand}
TOPIC: {title}
DESCRIPTION: {desc}
KEY POINTS:
{narrations}

STYLE INSTRUCTIONS: {style_instruction}

LANGUAGE: Write exclusively in {lang_name}.

FORMATTING RULES:
- 150–400 words
- Line breaks between paragraphs (LinkedIn-style spacing)
- 3–5 relevant emojis placed naturally
- End with a clear call-to-action
- 3–5 hashtags at the end: {hashtags if hashtags else '#RealEstate #Investment #Rodschinson'}
- No markdown headers or bold syntax

Return ONLY the post text, nothing else."""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--script",   required=True, help="Path to script JSON")
    parser.add_argument("--style",    default="educational")
    parser.add_argument("--output",   required=True, help="Output .txt path")
    parser.add_argument("--polish",   action="store_true")
    parser.add_argument("--language", default="EN")
    args = parser.parse_args()

    if not ANTHROPIC_API_KEY:
        print("ERROR: ANTHROPIC_API_KEY not set in .env", file=sys.stderr)
        sys.exit(1)

    script_path = Path(args.script)
    if not script_path.exists():
        print(f"ERROR: Script file not found: {script_path}", file=sys.stderr)
        sys.exit(1)

    script_data = json.loads(script_path.read_text(encoding="utf-8"))
    prompt = build_prompt(script_data, args.style, args.language, args.polish)

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
        text = message.content[0].text.strip()
    except ImportError:
        # Fallback: use httpx directly
        import httpx
        res = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01"},
            json={"model": "claude-sonnet-4-6", "max_tokens": 1500,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=60,
        )
        if res.status_code != 200:
            print(f"ERROR: Claude API {res.status_code}: {res.text[:200]}", file=sys.stderr)
            sys.exit(1)
        text = res.json()["content"][0]["text"].strip()

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(f"✅ Text post saved → {out}")


if __name__ == "__main__":
    main()
