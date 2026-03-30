#!/usr/bin/env node
/**
 * =============================================================================
 * RODSCHINSON — Puppeteer Image Post Renderer
 * =============================================================================
 * Reads a video script JSON and renders the best scene as a single PNG.
 *
 * USAGE:
 *   node image_renderer.js --script PATH.json [--template rodschinson_premium]
 *                          [--out /dir] [--format 1x1|4x5|9x16|16x9]
 * =============================================================================
 */

'use strict';

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

const ROOT     = path.resolve(__dirname, '..');
const TMPL_DIR = path.join(__dirname, 'templates');
const OUT_DIR  = path.join(ROOT, 'output', 'images');

const TEMPLATES = {
  rodschinson_premium: 'rodschinson_premium.html',
  news_reel:           'news_reel.html',
  tech_data:           'tech_data.html',
  corporate_minimal:   'corporate_minimal.html',
};

// Format → viewport dimensions
const FORMATS = {
  '1x1':   { width: 1080, height: 1080 },
  '4x5':   { width: 1080, height: 1350 },
  '9x16':  { width: 1080, height: 1920 },
  '16x9':  { width: 1920, height: 1080 },
  '1:1':   { width: 1080, height: 1080 },
  '4:5':   { width: 1080, height: 1350 },
  '9:16':  { width: 1080, height: 1920 },
  '16:9':  { width: 1920, height: 1080 },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (f) => { const i = args.indexOf(f); return i !== -1 && args[i+1] ? args[i+1] : null; };
  return {
    script:   get('--script'),
    template: get('--template') || 'rodschinson_premium',
    out:      get('--out'),
    format:   get('--format') || '1x1',
  };
}

function normalizeScene(scene) {
  const v = scene.visuel || {};
  switch (scene.type_visuel) {
    case 'title_card':
      return { ...scene, visuel: {
        titre_principal: v.titre_principal || v.titre || v.title || '',
        sous_titre:      v.sous_titre      || v.subtitle || v.tagline || '',
        eyebrow:         v.eyebrow         || v.location || 'Brussels · Dubai · Casablanca',
        scene_number:    String(scene.id || '01').padStart(2,'0'),
        ...v,
      }};
    case 'big_number': {
      let valeur = v.valeur || v.nombre || v.value || '';
      let unite  = v.unite  || v.unit   || '%';
      if (v.chiffre_principal) {
        const raw = String(v.chiffre_principal);
        valeur = raw.replace(/[%€KMB+\s]/g, '').trim();
        unite  = raw.includes('%') ? '%' : raw.includes('€') ? '€' : raw.includes('M') ? 'M' : '';
      }
      return { ...scene, visuel: {
        eyebrow:  v.eyebrow  || v.label || v.titre || '',
        valeur, unite,
        contexte: v.contexte || v.subtitle || '',
        ...v, valeur, unite,
      }};
    }
    case 'cta_screen':
      return { ...scene, visuel: {
        eyebrow:  v.eyebrow  || 'Rodschinson Investment',
        headline: v.headline || v.titre || '',
        cta_text: v.cta_text || v.cta   || 'Consultation Gratuite — 30 min',
        url:      v.url      || 'rodschinson.com',
        ...v,
      }};
    default:
      return scene;
  }
}

async function main() {
  const args = parseArgs();

  if (!args.script || !fs.existsSync(args.script)) {
    console.error('❌ Usage: node image_renderer.js --script path/to/script.json [--template name] [--format 1x1|4x5|9x16]');
    process.exit(1);
  }

  const data   = JSON.parse(fs.readFileSync(args.script, 'utf8'));
  const scenes = data.scenes || [];
  if (!scenes.length) {
    console.error('❌ No scenes found in script');
    process.exit(1);
  }

  // Pick best scene: prefer title_card, fall back to first scene
  const scene = scenes.find(s => s.type_visuel === 'title_card') || scenes[0];

  // Resolve template
  let tmplName = args.template;
  let tmplPath;
  if (TEMPLATES[tmplName]) {
    tmplPath = path.join(TMPL_DIR, TEMPLATES[tmplName]);
  } else {
    const dynamic = path.join(TMPL_DIR, `${tmplName}.html`);
    if (fs.existsSync(dynamic)) {
      tmplPath = dynamic;
    } else {
      console.warn(`  ⚠️  Template "${tmplName}" not found — using rodschinson_premium`);
      tmplPath = path.join(TMPL_DIR, TEMPLATES.rodschinson_premium);
    }
  }
  if (!fs.existsSync(tmplPath)) {
    console.error(`❌ Template file missing: ${tmplPath}`);
    process.exit(1);
  }

  const viewport = FORMATS[args.format] || FORMATS['1x1'];
  const outDir   = args.out || OUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath  = path.join(outDir, `post_${ts}.png`);

  console.log('\n' + '═'.repeat(54));
  console.log(`  🖼️  Image Post Renderer`);
  console.log(`  Template : ${tmplName}  |  Format : ${args.format}  (${viewport.width}×${viewport.height})`);
  console.log(`  Scene    : [${scene.id}] ${scene.nom || scene.type_visuel}`);
  console.log('═'.repeat(54) + '\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--allow-file-access-from-files', '--disable-web-security',
      `--window-size=${viewport.width},${viewport.height}`,
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });

    await page.goto(`file://${tmplPath}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 300));

    const loaded = await page.evaluate((sd) => {
      if (typeof window.loadScene !== 'function') return false;
      return window.loadScene(sd);
    }, normalizeScene(scene));

    if (!loaded) {
      console.error('  ❌ loadScene() returned false');
      process.exit(1);
    }

    // Trigger animation then force final state
    await page.evaluate(() => {
      if (typeof window.animateScene === 'function') window.animateScene();
      const s = document.createElement('style');
      s.textContent = '*, *::before, *::after { transition-delay: 0s !important; animation-delay: 0s !important; }';
      document.head.appendChild(s);
    });

    await new Promise(r => setTimeout(r, 150));

    await page.evaluate(() => {
      const scene = document.getElementById('scene');
      if (!scene) return;
      scene.classList.add('active', 'anim');
      scene.querySelectorAll('*').forEach(el => {
        el.style.transition = 'none';
        el.style.opacity    = '1';
        el.style.transform  = 'none';
        el.style.animationPlayState = 'paused';
      });
    });

    await new Promise(r => setTimeout(r, 80));

    await page.screenshot({ path: outPath, type: 'png' });
    await page.close();

    const kb = Math.round(fs.statSync(outPath).size / 1024);
    console.log(`  ✅ ${path.basename(outPath)}  (${kb} KB)\n`);
    console.log(`  📁 ${outPath}\n`);

  } finally {
    await browser.close();
  }

  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
