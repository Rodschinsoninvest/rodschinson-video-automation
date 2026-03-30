#!/usr/bin/env node
/**
 * =============================================================================
 * RODSCHINSON — Puppeteer Video Renderer
 * =============================================================================
 * Reads JSON script → renders HTML templates frame by frame → MP4 scenes
 *
 * USAGE:
 *   node renderer.js --script PATH_TO_SCRIPT.json
 *   node renderer.js --script ... --template news_reel
 *   node renderer.js --script ... --scene 1
 *   node renderer.js --script ... --quality h|m|l
 *
 * TEMPLATES:
 *   rodschinson_premium  (default) — dark blue, gold, geometry
 *   news_reel            — Al Jazeera style, ticker
 *   tech_data            — Bloomberg style, data grids
 *   corporate_minimal    — white, editorial
 * =============================================================================
 */

'use strict';

const puppeteer = require('puppeteer');
const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── PATHS ────────────────────────────────────────────────────────────────────
const ROOT       = path.resolve(__dirname, '..');
const SCENES_OUT = path.join(ROOT, 'output', 'scenes');
const TMPL_DIR   = path.join(__dirname, 'templates');

// ── QUALITY PRESETS ──────────────────────────────────────────────────────────
// Landscape presets
const QUALITY = {
  h: { width: 1920, height: 1080, fps: 24 },
  m: { width: 1280, height: 720,  fps: 24 },
  l: { width: 854,  height: 480,  fps: 20 },
};
// Portrait presets (9:16 for reels/stories)
const QUALITY_PORTRAIT = {
  h: { width: 1080, height: 1920, fps: 30 },
  m: { width: 720,  height: 1280, fps: 30 },
  l: { width: 540,  height: 960,  fps: 24 },
};

// ── TEMPLATE MAP ─────────────────────────────────────────────────────────────
const TEMPLATES = {
  rodschinson_premium: 'rodschinson_premium.html',
  news_reel:           'news_reel.html',
  tech_data:           'tech_data.html',
  corporate_minimal:   'corporate_minimal.html',
};

// ── PARSE ARGS ───────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (f) => { const i = args.indexOf(f); return i !== -1 && args[i+1] ? args[i+1] : null; };
  return {
    script:   get('--script'),
    template: get('--template') || 'rodschinson_premium',
    scene:    get('--scene') ? parseInt(get('--scene')) : null,
    quality:  get('--quality') || 'h',
  };
}

// ── NORMALISE VISUAL DATA ────────────────────────────────────────────────────
// Maps any field name Claude API might return to what templates expect
function normalizeScene(scene) {
  const v = scene.visuel || {};

  switch (scene.type_visuel) {

    case 'title_card':
      return {
        ...scene,
        visuel: {
          titre_principal: v.titre_principal || v.titre || v.title || '',
          sous_titre:      v.sous_titre      || v.subtitle || v.tagline || '',
          eyebrow:         v.eyebrow         || v.location || 'Brussels · Dubai · Casablanca',
          scene_number:    String(scene.id || '01').padStart(2,'0'),
          ...v,
        }
      };

    case 'big_number': {
      let valeur = v.valeur || v.nombre || v.value || v.number || '0';
      let unite  = v.unite  || v.unit   || v.unité || '%';
      // Handle "3.8%" format from Claude
      if (v.chiffre_principal) {
        const raw = String(v.chiffre_principal);
        valeur = raw.replace(/[%€KMB+\s]/g, '').trim();
        unite  = raw.includes('%') ? '%' : raw.includes('€') ? '€' : raw.includes('M') ? 'M' : '';
      }
      return {
        ...scene,
        visuel: {
          eyebrow:  v.eyebrow  || v.label || v.titre || '',
          valeur,
          unite,
          contexte: v.contexte || v.chiffre_secondaire || v.subtitle || '',
          formule:  v.formule  || v.formula || v.calcul || '',
          ...v,
          valeur, unite,
        }
      };
    }

    case 'bar_chart': {
      let series = v.series || [];
      if (!series.length && (v.donnees || v.data || v.bars)) {
        series = (v.donnees || v.data || v.bars || []).map(b => ({
          label:  b.label || b.ville || b.city || b.name || '',
          valeur: parseFloat(b.valeur || b.value || b.taux || 0),
        }));
      }
      return {
        ...scene,
        visuel: {
          titre:  v.titre  || v.title || '',
          source: v.source || v.sources || 'Source : CBRE / JLL — Rodschinson Investment',
          unite:  v.unite  || '%',
          series,
          ...v, series,
        }
      };
    }

    case 'process_steps': {
      let etapes = v.etapes || v.steps || v.items || v.points || [];
      etapes = etapes.map(e => typeof e === 'string' ? e : (e.texte || e.text || e.label || ''));
      return {
        ...scene,
        visuel: {
          titre:  v.titre || v.title || '',
          etapes,
          active: v.active !== undefined ? v.active : (v.current || 0),
          ...v, etapes,
        }
      };
    }

    case 'text_bullets': {
      let items = v.items || v.points || v.bullets || v.liste || [];
      items = items.map(i => typeof i === 'string' ? i : (i.texte || i.text || i.label || ''));
      return {
        ...scene,
        visuel: {
          titre: v.titre || v.title || '',
          items,
          ...v, items,
        }
      };
    }

    case 'cta_screen':
      return {
        ...scene,
        visuel: {
          eyebrow:  v.eyebrow  || 'Rodschinson Investment',
          headline: v.headline || v.titre || v.title || '',
          cta_text: v.cta_text || v.bouton || v.cta || 'Consultation Gratuite — 30 min',
          url:      v.url      || v.site   || 'rodschinson.com',
          ...v,
        }
      };

    case 'split_screen':
    case 'comparison_table':
      return {
        ...scene,
        visuel: {
          titre:          v.titre || v.title || '',
          colonne_gauche: v.colonne_gauche || v.left  || { titre: 'Standard', items: [] },
          colonne_droite: v.colonne_droite || v.right || { titre: 'Rodschinson', items: [] },
          ...v,
        }
      };

    default:
      return scene;
  }
}

