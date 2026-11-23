#!/usr/bin/env node
/**
 * Render assets/photos/og.png (1200×630) and apple-touch-icon.png (180×180)
 * from the SVG artwork, plus a social card with the business name.
 */
import { createRequire } from 'node:module';
const require = createRequire('/home/davidoc/.openclaw/workspace/');
const puppeteer = require('puppeteer');

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PHOTOS = join(ROOT, 'assets', 'photos');

const poster = await readFile(join(PHOTOS, 'poster.svg'), 'utf8');
const posterData = `data:image/svg+xml;base64,${Buffer.from(poster).toString('base64')}`;

const favicon = await readFile(join(PHOTOS, 'favicon.svg'), 'utf8');
const faviconData = `data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}`;

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();

/* ---------- OG card 1200×630 ---------- */
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@500;600&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;position:relative;overflow:hidden;background:#2a1a12;
       font-family:Inter,system-ui,sans-serif}
  .bg{position:absolute;inset:0;background-image:url('${posterData}');
      background-size:cover;background-position:center 62%}
  .scrim{position:absolute;inset:0;
    background:linear-gradient(100deg,rgba(35,21,15,.95) 0%,rgba(35,21,15,.82) 44%,rgba(35,21,15,.3) 78%,rgba(35,21,15,.6) 100%)}
  .inner{position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;
         padding:0 78px}
  .brand{display:flex;align-items:center;gap:16px;margin-bottom:34px}
  .brand img{width:52px;height:52px;border-radius:12px}
  .brand span{color:rgba(255,255,255,.74);font-size:16px;letter-spacing:.2em;text-transform:uppercase;font-weight:600}
  h1{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:74px;line-height:1.04;
     letter-spacing:-.025em;color:#fff;max-width:15ch}
  .rule{width:74px;height:5px;background:#e8a33d;border-radius:3px;margin:30px 0 24px}
  p{color:rgba(255,255,255,.93);font-size:25px;line-height:1.45;max-width:22ch;font-weight:500}
  .bottom{position:absolute;left:78px;bottom:52px;display:flex;align-items:center;gap:18px;
          color:rgba(255,255,255,.82);font-size:17px;letter-spacing:.04em}
  .star{display:flex;align-items:center;gap:8px;color:#e8a33d;font-weight:700;font-size:22px}
  .dot{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.4)}
</style></head><body>
  <div class="bg"></div><div class="scrim"></div>
  <div class="inner">
    <div class="brand"><img src="${faviconData}" alt=""><span>Tapas · Les Roquetes</span></div>
    <h1>Entre Tapas</h1>
    <div class="rule"></div>
    <p>Tapas para compartir, hechas como en casa</p>
  </div>
  <div class="bottom">
    <span class="star">★ 4,9</span>
    <span class="dot"></span>
    <span>598 reseñas en Google</span>
    <span class="dot"></span>
    <span>Sant Pere de Ribes</span>
  </div>
</body></html>`, { waitUntil: 'load' });

await new Promise((r) => setTimeout(r, 1400));
await page.screenshot({ path: join(PHOTOS, 'og.png'), type: 'png' });
console.log('og.png 1200x630');

/* ---------- apple-touch-icon 180×180 ---------- */
await page.setViewport({ width: 180, height: 180, deviceScaleFactor: 1 });
await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0}
  body{width:180px;height:180px}
  img{width:180px;height:180px;display:block}
</style></head><body><img src="${faviconData}" alt=""></body></html>`, { waitUntil: 'load' });

await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: join(PHOTOS, 'apple-touch-icon.png'), type: 'png', omitBackground: true });
console.log('apple-touch-icon.png 180x180');

await browser.close();
