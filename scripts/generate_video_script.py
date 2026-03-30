#!/usr/bin/env python3
"""
=============================================================================
RODSCHINSON INVESTMENT & RACHID CHIKHI
Pipeline Vidéo — Étape A : Génération de Script (Claude API)
=============================================================================

Génère un script vidéo structuré JSON à partir d'un brief.
Le JSON produit est directement consommé par Manim (Étape B).

USAGE :
    # Interactif — saisir le brief dans le terminal
    python generate_video_script.py --brand rodschinson

    # Depuis Google Sheet (brief déjà renseigné)
    python generate_video_script.py --brand rachid --sheet-row 5

    # Avec brief en ligne de commande
    python generate_video_script.py \
        --brand rodschinson \
        --sujet "Le Cap Rate expliqué en 5 minutes" \
        --format youtube \
        --duree 8

    # Tester sans API (script fictif pour valider Manim)
    python generate_video_script.py --demo

PRÉREQUIS :
    pip install anthropic gspread google-auth python-dotenv
=============================================================================
"""

import os
import sys
import json
import argparse
import datetime
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OUTPUT_DIR = Path(__file__).parent.parent / "output" / "scripts"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

# ─── SUJETS PRÉDÉFINIS ───────────────────────────────────────────────────────
# Catalogue de sujets récurrents — peut être étendu dans Google Sheet

VIDEO_CATALOG = {
    "rodschinson": [
        {
            "id":     "cap_rate_explique",
            "titre":  "Le Cap Rate expliqué en 5 minutes",
            "sujet":  "Qu'est-ce que le Cap Rate et pourquoi c'est le KPI numéro 1 de l'immo commercial",
            "angle":  "Pédagogique — accessible aux investisseurs HNWI non-experts",
            "cible":  "Investisseurs HNWI et family offices",
            "format": "youtube",
            "duree":  8,
        },
        {
            "id":     "ma_5_etapes",
            "titre":  "5 étapes pour réussir un M&A en 2025",
            "sujet":  "Le processus M&A décortiqué étape par étape avec les pièges à éviter",
            "angle":  "Pratico-pratique, cas réels anonymisés",
            "cible":  "CEOs en réflexion de cession / acquisition",
            "format": "youtube",
            "duree":  10,
        },
        {
            "id":     "marche_dubai_2025",
            "titre":  "Pourquoi Dubai reste le marché CRE le plus attractif en 2025",
            "sujet":  "Analyse marché Dubai — chiffres, tendances, opportunités pour investisseurs européens",
            "angle":  "Data-driven, comparatif Dubai vs Paris vs Casablanca",
            "cible":  "Investisseurs HNWI et fonds PE",
            "format": "youtube",
            "duree":  9,
        },
        {
            "id":     "due_diligence_checklist",
            "titre":  "Due Diligence CRE : les 10 points que personne ne vérifie",
            "sujet":  "Checklist due diligence immobilier commercial — erreurs fréquentes",
            "angle":  "Conseil expert, storytelling d'un deal raté évité",
            "cible":  "Promoteurs, investisseurs, family offices",
            "format": "linkedin",
            "duree":  3,
        },
        {
            "id":     "reel_irr_explique",
            "titre":  "L'IRR en 60 secondes",
            "sujet":  "Définition et utilité du TRI (IRR) pour évaluer un investissement CRE",
            "angle":  "Ultra-synthétique, chiffre concret, mémorable",
            "cible":  "Tous publics LinkedIn",
            "format": "reel",
            "duree":  1,
        },
    ],
    "rachid": [
        {
            "id":     "20_ans_ma_lecons",
            "titre":  "Ce que 20 ans de M&A m'ont appris",
            "sujet":  "Les 5 leçons les plus importantes de ma carrière en M&A international",
            "angle":  "Personnel, authentique, 1ère personne, storytelling",
            "cible":  "Réseau professionnel CRE/M&A, jeunes investisseurs",
            "format": "youtube",
            "duree":  10,
        },
        {
            "id":     "deal_raté_evité",
            "titre":  "J'ai failli rater un deal à 8M€ — voici pourquoi",
            "sujet":  "Récit d'un deal où la due diligence a révélé un passif caché",
            "angle":  "Storytelling personnel, honnête, pédagogique",
            "cible":  "CEOs, investisseurs HNWI",
            "format": "linkedin",
            "duree":  4,
        },
        {
            "id":     "corridor_europe_golfe",
            "titre":  "Pourquoi j'investis entre l'Europe et le Golfe",
            "sujet":  "Ma vision du corridor Europe–MENA et les opportunités que personne ne voit encore",
            "angle":  "Vision, prise de position, géopolitique économique",
            "cible":  "Family offices, fonds PE, HNWI",
            "format": "youtube",
            "duree":  8,
        },
        {
            "id":     "reel_valorisation_pme",
            "titre":  "Comment valoriser une PME en 60 secondes",
            "sujet":  "Les 3 méthodes de valorisation PME — EBE, DCF, comparables",
            "angle":  "Ultra-synthétique, 3 méthodes claires, ton expert",
            "cible":  "CEOs envisageant une cession",
            "format": "reel",
            "duree":  1,
        },
    ],
}

