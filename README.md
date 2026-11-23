# Entre Tapas

Trilingual static website for **Entre Tapas**, a tapas restaurant at Carrer de Roger de Flor, 100, Les Roquetes (Sant Pere de Ribes, Barcelona).

**Live:** https://yourdataweb.github.io/entre-tapas/
**Català:** https://yourdataweb.github.io/entre-tapas/ca/
**English:** https://yourdataweb.github.io/entre-tapas/en/

Hand-written HTML, CSS and vanilla JS with a small dependency-free build step. No framework, no runtime dependencies, no client-side rendering.

---

## Project identity

| Field | Value |
|---|---|
| Code name | `entre-tapas` |
| Domain label | `entre-tapas` |
| Repository | `entre-tapas` |
| S3 prefix | `entre-tapas/` |

Lowercase ASCII, hyphen-separated, no edge hyphens — valid as an RFC 1123 DNS label (≤63 chars), a GitHub repository name and an S3 bucket prefix.

## Data source

Business facts come from the Google Places API (New) payload for place ID
`ChIJxX0lreGHoxIRtBl22Ncw_7E`, captured in the `geoleads` dataset
(`data/places/vilanova_i_la_geltru_catalonia_spain.csv`, commit `98536e7`).
That record was dropped from the current CSV in a later data refresh, so the
values were read from git history.

| Field | Value |
|---|---|
| Address | Carrer de Roger de Flor, 100, 08812 Les Roquetes |
| Primary type | `tapas_restaurant` |
| Rating | 4.9 from 598 reviews |
| Phone | 628 00 96 23 (mobile → WhatsApp enabled) |
| Website | none |
| Social profiles | none beyond the Google listing |

## Structure

```
.
├── src/
│   ├── template.html          # single HTML template with {{i18n}} holes
│   ├── place.json             # business data (edit here)
│   └── i18n/
│       ├── es.json            # Spanish (default)
│       ├── ca.json            # Catalan
│       └── en.json            # English
├── index.html                 # GENERATED — Spanish
├── ca/index.html              # GENERATED — Catalan
├── en/index.html              # GENERATED — English
├── assets/
│   ├── css/styles.css
│   ├── js/app.js              # behaviour only; content is in the HTML
│   └── photos/                # SVG artwork, og.png, touch icon
├── scripts/
│   ├── build.mjs              # renders every locale
│   ├── make-icons.mjs         # og.png + apple-touch-icon.png
│   ├── verify.mjs             # headless functional assertions
│   └── audit-layout.mjs       # geometry, contrast, touch-target audit
└── .github/workflows/pages.yml
```

## Build

```bash
node scripts/build.mjs
```

Emits `index.html`, `ca/index.html`, `en/index.html`, `sitemap.xml`,
`manifest.webmanifest` and `robots.txt`. The build **fails** if any `{{hole}}`
or `<!--MARKER-->` survives into the output. The workflow runs it on every push
to `main`.

Every locale is **real server-rendered HTML** — not a JS language swap. Each has
its own `<html lang>`, canonical URL, `og:locale`, and a reciprocal `hreflang`
set for all three languages plus `x-default`.

## Localization

Strings live in `src/i18n/{es,ca,en}.json`. Add a key to all three, reference it
as `{{section.key}}` in `src/template.html`, rebuild.

- Spanish at `/` (default)
- Catalan at `/ca/`
- English at `/en/`

The switch is a plain link group, so it works with JavaScript disabled.
Numbers and dates are formatted per locale (`4.9` vs `4,9`).

Spanish is the default because the business serves a Spanish-speaking
neighbourhood; Catalan is offered because it is the local official language.

## Conditional business rules

Implemented once in `scripts/build.mjs`, so all locales agree:

| Rule | Behaviour |
|---|---|
| `rating > 4` | Large star badge in the reviews section (4.9 → shown) |
| `user_rating_count > 50` | Review count shown next to it, and as a hero stat (598 → shown) |
| phone is a Spanish mobile (`+34 6xx/7xx`) | WhatsApp links in the hero, the contact block and a floating button |
| phone is a landline | Call link only, no WhatsApp affordance |
| review rating ≥ 4 | Eligible as a testimonial — longest first, max 3 |
| `raw_price_range` | **Not published** (explicitly excluded) |
| opening hours | **Not published** (explicitly excluded) |

The WhatsApp link is `https://wa.me/34628009623` with **no** `?text=`, so on a
phone it opens the chat directly with no draft message.

## Accessibility

- Landmark structure, single `h1`, no skipped heading levels
- Skip link, visible focus rings
- `aria-expanded` / `aria-controls` on the mobile drawer; Escape closes it
- `aria-label` on icon-only links, announcing "opens in a new tab"
- Decorative SVGs `aria-hidden` + `focusable="false"`; decorative images `alt=""`
- Review text carries its own `lang` when it differs from the page
- Text contrast verified ≥ 4.5:1 on solid backgrounds (`--ink-mute` is 5.15:1)
- Touch targets ≥ 44 px at mobile widths
- Respects `prefers-reduced-motion`; print stylesheet included

## SEO

- Unique title, description, `h1` and copy per locale
- Reciprocal `hreflang` (es / ca / en / x-default) in the HTML and the sitemap
- Canonical URL per locale
- Open Graph + Twitter card with a generated 1200×630 image
- `Restaurant` JSON-LD: address, geo, rating, `servesCuisine`, `sameAs`
- `robots.txt`, `sitemap.xml`, web manifest

## Verification

```bash
node scripts/build.mjs
python3 -m http.server 8099 &
node scripts/verify.mjs        # functional + a11y assertions, screenshots
node scripts/audit-layout.mjs  # 3 locales × 5 viewports: overflow, contrast, targets
```

`verify.mjs` asserts, per locale: exactly one `h1`, no heading-level jumps,
canonical + 4 `hreflang` links, one active language, testimonials present,
`wa.me` link without a prefilled message, correct `tel:` target, rating badge,
parseable JSON-LD, an `output=embed` map, **zero** published hours and **zero**
published price text, and no horizontal overflow. It also drives the language
switch across all three locales and the mobile drawer.

## Deploy

Push to `main`; the workflow builds and deploys. First-time setup:
**Settings → Pages → Source: GitHub Actions**.

All asset paths are relative, so the site also works from a subpath or an S3
prefix unchanged.

## Attribution

Business data from the Google Maps Places API. Review text and reviewer avatars
belong to their authors and appear as attributed testimonials. The map embed is
served by Google Maps.
