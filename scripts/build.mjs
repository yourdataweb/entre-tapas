#!/usr/bin/env node
/**
 * Static site build — Entre Tapas.
 *
 * Reads src/template.html + src/place.json + src/i18n/{es,ca,en}.json and emits:
 *   /       → Spanish (default)
 *   /ca/    → Catalan
 *   /en/    → English
 *
 * No dependencies. Each locale is real server-rendered HTML with its own lang,
 * canonical, og:locale and a reciprocal hreflang set, so search engines and
 * no-JS clients see the full content.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'src');

const CODE_NAME = 'entre-tapas';
const SITE = `https://yourdataweb.github.io/${CODE_NAME}`;
const ORIGIN = 'https://yourdataweb.github.io';

const LOCALES = [
  { locale: 'es', pathPrefix: '' },
  { locale: 'ca', pathPrefix: 'ca/' },
  { locale: 'en', pathPrefix: 'en/' }
];

const read = (p) => readFile(p, 'utf8');
const readJSON = async (p) => JSON.parse(await read(p));

/* ---------- helpers ---------- */

const escapeHTML = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Look up a dotted path; returns undefined when missing. */
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** Fill {{a.b.c}} from the context. {{{...}}} is injected unescaped. */
function interpolate(tpl, ctx) {
  return tpl
    .replace(/\{\{\{([\w.]+)\}\}\}/g, (m, path) => {
      const v = get(ctx, path);
      return v == null ? '' : String(v);
    })
    .replace(/\{\{([\w.]+)\}\}/g, (m, path) => {
      const v = get(ctx, path);
      return v == null ? '' : escapeHTML(v);
    });
}

const fill = (str, vars) => String(str).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

/* ---------- formatting ---------- */

const NUMBER_LOCALE = { es: 'es-ES', ca: 'ca-ES', en: 'en-GB' };

const formatRating = (n, locale) => (locale === 'en'
  ? n.toFixed(1)
  : n.toFixed(1).replace('.', ','));

const formatCount = (n, locale) => new Intl.NumberFormat(NUMBER_LOCALE[locale]).format(n);

const MONTHS = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  ca: ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};

function todayLabel(locale) {
  const d = new Date();
  return `${MONTHS[locale][d.getMonth()]} ${d.getFullYear()}`;
}

/* ---------- business rules (single source of truth) ---------- */

const RATING_BADGE_MIN = 4;   // "big star icon if the rating is higher than 4"
const REVIEW_COUNT_MIN = 50;  // "show user_rating_count if greater than 50"

/** Spanish mobile: +34 followed by 6 or 7. Anything else is a landline. */
function isMobileE164(e164) {
  if (!e164) return false;
  const d = String(e164).replace(/\D/g, '');
  if (d.startsWith('34')) return /^[67]\d{8}$/.test(d.slice(2));
  return false;
}

const showRatingBadge = (place) => Number(place.rating) > RATING_BADGE_MIN;
const showRatingCount = (place) => Number(place.userRatingCount) > REVIEW_COUNT_MIN;
const showWhatsApp = (place) => isMobileE164(place.phoneE164) && Boolean(place.whatsappNumber);

/* ---------- partials ---------- */

const ICONS = {
  google: '<path fill="currentColor" d="M21.35 11.1H12v2.9h5.35c-.25 1.35-1.7 3.95-5.35 3.95A5.95 5.95 0 0 1 6 12a5.95 5.95 0 0 1 6-5.95c1.7 0 2.85.72 3.5 1.34l2.4-2.31C16.35 3.6 14.4 2.7 12 2.7A9.3 9.3 0 0 0 2.7 12 9.3 9.3 0 0 0 12 21.3c5.35 0 8.9-3.76 8.9-9.05 0-.6-.07-1.06-.15-1.15Z"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="17.2" cy="6.8" r="1.25" fill="currentColor"/>',
  facebook: '<path fill="currentColor" d="M14.5 8.5h2.2V5.6h-2.4c-2.5 0-3.9 1.5-3.9 4v1.9H8.2v3h2.2V21h3.1v-6.5h2.3l.4-3h-2.7V9.9c0-1 .3-1.4 1-1.4Z"/>',
  tiktok: '<path fill="currentColor" d="M16.6 3h-2.9v11.3a2.1 2.1 0 1 1-1.8-2.08V9.28a5.02 5.02 0 1 0 4.7 5.01V8.9a5.6 5.6 0 0 0 3.3 1.07V7.03A3.36 3.36 0 0 1 16.6 3Z"/>',
  tripadvisor: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.6" cy="12" r="2.1" fill="currentColor"/><circle cx="15.4" cy="12" r="2.1" fill="currentColor"/>'
};