# ─── FORMATS VIDÉO ───────────────────────────────────────────────────────────

FORMATS = {
    "youtube": {
        "label":       "YouTube (long format)",
        "ratio":       "16:9",
        "duree_min":   6,
        "duree_max":   15,
        "scenes_min":  5,
        "scenes_max":  8,
        "largeur":     1920,
        "hauteur":     1080,
        "fps":         30,
        "description": "Vidéo pédagogique complète avec intro, développement en 3-4 actes, conclusion et CTA",
    },
    "linkedin": {
        "label":       "LinkedIn Video (format moyen)",
        "ratio":       "16:9",
        "duree_min":   2,
        "duree_max":   5,
        "scenes_min":  4,
        "scenes_max":  6,
        "largeur":     1920,
        "hauteur":     1080,
        "fps":         30,
        "description": "Vidéo concise — hook fort, 3 points clés, CTA direct",
    },
    "reel": {
        "label":       "Reel Instagram/LinkedIn (format court)",
        "ratio":       "9:16",
        "duree_min":   0.5,
        "duree_max":   1.5,
        "scenes_min":  3,
        "scenes_max":  4,
        "largeur":     1080,
        "hauteur":     1920,
        "fps":         30,
        "description": "Reel vertical ultra-court — hook 5s, 2-3 points percutants, CTA",
    },
}

# ─── SYSTEM PROMPT ───────────────────────────────────────────────────────────

def get_system_prompt(brand: str) -> str:
    """System prompt adapté à la brand."""

    if brand == "rodschinson":
        identity = """Tu es le scénariste expert de RODSCHINSON INVESTMENT.

IDENTITÉ :
- Rodschinson Investment = l'épicentre de l'investissement immobilier professionnel EMEA
- Ton : autorité institutionnelle, data-driven, international, discret
- Présence : Brussels · Dubai · Casablanca
- Couleurs : bleu foncé #08316F + bleu ciel #00B6FF + blanc

AUDIENCES :
- Investisseurs HNWI (patrimoine >2M€)
- Family Offices (AUM >50M€)
- CEOs en cession (PME 1–50M€)
- Fonds PE & Debt (>5M€)"""
    else:
        identity = """Tu es le scénariste expert de RACHID CHIKHI, CEO de Rodschinson Investment.

IDENTITÉ :
- Rachid Chikhi = référence francophone M&A & CRE EMEA depuis 20 ans
- Background : Bank Degroof (equity analyst) + UCLouvain Ingénieur & Finance
- Ton : 1ère personne, authentique, expert sans arrogance, pédagogique
- Présence : Brussels · Dubai · Maroc"""

    return f"""{identity}

TON RÔLE :
Générer des scripts vidéo structurés en JSON.
Chaque scène doit avoir une narration fluide (lue par voix IA),
un type de visuel Manim précis (animation, graphique, texte),
et une durée réaliste.

RÈGLES ABSOLUES :
1. JSON valide uniquement — aucun texte en dehors du JSON
2. Narration : phrases courtes, rythme oral naturel, pausées
3. Chaque scène = unité autonome visuelle + narrative
4. Données chiffrées : toujours sourcer (JLL, CBRE, Bloomberg, etc.)
5. CTA final : toujours vers Rodschinson Investment ou rachidchikhi.com
6. Langue : Français exclusivement
7. Visuels Manim : utiliser UNIQUEMENT les types listés dans le schéma"""


# ─── USER PROMPT ─────────────────────────────────────────────────────────────

