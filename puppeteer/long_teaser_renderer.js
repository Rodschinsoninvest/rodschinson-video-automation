#!/usr/bin/env node
/**
 * Rodschinson — Long Teaser PDF Renderer
 * Renders property long teaser with photos and plans to PDF.
 */
'use strict';

const puppeteer = require('puppeteer');
const fs   = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (f) => { const i = args.indexOf(f); return i !== -1 && args[i + 1] ? args[i + 1] : null; };
  return {
    script:       get('--script'),
    outputPdf:    get('--output-pdf'),
    outputThumb:  get('--output-thumb'),
    brandName:    get('--brand-name')    || 'Rodschinson',
    brandPrimary: get('--brand-primary') || '#08316F',
    brandAccent:  get('--brand-accent')  || '#C8A96E',
  };
}

async function main() {
  const opts = parseArgs();
  if (!opts.script) {
    console.error('Usage: node long_teaser_renderer.js --script PATH --output-pdf PATH --output-thumb PATH');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(opts.script, 'utf8'));
  const tmplPath = path.join(__dirname, 'templates', 'teaser_long.html');

  if (!fs.existsSync(tmplPath)) {
    console.error(`Template not found: ${tmplPath}`);
    process.exit(1);
  }

  console.log(`[long-teaser] Photos: ${(data.photos || []).length}, Plans: ${(data.plans || []).length}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
           '--font-render-hinting=none', '--allow-file-access-from-files'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1123, height: 794, deviceScaleFactor: 2 });
    await page.goto(`file://${tmplPath}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => document.fonts.ready).catch(() => {});

    await page.evaluate((brand) => {
      const root = document.documentElement;
      root.style.setProperty('--navy', brand.primary);
      root.style.setProperty('--brand-primary', brand.primary);
      root.style.setProperty('--brand-accent', brand.accent);
    }, { primary: opts.brandPrimary, accent: opts.brandAccent });

    const loaded = await page.evaluate((d, bn) => {
      if (typeof window.loadLongTeaser === 'function') return window.loadLongTeaser(d, bn);
      return false;
    }, data, opts.brandName);

    if (!loaded) { console.error('loadLongTeaser() returned false'); process.exit(1); }

    // Wait for <img> tags and CSS background-images to fully load
    await page.evaluate(async () => {
      const imgPromises = Array.from(document.images).map(img =>
        img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = () => r(); })
      );
      const bgUrls = [];
      document.querySelectorAll('[style*="background-image"]').forEach(el => {
        const m = (el.getAttribute('style') || '').match(/url\(['"]?([^'")]+)['"]?\)/);
        if (m && m[1]) bgUrls.push(m[1]);
      });
      const bgPromises = bgUrls.map(u => new Promise(r => {
        const im = new Image(); im.onload = im.onerror = () => r(); im.src = u;
      }));
      await Promise.all([...imgPromises, ...bgPromises]);
    });
    // Rotate portrait plan images now that natural dimensions are known
    await page.evaluate(() => { if (typeof window.rotatePortraitPlans === 'function') window.rotatePortraitPlans(); });
    await new Promise(r => setTimeout(r, 600));

    const pdfPath = opts.outputPdf || opts.script.replace(/\.json$/, '.pdf');
    await page.pdf({ path: pdfPath, format: 'A4', landscape: true, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    console.log(`[long-teaser] PDF -> ${pdfPath}`);

    const thumbPath = opts.outputThumb || opts.script.replace(/\.json$/, '_thumb.png');
    await page.screenshot({ path: thumbPath, type: 'png', clip: { x: 0, y: 0, width: 1123, height: 794 } });
    console.log(`[long-teaser] Thumb -> ${thumbPath}`);

    await page.close();
    console.log(JSON.stringify({ pdf: pdfPath, thumbnail: thumbPath, template: 'teaser_long' }));
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
