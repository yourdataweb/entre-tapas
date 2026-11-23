#!/usr/bin/env node
/**
 * Headless verification of the built site — three locales, no dependencies
 * beyond puppeteer.
 *
 *   node scripts/verify.mjs
 *   BASE=http://127.0.0.1:8099/ SHOTS=/tmp/entre-tapas node scripts/verify.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire('/home/davidoc/.openclaw/workspace/');
const puppeteer = require('puppeteer');
const fs = require('node:fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099/';
const SHOTS = process.env.SHOTS || '/tmp/entre-tapas-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const LOCALES = [
  { locale: 'es', path: '', label: 'ES (default, /)' },
  { locale: 'ca', path: 'ca/', label: 'CA (/ca/)' },
  { locale: 'en', path: 'en/', label: 'EN (/en/)' }
];

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('requestfailed', (r) => {
  const u = r.url();
  if (!/fonts\.g|googleusercontent|maps\.g|gstatic|google\.com\/maps/.test(u)) {
    errors.push('REQFAIL: ' + u + ' — ' + r.failure()?.errorText);
  }
});

const failures = [];
const expect = (cond, msg) => { if (!cond) failures.push(msg); return cond; };

async function inspect(url, label) {
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });
  await new Promise((r) => setTimeout(r, 800));

  const data = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const qa = (s) => [...document.querySelectorAll(s)];
    let jsonLd = null;
    try {
      const j = JSON.parse(q('script[type="application/ld+json"]').textContent);
      jsonLd = {
        type: j['@type'], name: j.name, rating: j.aggregateRating?.ratingValue,
        count: j.aggregateRating?.reviewCount, lang: j.inLanguage,
        sameAs: j.sameAs?.length, address: j.address?.addressLocality
      };
    } catch (e) { jsonLd = { error: String(e) }; }

    return {
      htmlLang: document.documentElement.lang,
      title: document.title,
      description: q('meta[name="description"]')?.content?.slice(0, 70),
      h1: q('#hero-title')?.innerText?.replace(/\s+/g, ' ').trim(),
      h1count: qa('h1').length,
      headingOrder: qa('h1,h2,h3,h4,h5,h6').map((h) => h.tagName).join(','),
      headingLevels: qa('h1,h2,h3,h4,h5,h6').map((h) => Number(h.tagName[1])),
      navLabels: qa('.nav a').map((a) => a.textContent.trim()),
      langOpts: qa('.lang-switch--header .lang-opt').map((a) => ({
        text: a.textContent.trim(), href: a.getAttribute('href'), active: a.classList.contains('is-active')
      })),
      socialLinks: qa('.social-bar--header .social-link').map((a) => a.getAttribute('aria-label')),
      reviews: qa('#review-grid .review').length,
      reviewStars: qa('#review-grid .review-stars').length,
      dishes: qa('.dish').length,
      ratingBadge: !!q('.rating-badge'),
      ratingValue: q('.rating-value')?.textContent?.trim(),
      ratingMeta: q('.rating-meta')?.textContent?.replace(/\s+/g, ' ').trim(),
      statStar: q('.stat-star')?.textContent?.trim(),
      statReviews: qa('.hero-stats .stat-label').map((e) => e.textContent.trim()),
      waLinks: qa('a[href*="wa.me"]').length,
      waHref: q('a[href*="wa.me"]')?.href,
      waFab: !!q('.wa-fab'),
      telLinks: qa('a[href^="tel:"]').map((a) => a.getAttribute('href')),
      caps: qa('.cap').length,
      capHeadings: qa('.cap-group h3').map((h) => h.textContent.trim()),
      canonical: q('link[rel="canonical"]')?.href,
      hreflangs: qa('link[rel="alternate"][hreflang]').map((l) => l.hreflang + '=' + l.href),
      ogLocale: q('meta[property="og:locale"]')?.content,
      ogAlternates: qa('meta[property="og:locale:alternate"]').map((m) => m.content),
      mapSrc: q('#map-frame')?.src || '',
      mapTitle: q('#map-frame')?.title,
      structured: jsonLd,
      skipLink: q('.skip')?.textContent?.trim(),
      imgAlts: qa('img').map((i) => i.alt),
      decorativeCount: qa('img').filter((i) => i.getAttribute('alt') === '').length,
      avatarsWithoutAlt: qa('.review-avatar img').filter((i) => !i.hasAttribute('alt')).length,
      contentImgsMissingAlt: qa('img').filter((i) => !i.hasAttribute('alt')).length,
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      hoursList: qa('#hours-list li').length,
      priceText: document.body.innerText.match(/€\s?\d+[–-]\d+/g) || []
    };
  });

  console.log(`\n===== ${label} =====`);
  console.log(JSON.stringify(data, null, 2));

  // assertions
  expect(data.h1count === 1, `${label}: expected exactly one h1, got ${data.h1count}`);
  expect(data.headingLevels[0] === 1, `${label}: the first heading should be an h1`);
  const jump = data.headingLevels.findIndex((lvl, i) => i > 0 && lvl - data.headingLevels[i - 1] > 1);
  expect(jump === -1, `${label}: heading level jumps at index ${jump} in ${data.headingOrder}`);
  expect(Boolean(data.canonical), `${label}: missing canonical`);
  expect(data.hreflangs.length === 4, `${label}: expected 4 hreflang links, got ${data.hreflangs.length} (${data.hreflangs.join(' ')})`);
  expect(data.langOpts.length === 3, `${label}: expected 3 language options, got ${data.langOpts.length}`);
  expect(data.langOpts.filter((o) => o.active).length === 1, `${label}: exactly one language should be active`);
  expect(data.reviews >= 1, `${label}: no testimonials rendered`);
  expect(data.waLinks >= 1, `${label}: no WhatsApp link rendered for a mobile number`);
  expect(!data.waHref || !data.waHref.includes('?'), `${label}: wa.me link must carry no prefilled message`);
  expect(data.telLinks.includes('tel:+34628009623'), `${label}: tel link missing/incorrect: ${data.telLinks}`);
  expect(data.ratingBadge, `${label}: rating badge missing for a 4.9 rating`);
  expect(data.structured && !data.structured.error, `${label}: JSON-LD failed to parse`);
  expect(data.structured?.rating === 4.9, `${label}: JSON-LD rating should be 4.9`);
  expect(data.mapSrc.includes('output=embed'), `${label}: map iframe not an embed`);
  expect(data.hoursList === 0, `${label}: opening hours must not be published`);
  expect(data.priceText.length === 0, `${label}: price per person must not be published`);
  // Every <img> must carry an alt attribute; decorative ones are empty by design
  // (hero poster and the review avatars, which sit next to the author name).
  expect(data.contentImgsMissingAlt === 0, `${label}: ${data.contentImgsMissingAlt} img(s) without an alt attribute`);
  expect(data.avatarsWithoutAlt === 0, `${label}: review avatars must be decorative (alt="")`);
  expect(data.decorativeCount >= 1, `${label}: the hero poster should be decorative`);
  expect(data.scrollW <= data.innerW + 1, `${label}: horizontal overflow ${data.scrollW} > ${data.innerW}`);

  return data;
}

const results = [];
for (const { locale, path, label } of LOCALES) {
  results.push(await inspect(BASE + path, label));
}

// titles and h1s must differ per locale (real localized HTML, not a JS swap)
const titles = new Set(results.map((r) => r.title));
const h1s = new Set(results.map((r) => r.h1));
expect(titles.size === 3, `titles are not unique per locale: ${[...titles].join(' | ')}`);
expect(h1s.size === 3, `h1 text is not unique per locale: ${[...h1s].join(' | ')}`);

// screenshots at desktop and mobile
for (const { locale, path } of LOCALES) {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + path, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${SHOTS}/${locale}-desktop.png`, fullPage: true });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${SHOTS}/${locale}-mobile.png`, fullPage: true });

  const ov = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }));
  console.log(`\n${locale} mobile overflow: ${ov.s > ov.i + 1 ? '❌ ' + ov.s + ' > ' + ov.i : '✓ none'}`);
  expect(ov.s <= ov.i + 1, `${locale} mobile: horizontal overflow ${ov.s} > ${ov.i}`);
}

// tablet width
await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: 'networkidle2' });
const tablet = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }));
console.log(`tablet 768 overflow: ${tablet.s > tablet.i + 1 ? '❌' : '✓ none'}`);
expect(tablet.s <= tablet.i + 1, `tablet: horizontal overflow ${tablet.s} > ${tablet.i}`);

// language switching actually navigates between locales
await page.setViewport({ width: 1440, height: 900 });
for (const [from, to, target] of [['', 'ca/', 'ca'], ['ca/', 'en/', 'en'], ['en/', '', 'es']]) {
  await page.goto(BASE + from, { waitUntil: 'networkidle2' });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click(`.lang-switch--header .lang-opt[lang="${target}"]`)
  ]);
  const landed = await page.evaluate(() => document.documentElement.lang);
  console.log(`switch ${from || '/'} → ${target}: ${page.url()} | lang=${landed}`);
  expect(landed.startsWith(target), `language switch to ${target} landed on lang=${landed}`);
}

// mobile drawer + keyboard
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.click('.nav-toggle');
await new Promise((r) => setTimeout(r, 350));
const opened = await page.evaluate(() => ({
  expanded: document.querySelector('.nav-toggle').getAttribute('aria-expanded'),
  hidden: document.querySelector('#mobile-nav').hidden,
  socialInDrawer: document.querySelectorAll('.social-bar--mobile .social-link').length,
  langInDrawer: document.querySelectorAll('.lang-switch--mobile .lang-opt').length
}));
console.log('mobile drawer open:', JSON.stringify(opened));
expect(opened.expanded === 'true' && opened.hidden === false, 'mobile drawer did not open');
expect(opened.langInDrawer === 3, 'mobile drawer should list all three languages');
expect(opened.socialInDrawer >= 1, 'mobile drawer should carry the social links');

await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 300));
const closed = await page.evaluate(() => document.querySelector('#mobile-nav').hidden);
console.log('escape closes drawer:', closed);
expect(closed === true, 'Escape did not close the mobile drawer');

console.log('\nERRORS:', errors.length ? JSON.stringify([...new Set(errors)], null, 2) : 'none');
console.log('FAILURES:', failures.length ? JSON.stringify(failures, null, 2) : 'none');

await browser.close();
process.exit(failures.length || errors.length ? 1 : 0);