def build_script_prompt(brand: str, brief: dict) -> str:
    """Construit le prompt pour générer le script JSON."""

    fmt        = brief.get("format", "youtube")
    fmt_info   = FORMATS[fmt]
    duree      = brief.get("duree", fmt_info["duree_min"])
    n_scenes   = brief.get("n_scenes", fmt_info["scenes_min"])
    sujet      = brief.get("sujet", "")
    angle      = brief.get("angle", "")
    cible      = brief.get("cible", "")
    donnees    = brief.get("donnees", "")
    titre      = brief.get("titre", "")

    brand_name = "Rodschinson Investment" if brand == "rodschinson" else "Rachid Chikhi"
    site       = "rodschinson.com" if brand == "rodschinson" else "rachidchikhi.com"

    # Adapter les instructions selon le format
    if fmt == "reel":
        structure_note = """STRUCTURE REEL (ultra-court) :
- Scène 1 : Hook visuel 5s — phrase choc à l'écran
- Scène 2 : 2-3 points clés ultra-synthétiques
- Scène 3 : CTA + logo
Narration : max 150 mots au total. Phrases de 6-8 mots max."""
    elif fmt == "linkedin":
        structure_note = """STRUCTURE LINKEDIN VIDEO :
- Scène 1 : Hook + promesse (15s)
- Scènes 2-4 : 3 points clés développés (40s chacun)
- Scène 5 : Récap + CTA (20s)
Narration : max 400 mots au total. Phrases courtes et rythmées."""
    else:
        structure_note = """STRUCTURE YOUTUBE (long format) :
- Scène 1 : Hook + teaser (30s) — la promesse de la vidéo
- Scène 2 : Introduction + contexte (60s) — pourquoi ce sujet maintenant
- Scènes 3-N-1 : Développement (actes principaux, 60-90s chacun)
- Scène N : Conclusion + récap + CTA (30s)
Narration : 120-150 mots par minute de vidéo. Phrases naturelles, respirées."""

    return f"""Génère un script vidéo complet pour {brand_name}.

BRIEF :
- Titre : {titre if titre else sujet}
- Sujet : {sujet}
- Angle : {angle if angle else "Détermine l'angle le plus percutant"}
- Cible : {cible if cible else "Audience principale de la brand"}
- Données disponibles : {donnees if donnees else "Utilise des chiffres de marché récents et plausibles (JLL, CBRE, Bloomberg)"}
- Format : {fmt_info['label']} ({fmt_info['ratio']})
- Durée cible : {duree} min
- Nombre de scènes : {n_scenes}

{structure_note}

TYPES DE VISUELS MANIM DISPONIBLES (utilise UNIQUEMENT ces types) :
- "title_card"       : titre centré, sous-titre, fond coloré brand
- "text_bullets"     : liste à puces animée, apparition progressive
- "big_number"       : chiffre géant centré avec contexte (ex: -8%, 3.5%, 20 ans)
- "bar_chart"        : histogramme animé comparatif (max 5 barres)
- "line_chart"       : courbe d'évolution temporelle (max 3 séries)
- "pie_chart"        : camembert animé (max 5 parts)
- "comparison_table" : tableau comparatif 2-3 colonnes
- "process_steps"    : étapes numérotées animées en séquence
- "world_map"        : carte monde avec points géographiques surlignés
- "split_screen"     : deux blocs côte-à-côte (avant/après, A vs B)
- "quote_card"       : citation centrée, auteur, fond brand
- "timeline"         : frise chronologique animée
- "icon_grid"        : grille d'icônes avec labels (max 6)
- "cta_screen"       : écran final CTA avec logo et site web

RETOURNE UNIQUEMENT ce JSON valide (aucun texte avant ou après) :

{{
  "meta": {{
    "id":           "slug-du-titre",
    "brand":        "{brand_name}",
    "titre":        "Titre accrocheur de la vidéo",
    "description":  "Description YouTube/LinkedIn (150 mots max)",
    "format":       "{fmt}",
    "ratio":        "{fmt_info['ratio']}",
    "largeur":      {fmt_info['largeur']},
    "hauteur":      {fmt_info['hauteur']},
    "fps":          {fmt_info['fps']},
    "duree_totale_sec": {int(duree * 60)},
    "langue":       "fr",
    "genere_le":    "{datetime.datetime.now().isoformat()}",
    "tags_youtube": ["tag1", "tag2", "tag3", "tag4", "tag5"],
    "hashtags_linkedin": ["#hashtag1", "#hashtag2", "#hashtag3"]
  }},
  "scenes": [
    {{
      "id":           1,
      "nom":          "hook",
      "duree_sec":    30,
      "type_visuel":  "title_card",
      "narration":    "Texte exact lu par la voix IA. Phrases courtes. Naturel à l'oral.",
      "visuel": {{
        "titre_principal":  "Titre affiché à l'écran",
        "sous_titre":       "Sous-titre ou donnée clé",
        "couleur_fond":     "#08316F",
        "elements":         ["élément 1", "élément 2"],
        "animation":        "fade_in"
      }},
      "note_montage":  "Instruction pour le monteur / assemblage FFmpeg"
    }}
  ],
  "audio": {{
    "voix_style":     "professionnel et posé",
    "vitesse_parole": 1.0,
    "pauses_scene":   1.5,
    "musique_fond":   false,
    "notes_voix":     "Insistez sur les chiffres clés. Pause après chaque point."
  }},
  "post_production": {{
    "watermark":      true,
    "logo_position":  "bottom-right",
    "sous_titres":    true,
    "fade_in_out":    true,
    "formats_export": ["{fmt_info['ratio']}"]
  }}
}}

Génère exactement {n_scenes} scènes dans le tableau "scenes"."""


# ─── GÉNÉRATION ──────────────────────────────────────────────────────────────