const SOCIAL_LABELS = {
  google: 'Google', instagram: 'Instagram', facebook: 'Facebook',
  tiktok: 'TikTok', tripadvisor: 'Tripadvisor'
};

function socialBar(social, dict, { variant = 'header' } = {}) {
  const entries = Object.entries(social)
    .filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v.startsWith('http') && ICONS[k]);

  if (!entries.length) return '';

  const links = entries.map(([k, url]) => `
        <a class="social-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer me"
           aria-label="${escapeHTML(SOCIAL_LABELS[k])} (${escapeHTML(dict.a11y.newWindow)})">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">${ICONS[k]}</svg>
        </a>`).join('');

  return `
      <ul class="social-bar social-bar--${variant}" aria-label="${escapeHTML(dict.a11y.socialNav)}">${links}
      </ul>`;
}

/** Language switch: plain links, one per locale, current one marked. */
function langSwitch(dict, links, { variant = 'header' } = {}) {
  const items = LOCALES.map(({ locale }) => {
    const isActive = dict.locale === locale;
    const meta = dict.langSwitch[locale];
    return `<a href="${escapeHTML(links[locale])}" class="lang-opt${isActive ? ' is-active' : ''}" lang="${locale}" hreflang="${locale}"
           aria-label="${escapeHTML(meta.aria)}"${isActive ? ' aria-current="true"' : ''}>${escapeHTML(meta.short)}</a>`;
  }).join('<span class="lang-sep" aria-hidden="true">/</span>');

  return `
      <div class="lang-switch lang-switch--${variant}" role="group" aria-label="${escapeHTML(dict.a11y.langSwitch)}">${items}</div>`;
}

const WA_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07s.89 2.4 1.02 2.56c.12.17 1.75 2.67 4.25 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z"/></svg>';

/** wa.me with no prefilled message, so mobile opens WhatsApp directly. */
const whatsappHref = (place) => `https://wa.me/${place.whatsappNumber}`;

function buildDishes(place, dict) {
  const dishes = place.kitchen || [];
  if (!dishes.length) return '';

  const ICON = {
    croquetas: '<circle cx="6" cy="12" r="2.1"/><circle cx="12" cy="9.6" r="2.1"/><circle cx="18" cy="12" r="2.1"/><circle cx="12" cy="14.4" r="2.1"/>',
    bravas: '<path d="M12 3.2c2.6 3 4.2 4.9 4.2 7.1a4.2 4.2 0 0 1-8.4 0c0-2.2 1.6-4.1 4.2-7.1Z" fill="currentColor"/>',
    calamares: '<circle cx="12" cy="12" r="6.4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
    cazuela: '<path d="M4 11h16a8 8 0 0 1-16 0Z" fill="currentColor"/><path d="M2.6 11h18.8" stroke="currentColor" stroke-width="1.8"/>',
    paella: '<path d="M12 4.4v3.2M4 11h16a8 8 0 0 1-16 0Z" fill="currentColor" stroke="currentColor"/>',
    vermut: '<path d="M7 4h10l-5 7.2V19h-2v-7.8L7 4Z" fill="currentColor"/><path d="M9 19h4.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
  };

  return dishes.map((d) => {
    const key = d.dish.toLowerCase();
    const label = d[dict.locale] || d.es;
    const note = d[`note_${dict.locale}`] || d.note_es || '';
    const svg = ICON[key] || ICON.croquetas;
    return `
        <li class="dish">
          <span class="dish-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">${svg}</svg>
          </span>
          <span class="dish-text">
            <strong>${escapeHTML(label)}</strong>
            <small>${escapeHTML(note)}</small>
          </span>
        </li>`;
  }).join('');
}

