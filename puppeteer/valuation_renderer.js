#!/usr/bin/env node
/**
 * Rodschinson — Valuation Report PDF Renderer
 *
 * Renders multi-page property valuation HTML to PDF + PNG thumbnail.
 *
 * USAGE:
 *   node valuation_renderer.js --script valuation.json \
 *       --output-pdf out.pdf --output-thumb out.png \
 *       --brand-name "Rodschinson" --brand-primary "#08316F" --brand-accent "#C8A96E"
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
    console.error('Usage: node valuation_renderer.js --script PATH --output-pdf PATH --output-thumb PATH');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(opts.script, 'utf8'));
  const tmplPath = path.join(__dirname, 'templates', 'valuation.html');

  if (!fs.existsSync(tmplPath)) {
    console.error(`Template not found: ${tmplPath}`);
    process.exit(1);
  }

  console.log(`[valuation] Brand: ${opts.brandName} (${opts.brandPrimary} / ${opts.brandAccent})`);
  console.log(`[valuation] Methods: ${(data.valuation_methods || []).length}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    await page.goto(`file://${tmplPath}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => document.fonts.ready).catch(() => {});

    await page.evaluate((brand) => {
      const root = document.documentElement;
      root.style.setProperty('--brand-primary', brand.primary);
      root.style.setProperty('--navy', brand.primary);
      root.style.setProperty('--brand-accent', brand.accent);
    }, { primary: opts.brandPrimary, accent: opts.brandAccent });

    const loaded = await page.evaluate((d, bn) => {
      if (typeof window.loadValuation === 'function') return window.loadValuation(d, bn);
      return false;
    }, data, opts.brandName);

    if (!loaded) { console.error('loadValuation() returned false'); process.exit(1); }
    await new Promise(r => setTimeout(r, 400));

    const pdfPath = opts.outputPdf || opts.script.replace(/\.json$/, '.pdf');
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    console.log(`[valuation] PDF -> ${pdfPath}`);

    const thumbPath = opts.outputThumb || opts.script.replace(/\.json$/, '_thumb.png');
    await page.screenshot({ path: thumbPath, type: 'png', clip: { x: 0, y: 0, width: 794, height: 1123 } });
    console.log(`[valuation] Thumbnail -> ${thumbPath}`);

    await page.close();
    console.log(JSON.stringify({ pdf: pdfPath, thumbnail: thumbPath, template: 'valuation' }));
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