def generate_script(brand: str, brief: dict) -> dict:
    """
    Appelle Claude API et retourne le script JSON parsé.
    Valide la structure avant de retourner.
    """
    if not HAS_ANTHROPIC:
        print("❌ pip install anthropic")
        sys.exit(1)

    if not ANTHROPIC_API_KEY:
        print("❌ ANTHROPIC_API_KEY manquant dans .env")
        sys.exit(1)

    client  = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    system  = get_system_prompt(brand)
    prompt  = build_script_prompt(brand, brief)

    fmt    = brief.get("format", "youtube")
    duree  = brief.get("duree", FORMATS[fmt]["duree_min"])
    titre  = brief.get("titre", brief.get("sujet", "vidéo"))

    print(f"\n  🎬 Génération script : {titre}")
    print(f"     Format : {FORMATS[fmt]['label']} · {duree} min")
    print(f"     Brand  : {brand.upper()}")
    print(f"     Claude : claude-sonnet-4-6\n")

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=6000,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()

    # Nettoyage backticks
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    script = json.loads(raw)

    # Validation basique
    _validate_script(script)

    return script


def _validate_script(script: dict):
    """Valide la structure du script JSON."""

    assert "meta"   in script, "Champ 'meta' manquant"
    assert "scenes" in script, "Champ 'scenes' manquant"
    assert "audio"  in script, "Champ 'audio' manquant"

    scenes = script["scenes"]
    assert len(scenes) >= 2, f"Trop peu de scènes : {len(scenes)}"

    types_valides = {
        "title_card", "text_bullets", "big_number", "bar_chart",
        "line_chart", "pie_chart", "comparison_table", "process_steps",
        "world_map", "split_screen", "quote_card", "timeline",
        "icon_grid", "cta_screen",
    }

    for i, scene in enumerate(scenes):
        assert "id"           in scene, f"Scène {i}: 'id' manquant"
        assert "narration"    in scene, f"Scène {i}: 'narration' manquante"
        assert "type_visuel"  in scene, f"Scène {i}: 'type_visuel' manquant"
        assert "duree_sec"    in scene, f"Scène {i}: 'duree_sec' manquant"
        assert scene["type_visuel"] in types_valides, (
            f"Scène {i}: type_visuel inconnu '{scene['type_visuel']}'"
        )

    # Durée totale cohérente
    duree_scenes = sum(s["duree_sec"] for s in scenes)
    duree_meta   = script["meta"].get("duree_totale_sec", duree_scenes)
    ecart        = abs(duree_scenes - duree_meta)

    if ecart > 30:
        print(f"  ⚠️  Durée scènes ({duree_scenes}s) ≠ durée meta ({duree_meta}s) — écart {ecart}s")
        # Corriger la meta
        script["meta"]["duree_totale_sec"] = duree_scenes

    print(f"  ✅ Script validé — {len(scenes)} scènes · {duree_scenes}s total")


def save_script(script: dict, brand: str) -> Path:
    """Sauvegarde le script JSON en local."""
    slug  = script["meta"].get("id", "video").replace(" ", "_")
    ts    = datetime.datetime.now().strftime("%Y%m%d_%H%M")
    fname = OUTPUT_DIR / f"script_{brand}_{slug}_{ts}.json"

    with open(fname, "w", encoding="utf-8") as f:
        json.dump(script, f, ensure_ascii=False, indent=2)

    print(f"  💾 Script → {fname}")
    return fname


def print_script_summary(script: dict):
    """Affiche un résumé lisible du script."""

    meta   = script["meta"]
    scenes = script["scenes"]

    print(f"\n{'═'*60}")
    print(f"  🎬 {meta.get('titre', 'N/A')}")
    print(f"{'═'*60}")
    print(f"  Brand  : {meta.get('brand')}")
    print(f"  Format : {meta.get('format')} — {meta.get('ratio')}")
    print(f"  Durée  : {meta.get('duree_totale_sec', 0)//60}m{meta.get('duree_totale_sec', 0)%60}s")
    print(f"  Scènes : {len(scenes)}")
    print()

    for scene in scenes:
        duree    = scene.get("duree_sec", 0)
        t_visuel = scene.get("type_visuel", "")
        nom      = scene.get("nom", f"scène {scene.get('id')}")
        narr     = scene.get("narration", "")[:80]

        print(f"  [{scene['id']:02d}] {nom:<20} {duree:>3}s  [{t_visuel}]")
        print(f"       \"{narr}...\"")

    print()
    print(f"  Tags YT     : {', '.join(meta.get('tags_youtube', []))}")
    print(f"  Hashtags LI : {' '.join(meta.get('hashtags_linkedin', []))}")
    print()


# ─── MODE DEMO ────────────────────────────────────────────────────────────────

