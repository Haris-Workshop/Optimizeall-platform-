// Builds the free PDF guides into frontend/public/downloads/*.pdf (served at /downloads/*.pdf).
//
//   node content/downloads/build.mjs                      # links point to https://www.optimizeall.com
//   SITE_URL=https://example.com node content/downloads/build.mjs
//
// Uses the Playwright Chromium the frontend already depends on (PLAYWRIGHT_BROWSERS_PATH, e.g. /opt/pw-browsers); never
// run `playwright install` just for this. Chromium writes only the title into the PDF's document information, so the
// script appends an incremental update with Title, Author, Subject, Keywords and Creator (no extra dependencies).
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guides, aboutBlock } from './guides.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const out = join(root, 'frontend', 'public', 'downloads');
const site = (process.env.SITE_URL || 'https://www.optimizeall.com').replace(/\/+$/, '');
const require = createRequire(join(root, 'frontend', 'package.json'));
const { chromium } = require('playwright');

const css = readFileSync(join(here, 'style.css'), 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function page(g) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(g.title)}</title>
<meta name="author" content="Optimize All"><meta name="description" content="${esc(g.subject)}">
<style>${css}</style></head><body>
<header class="masthead"><div class="kicker">${esc(g.kicker)} · Optimize All</div><h1>${esc(g.title)}</h1><p>${g.intro.replace(/<a href=/g, '<a href=')}</p></header>
<main>${g.body}</main>
${aboutBlock(site, g.partners)}
</body></html>`;
}

const footer = (g) => `<div style="width:100%;font:7.5px 'Liberation Sans',Arial,sans-serif;color:#555b78;padding:0 14mm;display:flex;justify-content:space-between">
<span>${esc(g.title)} · Optimize All · ${esc(site.replace(/^https?:\/\//, ''))}/downloads/${g.file}.pdf</span>
<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;

/** A PDF text string as UTF-16BE hex (safe for any character). */
function pdfText(s) {
  let hex = 'FEFF';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    const units = cp > 0xffff ? [0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff)] : [cp];
    for (const unit of units) hex += unit.toString(16).padStart(4, '0').toUpperCase();
  }
  return `<${hex}>`;
}

/** Appends an incremental update that replaces the document information dictionary. */
function withInfo(pdf, info) {
  const text = pdf.toString('latin1');
  const startxref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)?.[1]);
  if (!Number.isFinite(startxref)) throw new Error('PDF: no startxref');
  const trailer = text.slice(text.lastIndexOf('trailer'));
  const size = Number(/\/Size\s+(\d+)/.exec(trailer)?.[1]);
  const rootRef = /\/Root\s+(\d+\s+\d+\s+R)/.exec(trailer)?.[1];
  if (!size || !rootRef) throw new Error('PDF: unexpected trailer (classic xref table expected)');
  const entries = Object.entries(info).map(([k, v]) => `/${k} ${pdfText(v)}`).join(' ');
  const obj = `${size} 0 obj\n<< ${entries} >>\nendobj\n`;
  const objOffset = pdf.length + 1; // after the leading newline below
  const xrefOffset = objOffset + Buffer.byteLength(obj, 'latin1');
  const update =
    `\n${obj}xref\n${size} 1\n${String(objOffset).padStart(10, '0')} 00000 n \n` +
    `trailer\n<< /Size ${size + 1} /Root ${rootRef} /Info ${size} 0 R /Prev ${startxref} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.concat([pdf, Buffer.from(update, 'latin1')]);
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const tab = await context.newPage();
  for (const g of guides(site)) {
    await tab.setContent(page(g), { waitUntil: 'load' });
    if (process.env.PREVIEW_DIR) {
      // Optional review aid: a PNG of the print layout of each guide.
      await tab.emulateMedia({ media: 'print' });
      await tab.setViewportSize({ width: 794, height: 1123 });
      await tab.screenshot({ path: join(process.env.PREVIEW_DIR, `${g.file}.png`), fullPage: true });
    }
    const pdf = await tab.pdf({
      format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>', footerTemplate: footer(g), tagged: true, outline: true,
    });
    const file = join(out, `${g.file}.pdf`);
    writeFileSync(file, withInfo(pdf, {
      Title: g.title, Author: 'Optimize All', Subject: g.subject, Keywords: g.keywords.join(', '), Creator: 'Optimize All',
    }));
    console.log(`${g.file}.pdf  ${(statSync(file).size / 1024).toFixed(0)} KB`);
  }
} finally {
  await browser.close();
}
