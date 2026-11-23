#!/usr/bin/env node
/**
 * Layout / typography / contrast audit for the built site.
 *
 * Substitutes for eyeballing screenshots: measures real geometry and computed
 * styles in the browser. Checks overlaps, clipping, touch targets, contrast.
 *
 *   BASE=http://127.0.0.1:8099/ node scripts/audit-layout.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire('/home/davidoc/.openclaw/workspace/');
const puppeteer = require('puppeteer');

const BASE = process.env.BASE || 'http://127.0.0.1:8099/';

const LOCALES = [
  { locale: 'es', path: '' },
  { locale: 'ca', path: 'ca/' },
  { locale: 'en', path: 'en/' }
];

const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 780, mobile: true },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, mobile: true },
  { name: 'laptop-1280', width: 1280, height: 800, mobile: false },
  { name: 'desktop-1920', width: 1920, height: 1080, mobile: false }
];

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();

const issues = [];

function auditInPage() {
  const out = { overflow: [], clipped: [], overlaps: [], smallTargets: [], lowContrast: [], tinyText: [] };

  const parseRGB = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const contrast = (fg, bg) => {
    const L1 = lum(fg), L2 = lum(bg);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  };

  // walk up for the first opaque background
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parseRGB(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.55) return c;
      n = n.parentElement;
    }
    return { r: 253, g: 249, b: 242, a: 1 };
  };

  const docW = document.documentElement.clientWidth;

  // 1. anything sticking out horizontally
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > docW + 1.5 || r.left < -1.5) {
      // ignore things deliberately off-canvas (skip links, screen-reader text)
      if (el.classList.contains('skip') || el.classList.contains('sr-only')) continue;
      // the hero poster is scaled 1.02 inside overflow:hidden by design
      if (el.closest('.hero-media') || el.closest('.map-card')) continue;
      out.overflow.push(`${el.tagName.toLowerCase()}.${el.className || '(none)'} → ${Math.round(r.left)}..${Math.round(r.right)} (vw ${docW})`);
    }
  }

  // 2. text clipped by its own box
  for (const el of document.querySelectorAll('h1,h2,h3,p,li,strong,small,span,a')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.overflow === 'visible') continue;
    // visually-hidden text is clipped to 1px on purpose
    if (el.classList.contains('sr-only') || el.closest('.sr-only')) continue;
    if (el.scrollHeight > el.clientHeight + 2 && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') {
      if (el.clientHeight > 0) out.clipped.push(`${el.tagName.toLowerCase()}.${el.className || ''} scrollH ${el.scrollHeight} > clientH ${el.clientHeight}`);
    }
  }

  // 3. footer/header text overlapping body content
  const header = document.querySelector('.site-header');
  const heroTitle = document.querySelector('#hero-title');
  if (header && heroTitle) {
    const hb = header.getBoundingClientRect();
    const tb = heroTitle.getBoundingClientRect();
    // header is fixed and overlays the hero by design; only flag if the h1 sits inside the header band
    if (tb.top < hb.bottom - 4 && tb.top > 0) {
      out.overlaps.push(`h1 starts at ${Math.round(tb.top)}, header ends at ${Math.round(hb.bottom)}`);
    }
  }

  // 4. touch targets for standalone controls.
  //    Sized against the parent that actually carries the padding (a nav link in
  //    a padded 44px row has a good target even if its own box is 24px tall),
  //    and only enforced on touch viewports, where 44px is the WCAG 2.5.8 floor.
  const isTouch = window.matchMedia('(pointer: coarse)').matches || innerWidth <= 780;
  for (const el of document.querySelectorAll('a,button')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    // inline links inside running text are exempt (WCAG 2.5.8 exception)
    if (el.closest('p, blockquote, .footer-fine, dd, .review')) continue;
    // skip links are only interactive while focused
    if (el.classList.contains('skip')) continue;

    let zone = r;
    const parent = el.parentElement;
    if (parent) {
      const ps = getComputedStyle(parent);
      const pr = parent.getBoundingClientRect();
      if (parseFloat(ps.paddingTop) + parseFloat(ps.paddingBottom) >= 8) zone = pr;
    }
    const minSide = isTouch ? 44 : 24;
    if (zone.height < minSide || zone.width < minSide) {
      out.smallTargets.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 26)}" ${Math.round(zone.width)}×${Math.round(zone.height)}`);
    }
  }

  // 5. contrast of visible text
  for (const el of document.querySelectorAll('h1,h2,h3,p,li,strong,small,span,a,address,dt,dd,blockquote')) {
    if (!el.textContent || !el.textContent.trim()) continue;
    if (el.children.length && el.tagName !== 'A') continue; // leaf text only
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (parseFloat(cs.opacity) < 0.5) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    const fg = parseRGB(cs.color);
    if (!fg) continue;
    const bg = bgOf(el);
    // blend semi-transparent text over its background
    const blended = {
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a)
    };
    const ratio = contrast(blended, bg);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const min = large ? 3 : 4.5;

    // Text over the hero photograph sits on a deliberately dark scrim, and the
    // header is transparent until it sticks. A computed background colour is a
    // false reading in both cases, so sample only solid-background content.
    if (el.closest('.hero')) continue;
    const inHeader = el.closest('.site-header');
    if (inHeader && !inHeader.classList.contains('is-stuck')) continue;

    if (ratio < min - 0.05) {
      out.lowContrast.push(`${el.tagName.toLowerCase()}.${el.className || ''} "${el.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1 (needs ${min})`);
    }
  }

  // 6. text too small to read comfortably
  for (const el of document.querySelectorAll('p,li,small,span,dt,dd,address')) {
    if (!el.textContent || !el.textContent.trim()) continue;
    if (el.children.length) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    const size = parseFloat(cs.fontSize);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // 11px is the floor for legal/meta copy
    if (size < 11) out.tinyText.push(`${el.tagName.toLowerCase()}.${el.className || ''} ${size}px`);
  }

  return out;
}

for (const locale of LOCALES) {
  for (const vp of VIEWPORTS) {
    await page.setViewport({
      width: vp.width, height: vp.height,
      deviceScaleFactor: 1, isMobile: vp.mobile, hasTouch: vp.mobile
    });
    await page.goto(BASE + locale.path, { waitUntil: 'networkidle2', timeout: 40000 });
    await new Promise((r) => setTimeout(r, 500));

    const res = await page.evaluate(auditInPage);
    const tag = `${locale.locale} @ ${vp.name}`;

    const scroll = await page.evaluate(() => ({
      s: document.documentElement.scrollWidth,
      i: window.innerWidth,
      bodyH: document.body.scrollHeight
    }));

    let bad = false;
    for (const [k, list] of Object.entries(res)) {
      if (!list.length) continue;
      bad = true;
      // de-duplicate noise
      const uniq = [...new Set(list)];
      issues.push({ tag, kind: k, items: uniq.slice(0, 6), total: uniq.length });
    }
    if (scroll.s > scroll.i + 1) {
      bad = true;
      issues.push({ tag, kind: 'pageOverflow', items: [`${scroll.s} > ${scroll.i}`], total: 1 });
    }

    console.log(`${bad ? '⚠' : '✓'} ${tag}  (doc ${scroll.s}px, height ${scroll.bodyH}px)`);
  }
}

// report
if (issues.length) {
  console.log('\n--- ISSUES ---');
  for (const i of issues) {
    console.log(`\n[${i.kind}] ${i.tag} — ${i.total} occurrence(s)`);
    for (const it of i.items) console.log('   • ' + it);
  }
} else {
  console.log('\nNo layout, contrast or touch-target issues found.');
}

await browser.close();
process.exit(issues.length ? 1 : 0);