def get_demo_script(brand: str, fmt: str = "youtube") -> dict:
    """
    Retourne un script fictif pour tester Manim sans appeler Claude.
    Structure identique au JSON réel.
    """
    is_rachid   = brand == "rachid"
    brand_name  = "Rachid Chikhi" if is_rachid else "Rodschinson Investment"
    site        = "rachidchikhi.com" if is_rachid else "rodschinson.com"

    if fmt == "reel":
        return {
            "meta": {
                "id": "demo-reel-irr",
                "brand": brand_name,
                "titre": "L'IRR en 60 secondes",
                "description": "Comprendre le Taux de Rendement Interne en 1 minute.",
                "format": "reel",
                "ratio": "9:16",
                "largeur": 1080,
                "hauteur": 1920,
                "fps": 30,
                "duree_totale_sec": 60,
                "langue": "fr",
                "genere_le": datetime.datetime.now().isoformat(),
                "tags_youtube": [],
                "hashtags_linkedin": ["#IRR", "#ImmobilierCommercial", "#Investissement"],
            },
            "scenes": [
                {
                    "id": 1, "nom": "hook", "duree_sec": 8,
                    "type_visuel": "big_number",
                    "narration": "L'IRR. Trois lettres qui déterminent si un investissement vaut vraiment le coup.",
                    "visuel": {
                        "valeur": "IRR", "unite": "",
                        "contexte": "Internal Rate of Return",
                        "couleur_fond": "#08316F",
                        "animation": "zoom_in",
                    },
                    "note_montage": "Texte IRR en bleu ciel, sous-titre blanc",
                },
                {
                    "id": 2, "nom": "definition", "duree_sec": 35,
                    "type_visuel": "process_steps",
                    "narration": (
                        "L'IRR mesure le rendement annualisé d'un investissement. "
                        "Plus l'IRR est élevé, plus l'investissement est rentable. "
                        "En immobilier commercial, un IRR de 12 à 18 pourcent est considéré excellent. "
                        "En dessous de 8 pourcent — à éviter."
                    ),
                    "visuel": {
                        "etapes": [
                            "IRR > 18% → Excellent",
                            "IRR 12–18% → Bon",
                            "IRR 8–12% → Acceptable",
                            "IRR < 8% → À éviter",
                        ],
                        "couleur_fond": "#FFFFFF",
                        "couleur_accents": "#00B6FF",
                        "animation": "slide_in_sequence",
                    },
                    "note_montage": "Apparition progressive des seuils",
                },
                {
                    "id": 3, "nom": "cta", "duree_sec": 17,
                    "type_visuel": "cta_screen",
                    "narration": (
                        "Pour aller plus loin sur les KPIs de l'immobilier commercial, "
                        "retrouvez notre guide complet sur " + site + "."
                    ),
                    "visuel": {
                        "cta_text": "Téléchargez notre Guide CRE KPIs",
                        "url": site,
                        "couleur_fond": "#08316F",
                        "animation": "fade_in",
                    },
                    "note_montage": "Logo Rodschinson centré, URL en bleu ciel",
                },
            ],
            "audio": {
                "voix_style": "professionnel et posé",
                "vitesse_parole": 1.0,
                "pauses_scene": 0.5,
                "musique_fond": False,
                "notes_voix": "Ton dynamique pour le Reel. Énergie.",
            },
            "post_production": {
                "watermark": True,
                "logo_position": "top-left",
                "sous_titres": True,
                "fade_in_out": True,
                "formats_export": ["9:16"],
            },
        }

    # YouTube long format
    return {
        "meta": {
            "id": "demo-cap-rate-explique",
            "brand": brand_name,
            "titre": "Le Cap Rate expliqué en 5 minutes — Guide Rodschinson",
            "description": (
                "Qu'est-ce que le Cap Rate ? Comment le calculer ? "
                "Quels sont les benchmarks par marché en 2025 ? "
                "Rodschinson Investment vous explique tout en 8 minutes."
            ),
            "format": "youtube",
            "ratio": "16:9",
            "largeur": 1920,
            "hauteur": 1080,
            "fps": 30,
            "duree_totale_sec": 480,
            "langue": "fr",
            "genere_le": datetime.datetime.now().isoformat(),
            "tags_youtube": [
                "immobilier commercial", "cap rate", "investissement", "EMEA", "Rodschinson"
            ],
            "hashtags_linkedin": [
                "#ImmobilierCommercial", "#CRE", "#Investissement", "#CapRate", "#EMEA"
            ],
        },
        "scenes": [
            {
                "id": 1, "nom": "hook", "duree_sec": 30,
                "type_visuel": "title_card",
                "narration": (
                    "Si vous investissez en immobilier commercial et que vous ne maîtrisez pas le Cap Rate, "
                    "vous prenez des risques que vous ne voyez pas. "
                    "Dans les 8 prochaines minutes, je vais vous expliquer ce KPI fondamental "
                    "avec des exemples concrets sur Paris, Dubai et Casablanca."
                ),
                "visuel": {
                    "titre_principal": "Le Cap Rate",
                    "sous_titre": "Le KPI #1 de l'immobilier commercial",
                    "couleur_fond": "#08316F",
                    "elements": ["Brussels · Dubai · Casablanca"],
                    "animation": "fade_in",
                },
                "note_montage": "Logo Rodschinson en haut à gauche. Titre en blanc, sous-titre en bleu ciel.",
            },
            {
                "id": 2, "nom": "definition", "duree_sec": 60,
                "type_visuel": "big_number",
                "narration": (
                    "Le Cap Rate, ou taux de capitalisation, est simple. "
                    "C'est le revenu net d'un actif divisé par sa valeur de marché. "
                    "Exemple concret : un immeuble de bureaux qui génère 500 000 euros de loyers nets par an "
                    "et vaut 10 millions d'euros a un Cap Rate de 5 pourcent. "
                    "Ce chiffre vous dit immédiatement : est-ce que cet actif est cher ou bon marché ?"
                ),
                "visuel": {
                    "valeur": "5%",
                    "unite": "Cap Rate",
                    "contexte": "500 000€ revenus nets ÷ 10 000 000€ valeur",
                    "couleur_fond": "#FFFFFF",
                    "animation": "count_up",
                },
                "note_montage": "Chiffre 5% en bleu foncé, grande taille. Formule en dessous.",
            },
            {
                "id": 3, "nom": "comparatif_marches", "duree_sec": 90,
                "type_visuel": "bar_chart",
                "narration": (
                    "Maintenant regardons les benchmarks de marché en 2025. "
                    "Paris, immeubles de bureaux prime : entre 3.5 et 4 pourcent. "
                    "C'est bas — ce qui veut dire que les acheteurs payent très cher pour des actifs sécurisés. "
                    "Dubai : entre 5 et 6.5 pourcent. Le marché offre plus de rendement, avec une fiscalité avantageuse. "
                    "Casablanca : entre 7 et 8 pourcent. Des rendements attractifs, un marché en développement. "
                    "Plus le Cap Rate est élevé, plus le rendement potentiel est important — mais souvent aussi plus le risque."
                ),
                "visuel": {
                    "titre": "Cap Rate par marché — Bureaux prime 2025",
                    "series": [
                        {"label": "Paris",       "valeur": 3.75, "couleur": "#08316F"},
                        {"label": "Dubai",       "valeur": 5.75, "couleur": "#00B6FF"},
                        {"label": "Casablanca",  "valeur": 7.50, "couleur": "#1A6B9E"},
                    ],
                    "unite": "%",
                    "source": "CBRE / JLL — 2025",
                    "couleur_fond": "#FFFFFF",
                    "animation": "grow_from_zero",
                },
                "note_montage": "Barres animées de gauche à droite. Source en bas droite.",
            },
            {
                "id": 4, "nom": "pieges", "duree_sec": 90,
                "type_visuel": "text_bullets",
                "narration": (
                    "Attention aux pièges classiques sur le Cap Rate. "
                    "Premier piège : confondre revenu brut et revenu net. "
                    "Le Cap Rate se calcule toujours sur le NOI — le revenu opérationnel net — "
                    "après charges, taxes foncières, et provisions. "
                    "Deuxième piège : comparer des Cap Rates de marchés différents sans ajuster le risque. "
                    "Un Cap Rate de 8 pourcent à Casablanca n'est pas équivalent à 8 pourcent à Paris. "
                    "Troisième piège : ignorer la structure locative. "
                    "Un bail 3-6-9 sécurisé avec un locataire triple A change tout."
                ),
                "visuel": {
                    "titre": "3 pièges à éviter",
                    "items": [
                        "Revenu brut ≠ Revenu net (NOI)",
                        "Cap Rate ≠ comparable entre marchés",
                        "Ignorer la structure locative",
                    ],
                    "couleur_fond": "#F0F6FF",
                    "couleur_accents": "#08316F",
                    "animation": "slide_in_sequence",
                },
                "note_montage": "Icône warning orange à côté de chaque piège.",
            },
            {
                "id": 5, "nom": "conseil_rodschinson", "duree_sec": 120,
                "type_visuel": "split_screen",
                "narration": (
                    "Chez Rodschinson Investment, on analyse systématiquement le Cap Rate "
                    "en parallèle avec trois autres métriques : l'IRR sur 5 ans, le DSCR, et le LTV. "
                    "Ensemble, ces quatre indicateurs vous donnent une vision complète d'un actif. "
                    "C'est cette rigueur qui nous permet d'accéder à des deals off-market "
                    "que d'autres opérateurs ne voient pas — ou ne savent pas évaluer correctement. "
                    "Sur les marchés Dubai et Casablanca notamment, nous observons actuellement "
                    "des opportunités significatives pour des investisseurs qui savent lire ces métriques."
                ),
                "visuel": {
                    "colonne_gauche": {
                        "titre": "Cap Rate seul",
                        "items": ["Vision partielle", "Risque non mesuré"],
                        "couleur": "#E0E7FF",
                    },
                    "colonne_droite": {
                        "titre": "Approche Rodschinson",
                        "items": ["Cap Rate + IRR + DSCR + LTV", "Vision complète"],
                        "couleur": "#08316F",
                        "couleur_texte": "#FFFFFF",
                    },
                    "couleur_fond": "#FFFFFF",
                    "animation": "slide_in_sides",
                },
                "note_montage": "Colonne droite (Rodschinson) plus grande et mise en avant.",
            },
            {
                "id": 6, "nom": "conclusion_cta", "duree_sec": 90,
                "type_visuel": "cta_screen",
                "narration": (
                    "Le Cap Rate est votre boussole en immobilier commercial. "
                    "Mais c'est seulement le point de départ. "
                    "Si vous avez un actif à évaluer ou un projet d'investissement, "
                    "Rodschinson Investment peut vous accompagner avec notre expertise sur les marchés EMEA. "
                    "Téléchargez notre guide complet Due Diligence CRE — lien en description. "
                    "Et si cette vidéo vous a apporté de la valeur, abonnez-vous — "
                    "chaque semaine, on décrypte un KPI ou un deal du marché."
                ),
                "visuel": {
                    "cta_text": "Téléchargez le Guide Due Diligence CRE",
                    "url": site,
                    "sous_cta": "Lien en description · Consultation gratuite 30 min",
                    "couleur_fond": "#08316F",
                    "animation": "fade_in",
                },
                "note_montage": "Logo centré. CTA en bleu ciel. Abonnez-vous en overlay.",
            },
        ],
        "audio": {
            "voix_style": "professionnel, posé, autorité bienveillante",
            "vitesse_parole": 1.0,
            "pauses_scene": 1.5,
            "musique_fond": False,
            "notes_voix": (
                "Insistez sur les pourcentages — bien articuler. "
                "Pause de 0.5s après chaque point clé. "
                "Ton légèrement plus dynamique sur le CTA final."
            ),
        },
        "post_production": {
            "watermark": True,
            "logo_position": "bottom-right",
            "sous_titres": True,
            "fade_in_out": True,
            "formats_export": ["16:9"],
        },
    }