// ── RENDER ONE SCENE ─────────────────────────────────────────────────────────
async function renderScene(browser, rawScene, opts) {
  const { width, height, fps, templatePath, outputPath } = opts;

  const scene  = normalizeScene(rawScene);
  const sid    = scene.id;
  const nom    = (scene.nom || `scene_${sid}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dur    = scene.duree_sec || 5;
  const type   = scene.type_visuel;
  const frames = Math.round(dur * fps);
  console.log(`     Capturing ${frames} frames @ ${fps}fps = ${dur}s`);

  process.stdout.write(
    `  [${String(sid).padStart(2,'0')}] ${nom.padEnd(26)} [${type}]  ${dur}s  ... `
  );

  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  try {
    // Use domcontentloaded — do NOT wait for network (avoids Google Fonts blocking)
    await page.goto(`file://${templatePath}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Brief pause so inline scripts run and CSS is applied
    await new Promise(r => setTimeout(r, 300));

    // Inject scene data
    const loaded = await page.evaluate((sd) => {
      if (typeof window.loadScene !== 'function') return false;
      return window.loadScene(sd);
    }, scene);

    if (!loaded) {
      console.log(`❌ (loadScene failed — type: ${type})`);
      return null;
    }

    // Create temp frame directory
    const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), `rod_scene_${sid}_`));

    // Trigger animations then immediately force all animated elements to final state.
    // We then capture frames by advancing CSS animation time — no real-time waiting.
    await page.evaluate(() => {
      if (typeof window.animateScene === 'function') window.animateScene();
      // Disable all transitions/animations so screenshots are immediate
      const style = document.createElement('style');
      style.id = '_rod_notransition';
      style.textContent = '*, *::before, *::after { transition-delay: 0s !important; animation-delay: 0s !important; }';
      document.head.appendChild(style);
    });

    // Short wait for first anim frame to settle
    await new Promise(r => setTimeout(r, 80));

    // Force all staggered elements to their final state immediately
    await page.evaluate(() => {
      const sel = [
        '.ps-step','.tb-item','.an-point','.dp-stat',
        '.bc-bar-inner','.tc-bi','.ech-bi','.ss-col',
        '.ep-step','.eb-item','.tp-step','.s4-step',
        '.scene.active *'
      ].join(',');
      document.querySelectorAll(sel).forEach(el => {
        el.style.transition = 'none';
        el.style.opacity    = '1';
        el.style.transform  = 'none';
        el.style.animationPlayState = 'paused';
      });
      // Ensure the scene itself is active & animated
      const scene = document.getElementById('scene');
      if (scene) { scene.classList.add('active'); scene.classList.add('anim'); }
    });

    await new Promise(r => setTimeout(r, 50));

    // Capture frames — screenshots only, no real-time delay between frames
    for (let f = 0; f < frames; f++) {
      await page.screenshot({
        path: path.join(frameDir, `f${String(f).padStart(5,'0')}.png`),
        type: 'png',
      });
    }

    // Assemble frames → MP4
    const result = spawnSync('ffmpeg', [
      '-y',
      '-framerate', String(fps),
      '-i', path.join(frameDir, 'f%05d.png'),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '20',
      '-preset', 'fast',
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
      outputPath,
    ], { stdio: 'pipe' });

    // Cleanup
    fs.rmSync(frameDir, { recursive: true, force: true });

    if (result.status !== 0) {
      console.log('❌ FFmpeg error');
      process.stderr.write(result.stderr.toString().slice(-200) + '\n');
      return null;
    }

    const kb = Math.round(fs.statSync(outputPath).size / 1024);
    console.log(`✅ ${path.basename(outputPath)}  (${kb} KB)`);
    return outputPath;

  } catch (err) {
    console.log(`❌ ${err.message}`);
    return null;
  } finally {
    await page.close();
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();

  if (!args.script || !fs.existsSync(args.script)) {
    console.error('❌ Usage: node renderer.js --script path/to/script.json [--template name] [--scene N] [--quality h|m|l]');
    process.exit(1);
  }

  // Default to medium quality for reasonable render speed
  if (!process.argv.includes('--quality')) args.quality = 'm';

  const script   = JSON.parse(fs.readFileSync(args.script, 'utf8'));
  const meta     = script.meta   || {};
  const scenes   = script.scenes || [];
  const tmplName = args.template || meta.template || 'rodschinson_premium';

  // Resolve dimensions: script meta takes priority over quality presets
  const scriptW   = meta.largeur || meta.width  || 0;
  const scriptH   = meta.hauteur || meta.height || 0;
  const isPortrait = scriptH > scriptW || meta.ratio === '9:16' || meta.format === 'reel';
  const presets   = isPortrait ? QUALITY_PORTRAIT : QUALITY;
  const baseQual  = presets[args.quality] || presets.h;
  const qual      = (scriptW > 0 && scriptH > 0)
    ? { width: scriptW, height: scriptH, fps: meta.fps || baseQual.fps }
    : baseQual;

  // Resolve template: check known map first, then look for {name}.html on disk,
  // finally fall back to rodschinson_premium.
  let tmplPath;
  if (TEMPLATES[tmplName]) {
    tmplPath = path.join(TMPL_DIR, TEMPLATES[tmplName]);
  } else {
    const dynamicPath = path.join(TMPL_DIR, `${tmplName}.html`);
    if (fs.existsSync(dynamicPath)) {
      tmplPath = dynamicPath;
    } else {
      console.warn(`  ⚠️  Template "${tmplName}" not found — falling back to rodschinson_premium`);
      tmplPath = path.join(TMPL_DIR, TEMPLATES.rodschinson_premium);
    }
  }

  if (!fs.existsSync(tmplPath)) {
    console.error(`❌ Template introuvable : ${tmplPath}`);
    console.error(`   Templates disponibles : ${Object.keys(TEMPLATES).join(', ')}`);
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(62));
  console.log(`  🎬  ${meta.titre || 'Rodschinson Video'}`);
  console.log(`  Brand : ${meta.brand || ''}  |  ${qual.width}×${qual.height}@${qual.fps}fps`);
  console.log(`  Template : ${tmplName}  |  ${scenes.length} scène(s)`);
  console.log('═'.repeat(62) + '\n');

  fs.mkdirSync(SCENES_OUT, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--allow-file-access-from-files',
      '--disable-web-security',
      '--allow-running-insecure-content',
      `--window-size=${qual.width},${qual.height}`,
    ],
  });

  const ok  = [];
  const err = [];

  try {
    for (const scene of scenes) {
      if (args.scene !== null && scene.id !== args.scene) continue;
      const fname = `scene_${String(scene.id).padStart(2,'0')}_${(scene.nom||'scene').replace(/[^a-z0-9_]/gi,'_')}.mp4`;
      const fpath = path.join(SCENES_OUT, fname);
      const res = await renderScene(browser, scene, {
        width: qual.width, height: qual.height, fps: qual.fps,
        templatePath: tmplPath,
        outputPath:   fpath,
      });
      if (res) ok.push(res); else err.push(scene.id);
    }
  } finally {
    await browser.close();
  }

  console.log('\n' + '─'.repeat(62));
  console.log(`  ✅ ${ok.length} scène(s) OK  |  ❌ ${err.length} erreur(s)`);
  console.log(`  📁 ${SCENES_OUT}\n`);

  if (ok.length > 0) {
    console.log(`  Étape suivante :`);
    console.log(`  python3 scripts/generate_audio.py --script ${args.script}\n`);
  }

  // Exit 1 only if NOTHING rendered — partial failures still produce a video
  process.exit(ok.length === 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