function buildCapabilities(place, dict) {
  const order = ['serviceOptions', 'foodAndDrink', 'atmosphere', 'amenities', 'parking', 'accessibility', 'payments'];
  const label = (k) => dict.capabilities.labels[k] || k;

  const groups = order
    .map((key) => [key, place.features?.[key] || []])
    .filter(([, list]) => list.some((x) => x.value !== null && x.value !== undefined));

  if (!groups.length) return '';

  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 12.5 5 5L20 6.5"/></svg>';
  const CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19"/></svg>';

  const body = groups.map(([key, list]) => {
    const items = list.filter((x) => x.value !== null && x.value !== undefined)
      .map((x) => `<li class="cap ${x.value ? 'is-yes' : 'is-no'}">${x.value ? CHECK : CROSS}<span>${escapeHTML(label(x.key))}</span></li>`)
      .join('');
    return `
        <div class="cap-group">
          <h3 class="cap-title">${escapeHTML(dict.capabilities[key])}</h3>
          <ul class="cap-list">${items}</ul>
        </div>`;
  }).join('');

  return `<div class="cap-inner">${body}\n      </div>`;
}

function buildReviews(place, dict) {
  const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="m12 2.6 2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.4l-5.8 3.06 1.1-6.46-4.69-4.58 6.49-.94L12 2.6Z"/></svg>';

  const positive = (place.reviews || [])
    .filter((r) => Number(r.rating) >= 4 && r.text && r.text.trim().length > 15)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, 3);

  if (!positive.length) return '';

  const dateFmt = new Intl.DateTimeFormat(NUMBER_LOCALE[dict.locale], { month: 'long', year: 'numeric' });

  return positive.map((r) => {
    const stars = Array.from({ length: 5 }, (_, i) =>
      `<span class="${i < Math.round(r.rating) ? '' : 'is-empty'}">${STAR}</span>`).join('');

    const initial = escapeHTML((r.author || '?').charAt(0));
    const avatar = r.avatar
      ? `<img src="${escapeHTML(r.avatar)}" alt="" width="44" height="44" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`
      : '';
    const when = r.date ? dateFmt.format(new Date(r.date)) : '';
    const langNote = r.lang && r.lang !== dict.locale
      ? `<span class="review-lang">${escapeHTML(fill(dict.reviews.originalIn, { lang: dict.languageNames[r.lang] || r.lang }))}</span>`
      : '';

    return `
        <li class="review">
          <span class="review-stars" aria-label="${r.rating} / 5">${stars}</span>
          <blockquote><p lang="${escapeHTML(r.lang || dict.locale)}">${escapeHTML(r.text)}</p>${langNote}</blockquote>
          <footer>
            <span class="review-avatar">
              <span class="review-avatar-fallback" aria-hidden="true">${initial}</span>${avatar}
            </span>
            <span class="review-meta">
              <strong>${escapeHTML(r.author)}</strong>
              <small>${escapeHTML(when)}</small>
            </span>
          </footer>
        </li>`;
  }).join('');
}

function buildJsonLd(place, dict, url) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': url,
    name: place.name,
    url,
    image: `${SITE}/assets/photos/og.png`,
    description: dict.meta.description,
    address: {
      '@type': 'PostalAddress',
      streetAddress: place.street,
      addressLocality: place.locality,
      addressRegion: place.region,
      postalCode: place.postalCode,
      addressCountry: place.country
    },
    geo: { '@type': 'GeoCoordinates', latitude: place.latitude, longitude: place.longitude },
    telephone: place.phoneInternational,
    inLanguage: dict.htmlLang,
    servesCuisine: dict.jsonLd.cuisine,
    currenciesAccepted: 'EUR',
    paymentAccepted: 'Cash, Credit Card, Debit Card, Contactless',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: place.rating,
      reviewCount: place.userRatingCount,
      bestRating: 5,
      worstRating: 1
    },
    hasMap: place.map.placeUri,
    sameAs: Object.entries(place.social)
      .filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v.startsWith('http'))
      .map(([, v]) => v),
    acceptsReservations: true,
    publicAccess: true,
    smokingAllowed: false
  };
  return JSON.stringify(data, null, 2);
}

/* ---------- page assembly ---------- */