# ─── GOOGLE SHEETS ────────────────────────────────────────────────────────────

def read_video_brief_from_sheet(brand: str, row_index: int) -> dict:
    """
    Lit un brief vidéo depuis Google Sheet.
    Structure onglet 'Briefs Vidéo' :
    Colonnes : id | titre | sujet | angle | donnees | cible | format | duree | statut
    """
    try:
        import gspread
        from google.oauth2.service_account import Credentials

        GOOGLE_SA_JSON = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "service_account.json")
        SHEET_IDS = {
            "rodschinson": os.getenv("SHEET_ID_RODSCHINSON", ""),
            "rachid": os.getenv("SHEET_ID_RACHID", ""),
        }
        GOOGLE_SCOPES = [
            "https://spreadsheets.google.com/feeds",
            "https://www.googleapis.com/auth/drive",
        ]

        creds  = Credentials.from_service_account_file(GOOGLE_SA_JSON, scopes=GOOGLE_SCOPES)
        client = gspread.authorize(creds)
        sheet  = client.open_by_key(SHEET_IDS[brand])
        ws      = sheet.worksheet("Briefs Vidéo")
        row     = ws.row_values(row_index)
        headers = ws.row_values(2)
        brief   = dict(zip(headers, row))

        return {
            "titre":   brief.get("Titre", brief.get("titre", "")),
            "sujet":   brief.get("Sujet", brief.get("sujet", "")),
            "angle":   brief.get("Angle", brief.get("angle", "")),
            "donnees": brief.get("Données", brief.get("donnees", "")),
            "cible":   brief.get("Cible", brief.get("cible", "")),
            "format":  brief.get("Format", brief.get("format", "youtube")).split("/")[0].strip(),
            "duree":   float(brief.get("Duree", brief.get("duree", 8)) or 8),

        }

    except Exception as e:
        print(f"  ⚠️  Impossible de lire le Sheet ({e})")
        return {}


