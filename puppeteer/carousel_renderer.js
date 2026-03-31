#!/usr/bin/env node
/**
 * =============================================================================
 * RODSCHINSON — Puppeteer Carousel Renderer
 * =============================================================================
 * Reads a carousel JSON (array of slide objects) and renders each slide
 * as a 1080×1080 PNG using the selected HTML template.
 *
 * USAGE:
 *   node carousel_renderer.js --slides PATH.json --template carousel_bold
 *   node carousel_renderer.js --slides PATH.json --template carousel_clean --out /custom/dir
 *
 * OUTPUT:
 *   output/carousel/{job_prefix}_slide_01.png  … slide_NN.png
 * =============================================================================
 */

'use strict';

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

// ── PATHS ────────────────────────────────────────────────────────────────────
const ROOT     = path.resolve(__dirname, '..');
const TMPL_DIR = path.join(__dirname, 'templates');
const OUT_DIR  = path.join(ROOT, 'output', 'carousel');

// ── TEMPLATE MAP ─────────────────────────────────────────────────────────────
const TEMPLATES = {
  carousel_bold:    'carousel_bold.html',
  carousel_clean:   'carousel_clean.html',
  carousel_minimal: 'carousel_minimal.html',
  carousel_data:    'carousel_data.html',
  carousel_cre:     'carousel_cre.html',
};

const DEFAULT_TEMPLATE = 'carousel_bold';

// ── PARSE ARGS ───────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (f) => { const i = args.indexOf(f); return i !== -1 && args[i+1] ? args[i+1] : null; };
  return {
    slides:   get('--slides'),
    template: get('--template') || DEFAULT_TEMPLATE,
    out:      get('--out'),
    prefix:   get('--prefix') || 'slide',
  };
}

// ── RENDER ONE SLIDE ─────────────────────────────────────────────────────────
async function renderSlide(browser, slideData, templatePath, outputPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });

  try {
    await page.goto(`file://${templatePath}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 300));

    const loaded = await page.evaluate((sd) => {
      if (typeof window.loadScene !== 'function') return false;
      return window.loadScene(sd);
    }, slideData);

    if (!loaded) {
      console.error(`  ❌ loadScene failed for slide ${slideData.index}`);
      return null;
    }

    // Trigger animation then immediately force final state
    await page.evaluate(() => {
      if (typeof window.animateScene === 'function') window.animateScene();
      const style = document.createElement('style');
      style.textContent = '*, *::before, *::after { transition-delay: 0s !important; animation-delay: 0s !important; }';
      document.head.appendChild(style);
    });

    await new Promise(r => setTimeout(r, 80));

    // Force all animated elements to final state
    await page.evaluate(() => {
      const scene = document.getElementById('scene');
      if (!scene) return;
      scene.classList.add('active');
      scene.classList.add('anim');
      scene.querySelectorAll('*').forEach(el => {
        el.style.transition = 'none';
        el.style.opacity    = '1';
        el.style.transform  = 'none';
        el.style.animationPlayState = 'paused';
      });
      // Width-based transitions (divider lines)
      scene.querySelectorAll('.divider, .rule, .cta-divider, .cta-rule').forEach(el => {
        const cs = getComputedStyle(el);
        if (!el.style.width) el.style.width = '80px';
      });
    });

    await new Promise(r => setTimeout(r, 50));

    await page.screenshot({ path: outputPath, type: 'png' });
    const kb = Math.round(fs.statSync(outputPath).size / 1024);
    console.log(`  ✅ slide ${String(slideData.index).padStart(2,'0')}  →  ${path.basename(outputPath)}  (${kb} KB)`);
    return outputPath;

  } catch (err) {
    console.error(`  ❌ slide ${slideData.index}: ${err.message}`);
    return null;
  } finally {
    await page.close();
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();

  if (!args.slides || !fs.existsSync(args.slides)) {
    console.error('❌ Usage: node carousel_renderer.js --slides path/to/slides.json [--template carousel_bold] [--out /dir] [--prefix slide]');
    process.exit(1);
  }

  const slides   = JSON.parse(fs.readFileSync(args.slides, 'utf8'));
  const tmplName = args.template;

  // Resolve template path
  let tmplPath;
  if (TEMPLATES[tmplName]) {
    tmplPath = path.join(TMPL_DIR, TEMPLATES[tmplName]);
  } else {
    const dynamic = path.join(TMPL_DIR, `${tmplName}.html`);
    if (fs.existsSync(dynamic)) {
      tmplPath = dynamic;
    } else {
      console.warn(`  ⚠️  Template "${tmplName}" not found — using carousel_bold`);
      tmplPath = path.join(TMPL_DIR, TEMPLATES[DEFAULT_TEMPLATE]);
    }
  }

  if (!fs.existsSync(tmplPath)) {
    console.error(`❌ Template file not found: ${tmplPath}`);
    process.exit(1);
  }

  const outDir = args.out || OUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  const total = slides.length;
  // Inject total into each slide for the counter
  const enrichedSlides = slides.map(s => ({ ...s, total }));

  console.log('\n' + '═'.repeat(58));
  console.log(`  🖼️  Carousel Renderer — ${total} slides`);
  console.log(`  Template : ${tmplName}`);
  console.log('═'.repeat(58) + '\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--allow-file-access-from-files', '--disable-web-security',
      '--window-size=1080,1080',
    ],
  });

  const ok  = [];
  const err = [];
  const outPaths = [];

  try {
    for (const slide of enrichedSlides) {
      const fname = `${args.prefix}_${String(slide.index).padStart(2,'0')}.png`;
      const fpath = path.join(outDir, fname);
      const res   = await renderSlide(browser, slide, tmplPath, fpath);
      if (res) { ok.push(res); outPaths.push(res); }
      else err.push(slide.index);
    }
  } finally {
    await browser.close();
  }

  console.log('\n' + '─'.repeat(58));
  console.log(`  ✅ ${ok.length} slide(s) rendered  |  ❌ ${err.length} error(s)`);
  console.log(`  📁 ${outDir}\n`);

  // Write manifest for the backend to consume
  const manifest = { slides: outPaths, template: tmplName, count: ok.length };
  const manifestPath = path.join(outDir, `${args.prefix}_manifest.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  📋 Manifest: ${manifestPath}\n`);

  process.exit(err.length > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