function localeLinks(prefix) {
  const links = {};
  for (const { locale, pathPrefix } of LOCALES) {
    // Relative link from the current locale directory to the target one.
    if (prefix === pathPrefix) links[locale] = './';
    else if (!prefix && pathPrefix) links[locale] = pathPrefix;
    else if (prefix && !pathPrefix) links[locale] = '../';
    else links[locale] = `../${pathPrefix}`;
  }
  return links;
}

function buildHreflang(dict) {
  return LOCALES.map(({ locale, pathPrefix }) =>
    `<link rel="alternate" hreflang="${locale}" href="${SITE}/${pathPrefix}">`).join('\n')
    + `\n<link rel="alternate" hreflang="x-default" href="${SITE}/">`;
}

function buildOgAlternates(dict) {
  return LOCALES
    .filter(({ locale }) => locale !== dict.locale)
    .map(({ locale }) => {
      const code = { es: 'es_ES', ca: 'ca_ES', en: 'en_GB' }[locale];
      return `<meta property="og:locale:alternate" content="${code}">`;
    }).join('\n');
}

function buildPage({ dict, place, template }) {
  const prefix = dict.pathPrefix;
  const url = `${SITE}/${prefix}`;
  const root = prefix ? '../' : './';
  const links = localeLinks(prefix);

  const wa = showWhatsApp(place);
  const ratingBadge = showRatingBadge(place);
  const ratingCount = showRatingCount(place);

  const replacements = {
    '<!--HREFLANG-->': buildHreflang(dict),
    '<!--OG_ALTERNATES-->': buildOgAlternates(dict),
    '<!--SOCIAL-->': socialBar(place.social, dict, { variant: 'header' }),
    '<!--SOCIAL_MOBILE-->': socialBar(place.social, dict, { variant: 'mobile' }),
    '<!--LANG-->': langSwitch(dict, links, { variant: 'header' }),
    '<!--LANG_MOBILE-->': langSwitch(dict, links, { variant: 'mobile' }),

    '<!--DISHES-->': buildDishes(place, dict),
    '<!--CAPABILITIES-->': buildCapabilities(place, dict),
    '<!--REVIEWS-->': buildReviews(place, dict),

    '<!--WHATSAPP_HERO-->': wa
      ? `<a class="btn btn-ghost" href="${whatsappHref(place)}" target="_blank" rel="noopener noreferrer">${WA_ICON}${escapeHTML(dict.hero.ctaWhatsapp)}<span class="sr-only"> (${escapeHTML(dict.a11y.newWindow)})</span></a>`
      : '',

    '<!--WHATSAPP_CONTACT-->': wa
      ? `<a class="contact-btn" href="${whatsappHref(place)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHTML(dict.a11y.waAria)}">
            <span class="contact-icon" aria-hidden="true">${WA_ICON}</span>
            <span class="contact-text"><strong>${escapeHTML(dict.visit.whatsapp)}</strong><small>${escapeHTML(place.phoneNational)}</small></span>
          </a>`
      : '',

    '<!--WHATSAPP_FAB-->': wa
      ? `<a class="wa-fab" href="${whatsappHref(place)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHTML(dict.a11y.waAria)}">${WA_ICON.replace('width="20" height="20"', 'width="30" height="30"')}</a>`
      : '',

    '<!--RATING_COUNT_STAT-->': ratingCount
      ? `<li>
          <span class="stat-value">${formatCount(place.userRatingCount, dict.locale)}</span>
          <span class="stat-label">${escapeHTML(dict.hero.statReviews)}</span>
        </li>`
      : '',

    '<!--RATING_BADGE-->': ratingBadge
      ? `<div class="rating-badge" role="img" aria-label="${escapeHTML(fill(dict.a11y.ratingAria, { rating: formatRating(place.rating, dict.locale), count: formatCount(place.userRatingCount, dict.locale) }))}">
          <span class="rating-star" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="56" height="56" focusable="false"><path fill="currentColor" d="m12 2.6 2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.4l-5.8 3.06 1.1-6.46-4.69-4.58 6.49-.94L12 2.6Z"/></svg>
          </span>
          <span class="rating-body">
            <span class="rating-value">${formatRating(place.rating, dict.locale)}</span>
            <span class="rating-meta"><span>${ratingCount ? escapeHTML(fill(dict.reviews.count, { count: formatCount(place.userRatingCount, dict.locale) })) : ''}</span> ${escapeHTML(dict.reviews.onGoogle)}</span>
          </span>
        </div>`
      : ''
  };

  let html = template;
  for (const [marker, value] of Object.entries(replacements)) {
    html = html.split(marker).join(value);
  }

  const ctx = {
    ...dict,
    htmlLang: dict.htmlLang,
    dir: dict.dir,
    url,
    root,
    siteBase: `${ORIGIN}/${CODE_NAME}/`,
    ogLocale: dict.ogLocale,
    jsonLd: buildJsonLd(place, dict, url),
    year: new Date().getFullYear(),
    footerCredit: fill(dict.footer.dataNote, { date: todayLabel(dict.locale) }),
    place: {
      ...place,
      ratingFormatted: formatRating(place.rating, dict.locale),
      primaryTypeLabel: place.primaryTypeLabel[dict.locale] || place.primaryTypeLabel.es
    },
    map: place.map
  };

  html = interpolate(html, ctx);
  html = html.replace(/^[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  return html;
}

/* ---------- sibling assets ---------- */

function buildSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const entries = LOCALES.map(({ pathPrefix }, i) => {
    const alternates = LOCALES.map(({ locale, pathPrefix: p }) =>
      `    <xhtml:link rel="alternate" hreflang="${locale}" href="${SITE}/${p}"/>`).join('\n')
      + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>`;
    return `  <url>
    <loc>${SITE}/${pathPrefix}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${i === 0 ? '1.0' : '0.9'}</priority>
${alternates}
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`;
}

const buildManifest = (place, dict) => JSON.stringify({
  name: place.name,
  short_name: place.shortName || place.name,
  description: dict.meta.description,
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#fdf9f2',
  theme_color: '#2a1a12',
  lang: 'es',
  icons: [
    { src: 'assets/photos/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: 'assets/photos/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
  ]
}, null, 2) + '\n';

const buildRobots = () => `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

/* ---------- main ---------- */

async function main() {
  const template = await read(join(SRC, 'template.html'));
  const raw = await readJSON(join(SRC, 'place.json'));

  const merged = {
    ...raw.place,
    map: raw.map || {},
    social: raw.social || {},
    reviews: raw.reviews || [],
    features: raw.features || {},
    kitchen: raw.kitchen || []
  };

  const outputs = [];

  for (const { locale, pathPrefix } of LOCALES) {
    const dict = await readJSON(join(SRC, 'i18n', `${locale}.json`));
    dict.pathPrefix = pathPrefix;

    const html = buildPage({ dict, place: merged, template });
    const dir = pathPrefix ? join(ROOT, pathPrefix) : ROOT;
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'index.html');
    await writeFile(file, html, 'utf8');
    outputs.push({ locale, pathPrefix, html });
  }

  const es = await readJSON(join(SRC, 'i18n', 'es.json'));
  await writeFile(join(ROOT, 'sitemap.xml'), buildSitemap(), 'utf8');
  await writeFile(join(ROOT, 'manifest.webmanifest'), buildManifest(merged, es), 'utf8');
  await writeFile(join(ROOT, 'robots.txt'), buildRobots(), 'utf8');

  console.log('Built:');
  for (const { locale, pathPrefix, html } of outputs) {
    console.log(`  ${(pathPrefix || '') + 'index.html'}  (${locale}, ${html.length} bytes)`);
  }
  console.log('  sitemap.xml, manifest.webmanifest, robots.txt');

  // Build-time gate: no unresolved holes or markers may reach the output.
  let failed = false;
  for (const { locale, html } of outputs) {
    const holes = html.match(/\{\{[^}]+\}\}/g);
    const markers = html.match(/<!--(SOCIAL|LANG|WHATSAPP_\w+|RATING_\w+|CAPABILITIES|REVIEWS|DISHES|HREFLANG|OG_ALTERNATES)[\w_]*-->/g);
    if (holes) { console.error(`  ✗ ${locale}: unresolved holes ${[...new Set(holes)].join(', ')}`); failed = true; }
    if (markers) { console.error(`  ✗ ${locale}: unresolved markers ${[...new Set(markers)].join(', ')}`); failed = true; }
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
