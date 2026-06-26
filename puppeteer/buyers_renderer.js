#!/usr/bin/env node
/**
 * Rodschinson — Buyer Shortlist PDF Renderer
 * Renders a branded table of buyers (applicants) linked to an asset.
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
    console.error('Usage: node buyers_renderer.js --script PATH --output-pdf PATH --output-thumb PATH');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(opts.script, 'utf8'));
  const tmplPath = path.join(__dirname, 'templates', 'buyers_shortlist.html');
  if (!fs.existsSync(tmplPath)) { console.error(`Template not found: ${tmplPath}`); process.exit(1); }

  console.log(`[buyers] ${(data.buyers || []).length} buyers`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
           '--font-render-hinting=none'],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(0);
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    await page.goto(`file://${tmplPath}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.evaluate((brand) => {
      const root = document.documentElement;
      root.style.setProperty('--brand-primary', brand.primary);
      root.style.setProperty('--brand-accent', brand.accent);
    }, { primary: opts.brandPrimary, accent: opts.brandAccent });

    const loaded = await page.evaluate((d, bn) => {
      if (typeof window.loadBuyers === 'function') return window.loadBuyers(d, bn);
      return false;
    }, data, opts.brandName);
    if (!loaded) { console.error('loadBuyers() returned false'); process.exit(1); }
    await new Promise(r => setTimeout(r, 250));

    const pdfPath = opts.outputPdf || opts.script.replace(/\.json$/, '.pdf');
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true,
                    margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    console.log(`[buyers] PDF -> ${pdfPath}`);

    const thumbPath = opts.outputThumb || opts.script.replace(/\.json$/, '_thumb.png');
    await page.screenshot({ path: thumbPath, type: 'png', clip: { x: 0, y: 0, width: 794, height: 1123 } });
    console.log(`[buyers] Thumb -> ${thumbPath}`);

    await page.close();
    console.log(JSON.stringify({ pdf: pdfPath, thumbnail: thumbPath, template: 'buyers_shortlist' }));
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
