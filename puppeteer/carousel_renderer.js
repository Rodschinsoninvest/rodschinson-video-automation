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

// ── BRAND HELPERS ────────────────────────────────────────────────────────────
/** Compute luminance-based text colour for a hex background. */
function contrastText(hex) {
  try {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return (0.299*r + 0.587*g + 0.114*b)/255 > 0.5 ? '#0a0a0a' : '#ffffff';
  } catch { return '#ffffff'; }
}

// ── PARSE ARGS ───────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (f) => { const i = args.indexOf(f); return i !== -1 && args[i+1] ? args[i+1] : null; };
  return {
    slides:        get('--slides'),
    template:      get('--template') || DEFAULT_TEMPLATE,
    out:           get('--out'),
    prefix:        get('--prefix') || 'slide',
    brandPrimary:  get('--brand-primary') || '#08316F',
    brandAccent:   get('--brand-accent')  || '#C8A96E',
    brandName:     get('--brand-name')    || 'Rodschinson',
    brandLogo:     get('--brand-logo')    || null,
    brandBg:       get('--brand-bg')      || null,
  };
}

// ── RENDER ONE SLIDE ─────────────────────────────────────────────────────────
async function renderSlide(browser, slideData, templatePath, outputPath, brand) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });

  try {
    await page.goto(`file://${templatePath}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 300));

    // ── Inject brand colours + identity before loadScene() ──────────────────
    await page.evaluate((b) => {
      const root = document.documentElement;
      // Inject brand colours as CSS variables.
      // Brand "primary" is the brand's main colour (often dark/navy used as base).
      // Brand "accent" is the highlight/CTA colour (bright).
      // Templates use --sky-blue / --gold / --accent for HIGHLIGHTS — map them to brand ACCENT
      // (mapping to primary made highlights invisible against the dark base background).
      const pairs = [
        ['--brand-primary', b.primary], ['--brand-accent', b.accent],
        ['--brand-text',    b.text],
        // Highlight/accent aliases — must use brand accent for visibility
        ['--sky',           b.accent], ['--sky-blue',    b.accent],
        ['--gold',          b.accent], ['--accent',      b.accent],
      ];
      // Only override background if brand has an explicit backgroundColor
      if (b.bg && b.bg !== b.primary) {
        pairs.push(['--bg', b.bg], ['--dark-blue', b.bg], ['--blue', b.bg], ['--blue2', b.bg]);
        document.body.style.background = b.bg;
      }
      pairs.forEach(([k,v]) => root.style.setProperty(k, v));
      window.__brand = b;
    }, brand);

    const loaded = await page.evaluate((sd) => {
      if (typeof window.loadScene !== 'function') return false;
      return window.loadScene(sd);
    }, slideData);

    // ── Update logo / brand name after loadScene() inserts DOM ──────────────
    await page.evaluate((b) => {
      // Logo monogram letter
      const mono = document.querySelector('.logo-monogram');
      if (mono) mono.textContent = b.initial;

      // Brand text block — show name only, no hardcoded "Investment" sub-line
      const lt = document.querySelector('.logo-text');
      if (lt) lt.innerHTML = `<span style="display:block;font-size:inherit;color:inherit;">${b.name}</span>`;

      // Any generic brand-tag / brand-name element
      ['.brand-tag','#frame-brand','.brand-name','.brand-watermark'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el) el.textContent = b.name;
      });

      // Replace logo img src if brand has a logo
      if (b.logo) {
        const img = document.querySelector('.logo-img, .brand-logo, img.logo');
        if (img) { img.src = b.logo; img.style.display = 'block'; }
        // Hide monogram if there's a real logo
        if (mono) mono.style.display = 'none';
      }
    }, brand);

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

    // Force animated elements to visible state (without destroying layout)
    await page.evaluate(() => {
      const scene = document.getElementById('scene');
      if (!scene) return;
      scene.classList.add('active');
      scene.classList.add('anim');
      // Only fix opacity for elements that were hidden for animation entrance
      scene.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el);
        el.style.transition = 'none';
        el.style.animationPlayState = 'paused';
        // Only force opacity if element was hidden (animated entrance)
        if (parseFloat(cs.opacity) < 0.01) {
          el.style.opacity = '1';
        }
        // Only reset translateY entrance animations, preserve other transforms
        if (cs.transform && cs.transform !== 'none' && cs.transform.includes('matrix')) {
          const m = cs.transform.match(/matrix\(([^)]+)\)/);
          if (m) {
            const vals = m[1].split(',').map(Number);
            // If translateY > 20px, it's likely an entrance animation
            if (Math.abs(vals[5]) > 20) {
              el.style.transform = 'none';
            }
          }
        }
      });
      // Width-based transitions (divider lines)
      scene.querySelectorAll('.divider, .rule, .cta-divider, .cta-rule, .t-rule').forEach(el => {
        if (!el.style.width || el.style.width === '0px' || el.style.width === '0') {
          el.style.width = '80px';
        }
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

  // Build brand object — read from args, compute text contrast
  const brand = {
    primary: args.brandPrimary,
    accent:  args.brandAccent,
    bg:      args.brandBg || null,
    text:    contrastText(args.brandPrimary),
    name:    args.brandName,
    initial: (args.brandName || 'R').charAt(0).toUpperCase(),
    logo:    args.brandLogo || null,
  };

  const total = slides.length;
  // Enrich every slide: inject brand + total so all slides know brand context
  const enrichedSlides = slides.map(s => ({ ...s, total, brand: args.brandName }));

  console.log('\n' + '═'.repeat(58));
  console.log(`  🖼️  Carousel Renderer — ${total} slides`);
  console.log(`  Template : ${tmplName}  |  Brand: ${brand.name}`);
  console.log(`  Colors   : ${brand.primary} / ${brand.accent}  text: ${brand.text}`);
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
      const res   = await renderSlide(browser, slide, tmplPath, fpath, brand);
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