def write_script_ref_to_sheet(brand: str, row_index: int, script_path: str):
    """
    Écrit le chemin du script généré dans le Sheet (colonne 'script_path').
    """
    try:
        import gspread
        from google.oauth2.service_account import Credentials
        from google.oauth2.service_account import Credentials

        GOOGLE_SA_JSON = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "service_account.json")
        SHEET_IDS = {"rodschinson": os.getenv("SHEET_ID_RODSCHINSON", ""), "rachid": os.getenv("SHEET_ID_RACHID", "")}
        GOOGLE_SCOPES = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]

        creds  = Credentials.from_service_account_file(GOOGLE_SA_JSON, scopes=GOOGLE_SCOPES)
        client = gspread.authorize(creds)
        sheet  = client.open_by_key(SHEET_IDS[brand])
        ws     = sheet.worksheet("Briefs Vidéo")
        headers = ws.row_values(1)

        if "script_path" in headers:
            col = headers.index("script_path") + 1
            ws.update_cell(row_index, col, script_path)
            col2 = headers.index("statut") + 1 if "statut" in headers else col + 1
            ws.update_cell(row_index, col2, "script généré")
            print(f"  ✅ Sheet mis à jour — ligne {row_index}")

    except Exception as e:
        print(f"  ⚠️  Impossible de mettre à jour le Sheet : {e}")


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Rodschinson — Génération de script vidéo (Claude API)"
    )
    parser.add_argument("--brand",     choices=["rodschinson", "rachid"], default="rodschinson")
    parser.add_argument("--sujet",     default="",   help="Sujet de la vidéo")
    parser.add_argument("--titre",     default="",   help="Titre de la vidéo")
    parser.add_argument("--angle",     default="",   help="Angle éditorial")
    parser.add_argument("--donnees",   default="",   help="Sources et chiffres disponibles")
    parser.add_argument("--cible",     default="",   help="Audience cible")
    parser.add_argument("--format",    choices=["youtube", "linkedin", "reel"], default="youtube")
    parser.add_argument("--duree",     type=float,   default=8.0, help="Durée en minutes")
    parser.add_argument("--n-scenes",  type=int,     default=0,   help="Nombre de scènes (0=auto)")
    parser.add_argument("--catalog",   default="",   help="ID du sujet prédéfini (ex: cap_rate_explique)")
    parser.add_argument("--sheet-row", type=int,     default=0,   help="Ligne Google Sheet à lire")
    parser.add_argument("--demo",      action="store_true",       help="Script fictif sans appel API")
    parser.add_argument("--summary",   action="store_true",       help="Afficher résumé détaillé")
    args = parser.parse_args()

    print(f"\n{'═'*60}")
    print(f"  RODSCHINSON — Pipeline Vidéo — Étape A")
    print(f"{'═'*60}")

    # ── Construire le brief ──────────────────────────────────────────────────

    brief = {}

    # Source 1 : catalog
    if args.catalog:
        catalog = VIDEO_CATALOG.get(args.brand, [])
        match = next((v for v in catalog if v["id"] == args.catalog), None)
        if match:
            brief = dict(match)
            print(f"\n  📚 Sujet catalogue : {brief['titre']}")
        else:
            print(f"  ⚠️  ID catalogue '{args.catalog}' introuvable")
            available = [v["id"] for v in VIDEO_CATALOG.get(args.brand, [])]
            print(f"  Disponibles : {available}")

    # Source 2 : Google Sheet
    elif args.sheet_row > 0:
        brief = read_video_brief_from_sheet(args.brand, args.sheet_row)
        if brief:
            print(f"\n  📊 Brief depuis Google Sheet (ligne {args.sheet_row})")

    # Source 3 : arguments CLI
    if not brief:
        brief = {
            "titre":   args.titre,
            "sujet":   args.sujet,
            "angle":   args.angle,
            "donnees": args.donnees,
            "cible":   args.cible,
            "format":  args.format,
            "duree":   args.duree,
        }

    # Overrides CLI
    if args.sujet:   brief["sujet"]  = args.sujet
    if args.format:  brief["format"] = args.format
    if args.duree:   brief["duree"]  = args.duree
    if args.n_scenes > 0:
        brief["n_scenes"] = args.n_scenes
    elif "n_scenes" not in brief:
        brief["n_scenes"] = FORMATS[brief["format"]]["scenes_min"]

    if not brief.get("sujet"):
        # Mode interactif
        print(f"\n  📝 Aucun brief fourni — saisie interactive\n")
        brief["sujet"]  = input("  Sujet de la vidéo : ").strip()
        brief["angle"]  = input("  Angle (optionnel) : ").strip()
        brief["donnees"]= input("  Données/sources   : ").strip()
        fmt_input = input("  Format [youtube/linkedin/reel] (défaut: youtube) : ").strip()
        brief["format"] = fmt_input if fmt_input in FORMATS else "youtube"
        duree_input = input("  Durée en minutes (défaut: 8) : ").strip()
        brief["duree"]  = float(duree_input) if duree_input else 8.0

    # ── Génération ───────────────────────────────────────────────────────────

    if args.demo:
        print(f"\n  🎭 Mode DEMO — script fictif (aucun appel API)")
        script = get_demo_script(args.brand, brief.get("format", "youtube"))
    else:
        script = generate_script(args.brand, brief)

    # ── Sauvegarde ────────────────────────────────────────────────────────────

    script_path = save_script(script, args.brand)

    # Mise à jour Sheet si demandé
    if args.sheet_row > 0:
        write_script_ref_to_sheet(args.brand, args.sheet_row, str(script_path))

    # ── Affichage ─────────────────────────────────────────────────────────────

    if args.summary:
        print_script_summary(script)

    print(f"\n  ✅ Script prêt : {script_path.name}")
    print(f"\n  Prochaine étape :")
    print(f"  → python render_manim.py --script {script_path}")
    print()

    return script_path


if __name__ == "__main__":
    main()
