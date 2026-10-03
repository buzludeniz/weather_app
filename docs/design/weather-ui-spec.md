# Nimbus Weather — Web UI Design Specification

**Status:** approved direction, ready to implement
**Applies to:** `frontend/index.html`, `frontend/styles.css`, `frontend/app.js`
**Data contract:** `packages/shared/src/contracts/weather.ts` (`WeatherBundleSchema`)

> **IP note.** This spec describes the *information architecture and layout conventions* of the
> professional weather-forecast page genre (large current temperature, "As of" line, radar map as a
> first-class band, dense label/value detail grid, scrolling hourly strip, daily range list,
> separate air-quality and astronomy blocks). All markup, CSS, class names, token names, colour
> values, and copy below are original to this project. No third-party brand, wordmark, icon set,
> image, or proprietary stylesheet is referenced or reproduced.

---

## 1. Design direction

**One sentence:** a flat, light, newspaper-dense forecast page — a scrolling document of numbers, not a
dark animated dashboard.

The current design treats weather as *ambience*: a full-viewport particle scene, glassmorphic
translucent cards, gradient text, spring-eased hover lifts, a giant glowing hero. The target treats
weather as *data*: a masthead, a rule-lined page, one enormous number, and then a long scroll of
tabular figures a reader can actually compare.

Five rules, in priority order:

1. **Flat surfaces only.** Solid fills, 1px borders, one subtle shadow level. No `backdrop-filter`, no
   alpha-blended "glass", no gradients on text, no glow.
2. **Light is the default.** The dark theme is retained behind the existing toggle, but it is a
   *reader* theme, not a *showcase* theme: near-black-blue page, flat panels, no glow.
3. **Data density over display space.** One section, one job, no wasted vertical rhythm. Small
   radii, tight leading, tabular figures everywhere a number can repeat in a column.
4. **One column, one scroll.** No tabs. No globe. Every section is in the DOM and reachable by
   scrolling; anchors are a convenience, never a gate.
5. **The map is the co-star.** The globe is gone. The Leaflet map is promoted from a hidden tab panel
   to a full-bleed band with a persistent layer switcher.

**Anti-goals:** no bounce/spring easing, no parallax, no `transform: scale()` on hover, no animated
background, no infinite decorative animation of any kind. The only motion permitted is opacity /
colour transitions under 200ms, plus the Leaflet pan/zoom.

---

## 2. Colour system

All colours are custom properties on `:root` (light) with a single `.theme-dark` override block. The
dark block redefines the same names — no component ever hard-codes a colour.

### 2.1 Light theme (default)

```css
:root {
  /* ── Surfaces ─────────────────────────────────────────────── */
  --nw-page:            hsl(210 32% 97%);   /* ≈ #F3F6FA  page background        */
  --nw-surface:         hsl(0 0% 100%);     /* #FFFFFF     cards, panels          */
  --nw-surface-sunken:  hsl(210 28% 96%);   /* ≈ #F0F4F9  inset wells, chart bg   */
  --nw-surface-alt:     hsl(210 30% 98.5%); /* ≈ #FAFBFD  zebra row / hover       */
  --nw-header:          hsl(211 40% 99%);   /* ≈ #FAFCFF  masthead fill           */

  /* ── Lines ────────────────────────────────────────────────── */
  --nw-border:          hsl(214 22% 87%);   /* ≈ #D9E0EA  1px hairline            */
  --nw-border-strong:   hsl(214 18% 74%);   /* ≈ #BFC9D7  emphasised divider      */
  --nw-rule:            hsl(214 24% 91%);   /* ≈ #E3E9F1  row separator inside card*/

  /* ── Ink ──────────────────────────────────────────────────── */
  --nw-text:            hsl(215 34% 13%);   /* ≈ #161F2C  headings, values        */
  --nw-text-body:       hsl(215 16% 32%);   /* ≈ #48525F  body copy               */
  --nw-text-muted:      hsl(215 13% 44%);   /* SUPERSEDED — shipped 38.9%, see §10 */
  --nw-text-faint:      hsl(215 11% 60%);   /* SUPERSEDED — shipped 40.75%, see §10 */
  --nw-text-invert:     hsl(0 0% 100%);

  /* ── Brand / interactive ──────────────────────────────────── */
  --nw-accent:          hsl(211 74% 43%);   /* ≈ #1655B8  links, active state     */
  --nw-accent-hover:    hsl(211 74% 36%);   /* ≈ #10459B                           */
  --nw-accent-soft:     hsl(211 70% 95.5%); /* ≈ #E9F0FC  selected chip fill      */
  --nw-accent-line:     hsl(211 60% 78%);   /* ≈ #8DB2E8  selected chip border    */
  --nw-focus:           hsl(211 82% 45%);   /* focus ring                         */

  /* ── Temperature encoding ─────────────────────────────────── */
  --nw-temp-high:       hsl(22 84% 47%);    /* ≈ #DE5C1D  highs, warm end         */
  --nw-temp-low:         hsl(203 62% 42%);   /* ≈ #2C7BB0  lows, cool end          */
  --nw-temp-track:      hsl(210 24% 90%);   /* ≈ #DFE6EF  range bar remainder    */

  /* ── Precipitation ────────────────────────────────────────── */
  --nw-precip:          hsl(199 84% 45%);   /* ≈ #089DD8  PoP text, precip bars   */
  --nw-precip-soft:     hsl(199 84% 93%);   /* ≈ #DEF3FC                           */

  /* ── UV index ──────────────────────────────────────────────────
   * These lightness values are LOWER than they first appear. The band colour is
   * text on white, on `--nw-surface-sunken` (the "Now" column) and on paper, so
   * each was re-solved against all three rather than picked for how it looks as a
   * swatch. `--nw-uv-moderate` at 40% lightness measures 2.59:1 on white and
   * failed 1.4.3; it is 27.6% now. Do not "brighten" these — the dark theme and
   * the print block have their own values, and all three are load-bearing. */
  --nw-uv-low:          hsl(150 58% 31.3%);  /* 0–2   */
  --nw-uv-moderate:     hsl(48 90% 27.6%);   /* 3–5   */
  --nw-uv-high:         hsl(28 90% 36%);     /* 6–7   */
  --nw-uv-very-high:    hsl(354 72% 48%);    /* 8–10  */
  --nw-uv-extreme:      hsl(283 55% 46%);    /* 11+   */
}
```

### 2.2 Dark theme

```css
.theme-dark {
  --nw-page:            hsl(216 32% 9%);
  --nw-surface:         hsl(216 26% 13%);
  --nw-surface-sunken:  hsl(216 28% 11%);
  --nw-surface-alt:     hsl(216 24% 15%);
  --nw-header:          hsl(216 28% 11%);

  --nw-border:          hsl(215 20% 22%);
  --nw-border-strong:   hsl(215 16% 36%);
  --nw-rule:            hsl(215 20% 19%);

  --nw-text:            hsl(210 28% 95%);
  --nw-text-body:       hsl(212 16% 74%);
  --nw-text-muted:      hsl(214 13% 60%);   /* SUPERSEDED — shipped 63.6%, see §10 */
  --nw-text-faint:      hsl(215 11% 46%);   /* SUPERSEDED — shipped 59.8%, see §10 */
  --nw-text-invert:     hsl(216 32% 9%);

  --nw-accent:          hsl(211 88% 70%);
  --nw-accent-hover:    hsl(211 90% 80%);
  --nw-accent-soft:     hsl(213 45% 19%);
  --nw-accent-line:     hsl(212 50% 36%);
  --nw-focus:           hsl(211 90% 72%);

  --nw-temp-high:       hsl(24 90% 60%);
  --nw-temp-low:         hsl(203 72% 62%);
  --nw-temp-track:      hsl(215 18% 26%);

  --nw-precip:          hsl(199 84% 58%);
  --nw-precip-soft:     hsl(200 55% 18%);

  --nw-uv-low:          hsl(150 52% 48%);
  --nw-uv-moderate:     hsl(48 90% 55%);
  --nw-uv-high:         hsl(28 90% 58%);
  --nw-uv-very-high:    hsl(354 76% 64%);
  --nw-uv-extreme:      hsl(283 62% 68%);

  --nw-shadow-card:     0 1px 2px hsl(216 40% 4% / 0.5);
  --nw-elev-2:          0 4px 16px hsl(216 40% 4% / 0.45);
}
```

### 2.3 Semantic scales (theme-independent; two blocks)

**Air quality** — US EPA AQI bands, matched to the six `category` values the contract allows
(`good`, `moderate`, `unhealthy_sensitive`, `unhealthy`, `very_unhealthy`, `hazardous`). Note the
current `aqiColorClass()` map in `app.js` omits `unhealthy_sensitive`; that is a bug and is fixed by
this table.

```css
:root {
  --nw-aqi-good:                hsl(150 62% 32%);  /* ≈ #1F9257 */
  --nw-aqi-moderate:            hsl(43 92% 40%);   /* ≈ #B77A0C */
  --nw-aqi-unhealthy-sensitive: hsl(24 90% 45%);   /* ≈ #D6600E */
  --nw-aqi-unhealthy:           hsl(2 74% 50%);    /* ≈ #D62E2C */
  --nw-aqi-very-unhealthy:      hsl(318 60% 44%);  /* ≈ #B73385 */
  --nw-aqi-hazardous:           hsl(283 56% 48%);  /* ≈ #8B45B8 */
}
.theme-dark {
  --nw-aqi-good:                hsl(150 52% 50%);
  --nw-aqi-moderate:            hsl(43 92% 58%);
  --nw-aqi-unhealthy-sensitive: hsl(24 92% 60%);
  --nw-aqi-unhealthy:           hsl(2 78% 64%);
  --nw-aqi-very-unhealthy:      hsl(318 68% 66%);
  --nw-aqi-hazardous:           hsl(283 64% 70%);
}
```

**Alert severity** — a 4px left rule plus a 1px tint, never a full saturated fill.

```css
:root {
  --nw-sev-minor:    hsl(214 18% 52%);
  --nw-sev-moderate: hsl(43 92% 42%);
  --nw-sev-severe:   hsl(8 76% 48%);
  --nw-sev-extreme:  hsl(283 60% 45%);
  --nw-sev-tint:     hsl(0 0% 100% / 0.04);   /* card fill behind the rule */
}
```

### 2.4 Focus

```css
--nw-focus-ring: 0 0 0 2px var(--nw-page), 0 0 0 4px var(--nw-focus);
```

Applied via `:focus-visible { outline: 2px solid var(--nw-focus); outline-offset: 2px; }` — keep the
existing global rule, retint it. The two-tone ring (page-coloured inner, accent outer) is preferred on
inputs and the layer switcher.

---

## 3. Type, space, radius, elevation

### 3.1 Type scale — IBM Plex, three cuts, split by role

The stack is no longer Inter. The direction is an **instrument panel**, and an instrument has
two registers: language and readout. So the type is split by role.

```css
:root {
  --nw-font:      'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --nw-font-cond: 'IBM Plex Sans Condensed', 'IBM Plex Sans', system-ui, sans-serif;
  --nw-font-num:  'IBM Plex Mono', ui-monospace, 'SF Mono', 'Cascadia Mono', monospace;

  /* Tracking is a register, not a decoration. Applied to LABELS only. */
  --nw-track-label: 0.09em;   /* engraved panel labels                     */
  --nw-track-micro: 0.14em;   /* badges, provenance                        */
  --nw-track-read: -0.02em;   /* the hero readout; large mono needs pulling in */

  --nw-text-display: clamp(4.25rem, 11vw, 8rem);  /* the one hero number      */
  --nw-text-h1:      1.5rem;      /* 24px  page/location title            */
  --nw-text-h2:      0.875rem;    /* 14px  SECTION TITLE, uppercase      */
  --nw-text-h3:      1.0625rem;  /* 17px  sub-block heading              */
  --nw-font-body:    0.9375rem;  /* 15px  default                        */
  --nw-text-sm:      0.8125rem;  /* 13px  values, dense rows             */
  --nw-text-xs:      0.6875rem;  /* 11px  unit suffix, meta, labels      */
  --nw-text-label:   0.6875rem;  /* 11px  definition-list labels         */

  --nw-lh-tight: 1;
  --nw-lh-snug:  1.2;
  --nw-lh-body:  1.5;
}
```

**The split, and why each cut exists:**

| cut | carries | why |
|---|---|---|
| **Plex Sans** | headings, prose, controls | engineered and slightly technical, without being a default UI face |
| **Plex Sans Condensed** | every letterspaced label | tracking *adds* width; the condensed cut takes it straight back, which is what lets `CHANCE OF PRECIPITATION` fit a 58px column |
| **Plex Mono** | **every number on the page** | a monospace figure is inherently tabular, so column alignment is structural rather than a font feature that can be lost |

**Never track a number.** `--nw-track-read` is *negative* and the label tracks are positive,
because tracking a figure destroys the very alignment mono is there to provide. Labels tracked,
numbers not, is the whole rule.

**Mono is wider than the proportional face it replaced, and the fixed tracks on this page are
load-bearing.** The one cell that genuinely broke was `.daily-sun` — a 110px track holding two
times. It is now **24-hour** (`↑07:39 ↓19:47`, 13 characters — the form an earlier version of this line showed,
  `↑07:39 ↓1947`, is 12 characters and is the 12-hour shape this replaced) because the row already says which
day, so AM/PM is redundant; the 12-hour form was 19 characters (~125px at the mono advance) and
ran under the next column, since a grid item does not clip by default. The details grid and the
hourly strip keep 12-hour: they are labelled single-value cells with room to spare, where
"7:39 AM" is the more readable shape.

```css
.h-section-title {
  font: 700 var(--nw-text-h2)/var(--nw-lh-body) var(--nw-font-cond);
  text-transform: uppercase;
  letter-spacing: var(--nw-track-label);
  color: var(--nw-text-muted);
}
```

### 3.2 Spacing scale

4px base. **Only** these steps may be used.

```css
:root {
  --nw-1:  2px;   --nw-2:  4px;   --nw-3:  8px;   --nw-4:  12px;
  --nw-5:  16px;  --nw-6:  20px;  --nw-7:  24px;  --nw-8:  32px;
  --nw-9:  40px;  --nw-10: 56px;  --nw-11: 72px;
}
```

Vertical rhythm: sections are separated by `--nw-9` (40px) on desktop, `--nw-7` (24px) on mobile.
Inside a card: `--nw-6` (20px) padding, `--nw-4` (12px) row gap, `--nw-3` (8px) within a row.

### 3.3 Radius scale

Flat. Nothing above 8px except pills.

```css
:root {
  --nw-r-xs:  2px;   /* inline chips, keycaps            */
  --nw-r-sm:  3px;   /* inputs, small buttons            */
  --nw-r-md:  4px;   /* cards, panels                    */
  --nw-r-lg:  6px;   /* popovers, the search results box */
  --nw-r-pill: 999px;/* layer switcher pills, status dots */
}
```

### 3.4 Elevation

Exactly two levels, both nearly invisible.

```css
:root {
  --nw-elev-0: none;                                        /* flat, on-page */
  --nw-elev-1: 0 1px 2px hsl(215 30% 20% / 0.06);           /* cards, default */
  --nw-elev-2: 0 6px 24px hsl(215 30% 20% / 0.12);          /* popovers only  */
}
```

`--nw-elev-1` is a hairline shadow, not a float. Remove it entirely at `≥1200px` where the 1px border
is enough.

### 3.5 Layout tokens

```css
:root {
  --nw-container: 1280px;
  --nw-gutter:    var(--nw-7);   /* 24px desktop · 16px tablet · 8px mobile */
  --nw-section-gap: var(--nw-9);
}
```

### 3.6 Atmosphere — three layers, all BEHIND content

This is the layer that turns a flat forecast page into a machined one. The
constraint that shapes all of it: **every text pair on this page has been solved
to ≥4.5:1, and anything painted over text eats into that margin on all of them.**
So the atmosphere goes behind.

```css
body {
  isolation: isolate;                 /* so body::before is its own layer */
  background-color: var(--nw-page);
  background-image:
    radial-gradient(120% 80% at 12% -10%, var(--nw-mesh-1), transparent 60%),
    radial-gradient(100% 70% at 92% 4%,   var(--nw-mesh-2), transparent 55%),
    radial-gradient(140% 90% at 50% 108%, var(--nw-mesh-3), transparent 65%),
    linear-gradient(var(--nw-grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--nw-grid-line) 1px, transparent 1px);
  background-size:
    100% 100%, 100% 100%, 100% 100%,
    var(--nw-grid-pitch) var(--nw-grid-pitch), var(--nw-grid-pitch) var(--nw-grid-pitch);
  background-attachment: fixed;       /* all five */
}
body::before {                        /* the grain */
  content: '';
  position: fixed; inset: 0;
  z-index: -1;                        /* BEHIND content */
  pointer-events: none;
  opacity: var(--nw-grain-opacity);
  background-image: var(--nw-grain);
  background-size: 180px 180px;
}
```

| token | light | dark | role |
|---|---|---|---|
| `--nw-grid-pitch` | 4px | 4px | the drafting-paper substrate |
| `--nw-grid-line` | `hsl(215 30% 30% / .028)` | `hsl(210 40% 80% / .030)` | ~1% hairlines: structure, not pattern |
| `--nw-mesh-1..3` | .04–.05 alpha | .07–.10 alpha | panel glass catching room light |
| `--nw-grain` | inline SVG `feTurbulence` | same tile | film grain |
| `--nw-grain-opacity` | 0.5 | 0.85 | see below |
| `--nw-tick-pitch` | 8px | 8px | the gauge scale under the hero readout |
| `--nw-notch` | 7px | 7px | the bezel's corner chamfer |
| `--nw-sheen` | `hsl(0 0% 100% / .6)` | `hsl(210 60% 80% / .05)` | the plate's top highlight |

**Dark turns the atmosphere UP, not down.** A 4% wash on a near-black page is
invisible; on white it was already 4%. Dark needs roughly double, and its grain
is brighter and *lower*-opacity, because a light speckle on black is visible
texture where the light theme needs the same *perceived* strength.

**`--nw-grain` is an inline SVG data URI, not a request.** 400 bytes, no network,
cannot 404, and the alpha is baked into `feColorMatrix` so one token controls it
in both themes.

**The sheen is a `background-image`, never a positioned `::before`.** This is not
a style preference. A positioned pseudo-element paints in the positioned layer —
*above* the panel's own static text — and at 60% white it washed out the top 42%
of every panel. A background-image is behind the text by construction. The
chamfer stays in the `::before` because it is a 1px line inside the 16px padding
and cannot reach a glyph.

**Print takes all of it to zero.** A forecast page is printed to be carried
outside; ink is precious and grain is not worth a cartridge. Every mesh, the
grid, the grain, the sheen and the plate shadow are `transparent` / `none` in
`@media print`, and `.panel::before`'s chamfer is cleared too (a white-to-
transparent gradient printed with "Background graphics" on puts a grey band
across the top third of every panel). The one thing that survives is the gauge
tick scale under the hero readout, because that is 1px of ink the reader spends on
something.

### 3.7 The bezel

A panel is an instrument face, so it gets a machined edge: a **chamfered top-left
corner**, drawn as a diagonal hairline meeting the border exactly at the radius.

```css
.panel { position: relative; }
.panel::before {
  content: '';
  position: absolute; inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(225deg,
    transparent var(--nw-notch),
    var(--nw-border) var(--nw-notch),
    var(--nw-border) calc(var(--nw-notch) + 1px),
    transparent calc(var(--nw-notch) + 1px));
}
```

**A gradient, not `clip-path`.** A clip-path notch removes the corner pixels — and
the 1px border is drawn on those pixels, so the notch would have a transparent gap
in it and the panel would appear to leak. A gradient keeps the border continuous.
`content: ''` means it is also empty, so it exposes nothing to the accessibility
tree.

### 3.8 The gauge readout

The hero temperature is the one number the page exists to show, so it is built as
a gauge face rather than as a heading: **mono** (fixed pitch, so a re-render never
shifts it), **weight 400** (Plex Mono gets heavy fast), and **negative tracking**
(mono at 8rem is much wider than a proportional face and untracked it overhangs
its box).

```css
.current-temp { letter-spacing: var(--nw-track-read); display: inline-block; }
.current-temp::after {                   /* the calibration scale */
  content: '';
  display: block; height: 7px; margin-top: var(--nw-2);
  background-image: repeating-linear-gradient(to right,
    var(--nw-border-strong) 0 1px, transparent 1px var(--nw-tick-pitch, 8px));
  mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent);
}
```

The scale is `aria-hidden` by construction (an empty pseudo-element announces
nothing) and carries no information. It is there because a gauge has a scale, and
its presence is what makes the number read as a *measurement* rather than a
headline. The mask fades both ends so it reads as a calibrated edge rather than a
dashed border someone forgot to finish.

---

## 4. Page architecture

```
<body>
  #skip-link                          → "Skip to forecast"
  header#site-header                  → masthead (sticky)
  #locations-bar                      → featured city strip
  main#main
    #empty-state                      → pre-selection state
    div#forecast
      #alerts                         → alert band (conditional)
      #insights                       → insights band (conditional)
      section#section-current         → Today's Weather
      section#section-hourly          → Hourly Forecast
      section#section-daily           → 7-Day / 14-Day Forecast
      section#section-map             → Weather Radar & Maps  (full-bleed)
      section#section-details         → Current Weather Details
      div#section-pair                → Air Quality ‖ Astronomy
        section#section-air-quality
        section#section-astronomy
  footer#site-footer
  #jump-bar                          → mobile-only section jump nav
  #live-status                       → sr-only role="status" live region
```

**Rule:** `#forecast` is a plain `display: flex; flex-direction: column; gap: var(--nw-section-gap)`.
No grid, no column splitting, no `display:none` toggling. Everything scrolls. `#section-pair` is the
only side-by-side arrangement and it collapses to one column below 900px.

### 4.1 Why Insights sits above Today's Weather

An insight with `priority: "high"` is a generated warning ("flood risk in 3 hours"). Burying it eight
screens down is a functional regression, and `#insights` already sits directly under the hero today.
The band becomes a compact two-column bulleted list rather than a horizontal pill scroller, so long
messages are readable without horizontal scrolling.

---

## 5. Section-by-section specification (DOM order)

Every section is a `<section>` with `aria-labelledby` pointing at its `<h2>`. Section titles are
**uppercase 11–15px tracked** (`--nw-text-h2`), left-aligned, with a hairline rule running to the
right edge and optional meta text pinned to the far right.

---

### 5.0 Header — `#site-header`

Sticky masthead. `position: sticky; top: 0; z-index: 50; background: var(--nw-header);
border-bottom: 1px solid var(--nw-border);`

Desktop (≥900px) — a single 56px-tall flex row:

| Zone | Content | Sizing |
|---|---|---|
| Left | `.brand` — lucide `cloud-sun` 20px in `--nw-accent` + "Nimbus" at `--nw-text-h1` weight 700, plus a `7px` uppercase `--nw-text-faint` tagline "WEATHER" beneath | `flex: 0 0 auto`, `min-width: 168px` |
| Centre | `#search-form` — 40px-tall input, `max-width: 420px`, `flex: 1 1 auto` | see below |
| Right | `#unit-toggle`, `#theme-toggle`, `#notify-toggle` as `.icon-btn` (32×32, `--nw-r-sm`, 1px `--nw-border`), then `#data-source` badge, then `#auto-refresh-label` | `flex: 0 0 auto` |

- **Search field**: `background: var(--nw-surface); border: 1px solid var(--nw-border-input);
  border-radius: var(--nw-r-sm); height: 40px;` Left icon 16px `--nw-text-faint`. `#geo-btn` becomes a
  36×40 ghost button flush to the right inside the same field, separated by a 1px left rule.
- **`#search-results`**: flat dropdown, `background: var(--nw-surface); border: 1px solid
  var(--nw-border-strong); border-radius: var(--nw-r-lg); box-shadow: var(--nw-elev-2); max-height:
  320px;` Rows are 44px, `border-bottom: 1px solid var(--nw-rule)`, hover = `--nw-surface-alt`. No
  blur, no glass.
- **The search field uses `--nw-border-input`, not `--nw-border-strong`.** (The line above
  used to say `--nw-border-strong` here and this line said the opposite, six lines apart in the
  same section — one of the two had to be wrong and the build settles it: `styles.css` uses
  `--nw-border-input` on `.search-field` and nothing else.)
  `--nw-border-strong` measures 1.94:1 in light and 2.34:1 in dark, so on the one
  control whose boundary is the only thing identifying it, the field had no
  perceivable edge. The new token is solved to ≥3:1 (1.4.11) in both themes and is
  used **only** by `.search-field`; the ~12 other `--nw-border-strong` consumers
  are decorative hairlines and must be left alone. The token also needs a print
  override, like every other token re-solved for paper.
- **`#data-source`**: a 20px-tall pill. Live = `--nw-uv-low` text on `--nw-precip-soft`… no — use a
  neutral treatment: live = 1px `--nw-border-strong` + `--nw-text-muted` text; sample = 1px
  `--nw-sev-moderate` + `--nw-sev-moderate` text. Never a green glow.
- **Masthead `flex-wrap` is allowed at 640–899px** (see §8, Tablet), and is
  also allowed below 380px — this line previously claimed it was suppressed
  there, and nothing in the build suppresses it. An earlier version said it "must not
  `flex-wrap` at any width ≥ 380px", which contradicted §8's own Tablet row; §8
  is the one followed, because at tablet width the search field and the five icon
  buttons genuinely do not fit on one line.

**Empty title** — `<title>Nimbus Weather — Local Forecast</title>`, and `document.title` is updated to
`"{high}° {low}° {locationName} — Nimbus Weather"` on every load, or `"{locationName} — Nimbus Weather"`
  when the range is degenerate. "15° 15° Tirana" in a tab strip is a claim, and it is a false one, so
  the pair is dropped rather than repeated. This is a genre convention and the visible half of it is
    free; the conditional is not negotiable.

---

### 5.1 Featured locations — `#locations-bar`

Full-width horizontal strip, one row, **directly under the masthead**, above the alerts.

```
nav#locations-bar  [aria-label="Featured locations"]
  h2.visually-hidden            "Featured locations"
  div#locations  [role=group]   ← existing id, keep it
    button.loc-chip              ← <button>, NOT a listitem
      span.loc-chip-name        city name, --nw-text-sm 600
      span.loc-chip-sub         region, country, --nw-text-xs --nw-text-faint
```

**The chips are buttons, not list items.** An earlier version of this spec called
for `ul[role=list] > li[role=listitem]`, and the code followed it. Each chip is a
single-tab-stop control that changes the loaded location, so it is a `<button>`
and the container is `role="group"`. A list of `li` elements that are not
focusable is a list of things the reader cannot reach.

**The strip is a `<nav>`, not a bare band.** It is a navigation landmark, which
is a real improvement. It does **not**, however, change the heading outline: a
`<nav>` adds a landmark, it does not remove a descendant heading from the
outline, so the measured outline is still `h2 "Featured locations"` / `h2
"Insights"` / `h2 "Today's Weather"` / `h1 "Tirana"`. An earlier version of this
paragraph claimed the `<nav>` fixed the outline; it did not, and no SC requires
`h1` first, so this is a doc-accuracy correction rather than a defect.

**Do not put an `aria-label` on `#locations` as well.** The `<h2>` already names
the group, and both were exposed, so a screen reader announced "Featured
locations" twice before the first city.

- Chip: `flex: 0 0 auto; height: 40px; padding: 0 var(--nw-4); display: inline-flex; align-items:
  center; gap: var(--nw-2);` two-line content is **dropped** — name and region sit on one line
  separated by a `·` at `--nw-text-faint`. This is the single biggest density win in the header area.
- Chip border `1px solid var(--nw-border)`, radius `--nw-r-pill`, `background: var(--nw-surface)`.
- `.loc-chip.active`: `border-color: var(--nw-accent); background: var(--nw-accent-soft); color:
  var(--nw-accent);` plus a 2px `--nw-accent` left cap. No glow.
- `.loc-chip:focus-visible` / hover: `border-color: var(--nw-accent-line)`. **No `transform`.**
- Strip has `overflow-x: auto; scrollbar-width: none;` and a 1px top rule + `--nw-1` bottom padding
  so it reads as a band, not floating pills.
- `#locations-bar` is hidden while a search dropdown is open? No — it stays. Simpler, and it is a
  useful fallback if a search fails.

---

### 5.2 Alerts band — `#alerts`

Flat, full-width, one row per alert. Sits **above everything else** in `#forecast`.

```
#alerts  [role=region aria-label="Active weather alerts"]    ← NOT a live region
  article.alert-item
    span.alert-badge           severity, uppercase 11px, 1px border, radius --nw-r-xs
    div.alert-text
      strong.alert-title       a.title
      p.alert-desc             a.description
      p.alert-window           "10:00 – 15:00 · Wind"  ← startsAt / endsAt / type  (NEW)
      span.alert-source        a.source, --nw-text-xs italic
```

- Container `background: var(--nw-sev-tint); border: 1px solid var(--nw-border);
  border-left: 4px solid var(--nw-sev-<severity>); border-radius: var(--nw-r-md);
  padding: var(--nw-4);`
- `.alert-badge` background is **transparent** with a 1px border in the severity colour and severity
  coloured text. The current solid-red filled badge is too loud and fails against tinted backgrounds.
- Multiple alerts stack with `--nw-2` gap; the whole band is one `role=region`.

**`#alerts` must NOT be a live region.** An earlier version of this spec required
`aria-live="polite"` on it. The band's contents are replaced wholesale on every
load, so a live region re-read the entire alert text to a reader who did nothing
— and the page auto-refreshes every ten minutes, forever. That is an
unskippable recurring interruption, which is the specific harm live regions exist
to avoid.

The single consolidated announcement in `loadWeather` is the only announcing
path, and it is **silent on a background refresh** unless the alert *count*
changed. That `silent` guard must be threaded into the **error** path too: a
failed background poll that fell through to the full error treatment blanked
eight sections and re-announced, every ten minutes, while the API was down.
A failed background poll now shows a quiet inline note, keeps the last good
forecast, does not toast or announce, and does not re-arm the timer.
- Layout: badge is a fixed 88px column on desktop; below 640px the badge sits inline above the title.

---

### 5.3 Insights band — `#insights`

```
#insights  [hidden when empty]
  ul.insight-list  [role=list]
    li.insight-item  [role=listitem]  data-priority=high|medium|low
      span.insight-icon         lucide, 16px, priority colour
      div.insight-body
        p.insight-msg          ins.message
        ul.insight-evidence     ← ins.evidence[]  (NEW — currently discarded)
          li                   one string per item, --nw-text-xs --nw-text-faint
```

- Layout: `display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: var(--nw-3) var(--nw-7);`
  at ≥900px, one column below. **Not** a horizontal scroller — messages are sentences, not tokens.
- `data-priority` drives only the icon colour and a 3px left rule: high = `--nw-sev-severe`, medium =
  `--nw-sev-moderate`, low = `--nw-accent-line`.
- `ins.category` is rendered as a 11px uppercase kicker above the message (`PRECIPITATION`, `UV`,
  `WIND`, …). Currently unused — add it.
- `ins.id` becomes the element id: `id="insight-<id>"`.

---

### 5.4 Today's Weather — `#section-current`

The hero, rebuilt as a *typographic* block rather than a card. No gradient, no glow, no bounce.

```
section#section-current
  h2#current-heading            "Today's Weather"   [visually-hidden is WRONG — show it]
  div#current-place
    h1#current-location         location name, --nw-text-h1 700
    p#current-region            "region, country", --nw-text-sm --nw-text-muted
    p#current-timezone          "Local time 14:32 (Europe/Tirana)"  (NEW — location.timezone)
  p#current-observed            "As of 14:30"  ← current.observedAt (NEW wording)
  div#current-block
    div#current-icon            lucide, 96px, --nw-temp-high
    div#current-temp-wrap
      p#current-temp            current.temperature + unit, --nw-text-display 300
      p#current-condition       current.conditionText, --nw-text-h3 500
  ul#current-facts  [role=list]
    li.fact  [role=listitem]
      span.fact-label          "Feels like" / "High" / "Low"
      span.fact-value          num
```

**Layout**

- Desktop: a 12-column grid, `grid-template-columns: 300px minmax(0,1fr) auto; gap: var(--nw-7);
  align-items: start;` — place block left, temperature block centre, facts right. The temperature
  block is what the eye lands on because the place block is small and grey.
- The three facts sit on **one horizontal line**, separated by a 1px vertical rule each:
  `Feels like 18° · High 24° · Low 15°`. Each fact is a `dl`-style pair, label above value,
  `gap: var(--nw-2)`, `padding-inline: var(--nw-6)` with `border-left: 1px solid var(--nw-rule)` on
  all but the first.
- **High and Low come from `daily[0].high` and `daily[0].low`.** There is no current high/low in the
  contract — do not invent one. If `daily` is empty, render "High —" and "Low —".
- `#current-icon` is 96px, `stroke-width: 1.75`, colour `--nw-temp-high`. Tinted per condition via
  a `[data-condition]` attribute: clear → `--nw-uv-moderate`; rain/thunderstorm → `--nw-precip`;
  snow/sleet → `--nw-precip`; fog/cloudy → `--nw-text-muted`.
- `#current-observed` also carries a `datetime` attribute of the raw `observedAt` ISO string.
- The section has **no card border and no shadow** — it is page content, not a widget. It gets a
  `border-bottom: 1px solid var(--nw-border-strong)` and `--nw-7` bottom padding, which is what makes
  the page read as a document.
- Error state: on fetch failure, `#current-temp` becomes "—", `#current-condition` becomes the error
  message, and an `.inline-error` note with a "Retry" button appears after it. The current code writes
  the raw error string into the condition slot, which reads as a crash.

---

### 5.5 Hourly Forecast — `#section-hourly`

Two stacked pieces inside one card: a slim temperature curve, then the scrolling column strip. This is
the genre convention and it is also the only way to keep the existing SVG work.

```
section#section-hourly
  h2#hourly-heading
    "Hourly Forecast"
    span#hourly-step             "Every 3 hours"      (keep detectStepHours/stepLabel)
    span#hourly-range            "16° – 24°"          (NEW — min/max of the window)
  div#hourly-chart-wrap
    svg#hourly-chart  [role=img aria-label=…]          ← the existing SVG, restyled
  div#hourly-scroll  [tabindex=0 role=region aria-label="Hourly forecast, scrollable"]
    ul#hourly  [role=list]                            ← existing id, keep it
      li.hour-col  [role=listitem]  data-now=true when the slot IS the current hour
        span.hour-time             "2pm"  (or "Now", conditionally — see below)
        span.hour-icon             lucide 24px
        span.hour-temp             21°     num
        span.hour-pop              40%     colour --nw-precip; empty when 0
```

**The SVG curve — restyle, do not rewrite geometry**

`renderHourly()`'s maths (padding the min/max span, `labelEvery`, unit-converted axis labels) is
correct and should be kept exactly. Change only:

| Property | New value |
|---|---|
| `#hourly-chart` height | 96px total (`padTop` 18, `plotHeight` 54, `padBottom` 24) — a sparkline, not a chart |
| `.chart-line` stroke | `var(--nw-temp-high)`, `stroke-width: 2`, `stroke-linecap: round` |
| `.chart-area` fill | `var(--nw-precip-soft)` at `0.55` — flat tint, **remove the `<linearGradient>` def** |
| `.chart-point` | `r: 2.5`, `fill: var(--nw-surface)`, `stroke: var(--nw-temp-high)`, `stroke-width: 2` |
| `.chart-precip-bar` | `fill: var(--nw-precip)`, `opacity: 0.22`, `rx: 1`, `width: 3` |
| `.chart-grid` | `stroke: var(--nw-rule)`, `opacity: 1`, only 2 lines (0 and 1) not 3 |
| `.chart-axis-label` | `font-size: 9px`, `fill: var(--nw-text-faint)`, positioned at the top and bottom only |
| `.chart-time-label` | **delete** — time now lives in the column strip, so the axis carries no x labels |
| `.chart-temp-label` | **delete** — temperature now lives in the column strip, so the line is unlabelled |

Deleting the two label layers is what turns a chart into a trend line, and it stops the strip below
from duplicating the same numbers twice.

- `svg` gets `width: 100%` via `preserveAspectRatio="none"` — **no**, do not. Keep the fixed-width
  scrolling SVG; it aligns 1:1 with the column strip below only if both use the same `pointWidth`
  (58px). Set `--nw-hour-col-w: 58px` and have both the SVG and the CSS columns read it, so a
  temperature label and its column are pixel-aligned. This is the detail that makes it look designed.
- `#hourly` becomes `display: flex;` (NOT a chart container any more) with `overflow-x: auto` on the
  parent `#hourly-scroll`. The current `role="img"` on `#hourly` moves to `#hourly-chart`.
- `#hourly-scroll` needs `tabindex="0"` — a horizontally scrollable region must be keyboard-focusable,
  and this is missing today.
- `.hour-col` is a fixed `width: var(--nw-hour-col-w); display: flex; flex-direction: column;
  align-items: center; gap: var(--nw-2); padding: var(--nw-3) 0;` with
  `border-left: 1px solid var(--nw-rule)` so the columns read as a table. The first column drops the
  left border.
- `.hour-col[data-now="true"]` gets `background: var(--nw-surface-sunken);` and a
  `.hour-time` reading **"Now"** at `--nw-accent` weight 700 — this is the genre convention and it
  tells the reader where the forecast stops and observation starts.
- Time labels: use `formatHour()` (`12am`, `9am`). The "Now" label and the
  `data-now` attribute are both **conditional on the slot actually being the
  current hour**, matched on the date/time key rather than on index 0.

  **Two corrections to an earlier version of this spec, which prescribed the
  label unconditionally:**

  1. `/forecast` returns 3-hour buckets, so the first slot is up to 2 h 59 m
     *ahead* of now. Labelling it "Now" claims an observation the page does not
     have. It is labelled "Now" only when it falls within 30 minutes. In practice,
     with a 3-hour step, that means it is **never** labelled — and that is the
     correct outcome, not a bug.
  2. `data-now`/`data-today` must match the **date/time key**, not index 0. A
     payload bucketed in UTC puts index 0 on yesterday for any location west of
     it, so index-0 matching highlighted the wrong column and the wrong day row.

  The 1px `--nw-border-strong` divider column between "Now" and the first
  forecast hour is likewise conditional on the label actually being present —
  an unconditional divider puts a strong rule between two ordinary forecast
  hours, with no meaning.

**Fields surfaced in the strip that have no visual slot yet** (must be added, per requirement 5):

- `hourly[].feelsLike` → a `span.hour-feels` shown **only when `|feelsLike − temperature| ≥ 2`**,
  `--nw-text-xs --nw-text-faint`, formatted `feels 18°`. Rendered under the temperature.
- `hourly[].precipitationMm` → a `span.hour-mm` shown **only when `precipitationMm > 0`**, under the
  PoP. It renders the **bare number** with the unit in a `visually-hidden` " millimetres" span, not a
  visible `0.4mm`. A suffix did not fit the 58px track beside the other slots; the trade is that a
  sighted reader sees an unlabelled number and only AT gets the unit. If the track ever grows, put
  the `mm` back visibly — a number whose unit only exists for screen readers is a real gap.
- `hourly[].windSpeed` + `windDirection` → **not** per-column. Too dense at 58px. These are
  summarised once, in the section meta line, as `#hourly-wind`:
  `"Wind 12–24 km/h W → NNE"`. This satisfies the "every field must be shown" requirement without
  wrecking the column. **Both directions are nullable**, so the label drops the `W → NNE` clause
  entirely rather than printing `"— → —"`; a bearing with no reading is not a bearing.
- `hourly[].uvIndex` → a `span.hour-uv` on the column, shown when `uvIndex ≥ 6`, 11px, colour from the
  UV scale. The **bare number** with a `visually-hidden` "UV index " prefix — not an `↑6` glyph. The slot is
  **always emitted**; when the value is null it renders empty with `visibility: hidden`.
  Omitting it is the defect this build had already fixed — it made `.hour-col` hold six children
  on UV-less bundles and seven on the rest, so each cell sized itself and the figures lost
  their common baselines.

  **`uvIndex` is nullable and `/forecast` never populates it.** The slot is
  rendered empty via `visibility: hidden` — the slot is always emitted, because omitting it
  collapsed the columns — and every client must test `== null` rather
  than truthiness or `?? 0`. A default of 0 printed "UV 0.0" in a reassuring
  green band — a fabricated measurement carrying a health rating. The same
  applies to `current.uvIndex`, `current.dewPoint` and `current.windGust`.

---

### 5.6 Daily Forecast — `#section-daily`

A table, not a card grid. This is the densest section in the genre and the current list wastes ~40% of
its horizontal space.

```
section#section-daily
  h2#daily-heading
    "7-Day Forecast"                     ← or "14-Day" when daily.length > 7
  div#daily-scroll
    ul#daily  [role=list]                 ← existing id, keep it
      li.daily-row  [role=listitem]  data-today=true on the row for TODAY
        span.daily-day      "Today" / "Fri"         96px
        span.daily-icon     lucide 24px             32px
        span.daily-moon     phaseGlyph() SVG 14px   18px
        span.daily-desc     condition text          1fr, truncate
        span.daily-aqi      "AQI 50"                64px
        span.daily-sun      "↑06:12 ↓20:04"         110px
        span.daily-pop      "40%"  right-aligned     44px
        div.daily-bar-wrap   88px
          div.daily-bar
            div.daily-bar-range   positioned min→max
            div.daily-bar-now     2px current-temp marker (today only)
        span.daily-lo        "15°"   right 44px
        span.daily-hi        "24°"   right 48px, --nw-temp-high
```

**Ten tracks, not eight.** The grid is
`96px 32px 18px minmax(0,1fr) 64px 110px 44px 88px 44px 48px`. An earlier version of
this spec listed eight tracks and the code was built to it, which meant the moon
phase and the AQI cell had nowhere to go.

**Track count must equal placed item count at every breakpoint**, or
auto-placement spills the last item onto an implicit row and the row's
`border-bottom` draws a rule through the middle of it. The count legitimately
*changes* per breakpoint because items are hidden, and the hidden ones go with
their tracks:

| breakpoint | tracks | items | note |
|---|---|---|---|
| ≥900px | 10 | 10 | all present |
| 640–899 | 9 | 9 | `.daily-sun` hidden |
| ≤639 | 6 | 6 | `.daily-sun`, `.daily-moon`, `.daily-bar-wrap`, `.daily-aqi` hidden |
| ≤380 | 6 | 6 | as ≤639 |

**`#daily-range-legend` is deleted.** It was an orphaned `aria-hidden` bar
labelling a range that the bar itself already announced, and it had two writers
that could disagree with the markup.

**`data-today` matches the date key, not index 0** — see the note in §5.5.

- Row height `44px`, `align-items: center; column-gap: var(--nw-4); padding: 0 var(--nw-4);` with
  the ten-column template given above.
- Zebra: `nth-child(odd) { background: var(--nw-surface-alt) }` — a 1.5% tint, not a full surface swap.
- **Row separators, not gaps.** `border-bottom: 1px solid var(--nw-rule)` on every row; the list has
  no internal gaps. The last row's border is removed. This is the single biggest shift toward
  "professional data page".
- **The range bar is new and is the signature element of this section.** Compute
  `weekMin = min(daily[].low)`, `weekMax = max(daily[].high)`. Each row's bar is a 4px-tall
  `--nw-temp-track` track with an inner `.daily-bar-range` positioned `left: p1%; width: p2%` where
  `p1 = (low − weekMin) / (weekMax − weekMin) * 100` and `p2 = (high − weekMin) / (weekMax − weekMin) * 100`,
  clamped to `[0,100]`, filled with a 2-stop `linear-gradient(90deg, var(--nw-temp-low),
  var(--nw-temp-high))`. On row 0 only, overlay a 2px `--nw-text` tick at
  `(current.temperature − weekMin) / (weekMax − weekMin) * 100`.
  Guard `weekMax − weekMin < 1` → render a full-width 20% centred bar.
- The high/low are **not** a gradient text fill. `.daily-lo` is `--nw-text-muted`,
  `.daily-hi` is `--nw-temp-high`, both 600 weight tabular.
- Pop is suppressed entirely when `0` — an empty cell is quieter than a grey `0%`.
- `.daily-sun` is `#E09A2C`→`var(--nw-temp-high)` at 11px; on mobile it is removed (see 5.11).
- `.daily-desc` uses `d.conditionText`-equivalent: title-case `d.condition.replace('_',' ')` as today,
  with `text-overflow: ellipsis`.
- **Section title is computed from `daily.length`**: 7 → "7-Day Forecast", 14 → "14-Day Forecast".
  The OpenWeatherMap free tier returns 7, the sample provider 14.
- `row role`: `#daily` keeps `role="list"`, each row `role="listitem"`. Rows are
  named with `visually-hidden` prefixes inside each cell, **not** with an
  `aria-label` on the row.

  **Retracting the `aria-label` prescription.** An earlier version of this spec
  required a synthesised sentence per row on the premise that ARIA forbids naming
  a `listitem`. That prohibition is from ARIA **1.1**; 1.2 lifted it, and the
  same correction was already applied to the hourly strip. More to the point, an
  `aria-label` on a `listitem` **replaces** its contents for the accessibility
  tree, so the visually-hidden prefixes inside it become unreachable and the row
  is announced once with a summary instead. The prefixes are the honest version:
  each value is preceded by its own name, and nothing is hidden from anyone.

---

### 5.7 Weather Radar & Maps — `#section-map`

The globe's replacement as the page's "big visual". Full-bleed on desktop, edge-to-edge.

```
section#section-map
  h2#map-heading
    "Weather Radar & Maps"
    span#map-layer-refresh                 "Radar · updates every 10 min"  (NEW)
  div#map-stage
    div#weather-map                       Leaflet container
    div#map-layer-switch  [role=group aria-label="Map layer"]
      button.map-layer-btn  [aria-pressed]
  div#map-caption                        "Radar, 10-minute animation · © OpenStreetMap, © OpenWeatherMap"
```

- **Full-bleed rule (desktop ≥900px):** the section's inner content escapes the container.
  `--nw-vw: calc(100vw - var(--nw-sb, 0px)); width: var(--nw-vw); margin-inline: calc(50% - var(--nw-vw) / 2);`
  on `#map-stage`, with `overflow-x: clip` on the
  page root to kill the scrollbar. The `<h2>` stays inside the container so the heading still aligns
  with every other section title — only the map itself is full-width.

  **Both the width and the margin need the scrollbar correction, not just the
  width.** `100vw` includes the scrollbar gutter, which `100%` does not. An
  earlier version corrected only `width`, which moved the defect from "cropped at
  both edges" to "cropped on the left, gap on the right". `--nw-sb` is published
  from a `ResizeObserver` on `document.documentElement`, because the first paint
  has no scrollbar and a one-shot measurement on `DOMContentLoaded` is stale
  until something resizes. There is no feedback loop: changing `--nw-sb` alters
  `#map-stage`'s width, which cannot change `html`'s content-box size.

  **Tablet and Mobile are not full-bleed**, which follows §5.7's "≥900px" and
  contradicts the Tablet and Mobile rows of §8. §5.7 is followed.
- `#weather-map` height: `480px` desktop, `360px` tablet, `280px` mobile. `border: 1px solid
  var(--nw-border); border-radius: var(--nw-r-md);` — rounded corners on the map, not a bleed of raw
  tiles. Above the tiles sits a 1px inner ring (`box-shadow: inset 0 0 0 1px var(--nw-border-strong)`)
  so the tile edge reads as framed.
- **Layer switcher is a floating segmented control pinned to the top-left inside the map**, not a bar
  above it. `position: absolute; top: var(--nw-4); left: var(--nw-4); z-index: 500;` (above Leaflet's
  z-index 400 panes).
  - Container: `background: var(--nw-surface); border: 1px solid var(--nw-border-strong);
    border-radius: var(--nw-r-pill); padding: var(--nw-1); box-shadow: var(--nw-elev-1);
    display: flex; gap: var(--nw-1); max-width: calc(100% - var(--nw-8)); overflow-x: auto;`
  - Button: `height: 28px; padding: 0 var(--nw-4); border-radius: var(--nw-r-pill);
    font: 600 var(--nw-text-xs)/1 var(--nw-font); color: var(--nw-text-muted); border: none;
    background: none; white-space: nowrap;`
  - `[aria-pressed="true"]`: `background: var(--nw-accent); color: var(--nw-text-invert);`
  - **At ≤640px the switcher moves to full-width just below the map** as a horizontally scrollable
    pill row, because 7 layer names cannot fit over a 280px map.
- **Layer list is data-driven from `mapLayers[]`**, which is correct today. Additions:
  - `l.opacity` is applied to the tile layer (`opacity: l.opacity` — currently hard-coded `0.7`).
  - `l.refreshSeconds` renders into `#map-layer-refresh` as `"updates every N min"`, using the
    **active** layer's value and updating on switch.
  - `l.name` is the button label (already the case). `l.id` is the value key (already the case).
- Add a **`#map-opacity` range input** (`<input type="range" min="0" max="100" value="…">`, 96px wide,
  labelled "Layer opacity") inside the switcher container, right of a 1px vertical rule. It is
  `aria-label="Layer opacity"`, **24px** tall (2.5.8 minimum target size), accent-color `var(--nw-accent)`. This is the one piece of
  real map UI this page was missing.
- A **"Centre on location" button** `#map-recentre` (lucide `locate-fixed`, 32×32, bottom-right of the
  map) calls `leafletMap.setView([lat, lon], 7)`.
- `#map-caption` sits under the map, `--nw-text-xs --nw-text-faint`, left-aligned, and carries the
  full attribution (Leaflet needs it visible, not collapsed).
- `leafletMap.invalidateSize()` must be called on mount **and** on any container resize. Because the
  map is no longer behind a tab, it initialises on first paint — call it after the DOM is laid out
  with `requestAnimationFrame`, not `setTimeout(…, 50)`.

---

### 5.8 Current Weather Details — `#section-details`

A dense definition grid. This is the section that most directly replaces the "Atmosphere" bar chart.

```
section#section-details
  h2#details-heading      "Current Weather Details"
  dl#details
    div.detail-cell
      dt.detail-label      "Feels like"          (icon optional, 14px, --nw-text-faint)
      dd.detail-value      "18°"
    …
```

- **Semantic, not `div`s.** `<dl>` / `<dt>` / `<dd>` with each cell as a wrapper `<div>` (valid HTML5
  and better than the current label/span pairs).
- Grid: `display: grid; grid-template-columns: repeat(3, minmax(0,1fr));` at ≥1200px,
  `repeat(2, minmax(0,1fr))` at 640–1199px, `1fr` below 640px.
- Cell: `padding: var(--nw-4) var(--nw-5); border-bottom: 1px solid var(--nw-rule);`
  `border-right: 1px solid var(--nw-rule);` (strip the right rule on the last column in each row via
  `:nth-child(3n) { border-right: none }` at 3-col, `:nth-child(2n)` at 2-col).

  **The right-rule rules need a terminal case, and the bottom rule needs a
  derived one.** There are exactly **15** cells, so the last row's width is
  `items % cols` — or `cols` when that is 0. It is *not* the column count:

  | cols | 15 % cols | last row | rule |
  |---|---|---|---|
  | 3 | 0 | 3 wide | `:nth-last-child(-n + 3) { border-bottom: none }` |
  | 2 | 1 | 1 wide | `:nth-last-child(-n + 1) { border-bottom: none }` |
  | 1 | 0 | 1 wide | `:last-child { border-bottom: none }` |

  Deriving this from the column count instead is a live bug: a
  `--details-cols: 2` variable would strip cell 14's separator too, leaving no
  rule between the Moon-phase and Daylight rows. Each breakpoint therefore
  carries its own literal. The 2-column band also needs
  `.detail-cell:last-child { border-right: none }`, because cell 15 is odd *and*
  a multiple of 3 — `:nth-child(3n)` matches it and `:nth-child(2n)` does not, so
  it otherwise keeps a right rule while sitting alone in column 1.

- The 3px left colour cap is drawn with `box-shadow: inset 3px 0 0 var(--uv, transparent)`,
  **not** `border-left: 3px solid transparent`. A border participates in layout,
  which put column 1's labels 3px right of the identical labels in columns 2 and 3
  — a ragged left edge in a grid whose premise is alignment.
- `dd.detail-value` is `--nw-text-sm` 600 tabular, right-aligned? No — **left-aligned**, directly under
  its label. Right-aligning breaks the label/value association across a wide grid. Reserve
  right-alignment for the daily list only, where the eye reads a numeric column.
- Rows are ordered by reading importance, and each may carry a 3px left colour cap in
  `--nw-text-faint` that turns semantic only where the value warrants it (UV, AQI).

**Cell contents, in order (this is the canonical order):**

| # | `dt` label | Source field | Display format |
|---|---|---|---|
| 1 | Feels like | `current.feelsLike` | `18°` |
| 2 | Dew point | `current.dewPoint` | `11°` (— if **null**) |
| 3 | Humidity | `current.humidity` | `64%` |
| 4 | Wind | `current.windSpeed`, `windDirection` | `14 km/h` + `WSW`; a 14px lucide `arrow-up` rotated `deg` is `aria-hidden` decoration to the left of the cardinal |
| 5 | Wind gust | `current.windGust` | `28 km/h` |
| 6 | Pressure | `current.pressure` | `1013 hPa` (1 decimal if fractional) |
| 7 | Visibility | `current.visibility` | `10 km` (switch to `mi` when `state.unit === 'F'` — 4 lines of code, and the genre convention) |
| 8 | Cloud cover | `current.cloudCoverage` | `40%` |
| 9 | UV index | `current.uvIndex` | `5` + the word `Moderate`, `dt` label tinted with the UV scale colour |
| 10 | Observed | `current.observedAt` | `14:30, 29 Sep` (moved out of the hero? No — keep in hero; here show the full date) |
| 11 | Sunrise | `astronomy.sunrise` | `6:12` |
| 12 | Sunset | `astronomy.sunset` | `20:04` |
| 13 | Moonrise | `astronomy.moonrise` | `21:40` (or `—`) |
| 14 | Moon phase | `astronomy.moonPhase` | `Waxing gibbous` + 16px phase glyph |
| 15 | Daylight | derived from 11 & 12 | `13 hr 52 min` (or `—`) |

**Nine of these fields are nullable, and the dash is the correct rendering.**

| field | why it can be absent |
|---|---|
| `uvIndex`, `dewPoint`, `windGust` | the free provider tier reports none of them |
| `pressure`, `visibility`, `cloudCoverage` | absent from a partial payload |
| `current.windDirection` | the provider omits the whole `wind` block in calm conditions, and `windDir(0)` renders "N" — so `?? 0` reported calm or variable wind as **due north** |
| `sunrise`, `sunset` | **no sun event at all** above the Arctic circle, for weeks or months |
| `moonrise`, `moonset` | the moon does not cross the horizon on a given day |
| **all nine `Astronomy` twilight/moon fields** | a band may not occur at that latitude on that day |
| **`daily[].sunrise`, `daily[].sunset`** | as above — the per-row column, not just the panel |
| `daily[].precipitationProbability` | the synthesised rest-of-today row has no forecast for its remaining hours |
| `daily[].airQuality` | the 5-day endpoint carries no air quality at all |
| `airQuality` (the whole object) | the `/air_pollution` fetch is metered separately and can 401/429 |
| all six `airQuality` components | a payload with no `components` block |

  **This table is the defence against the recurring bug**, and it is the reason it has to stay
  exhaustive: four times, a field was made nullable in one renderer and its sibling kept the old
  assumption. Once it was missed at a single site and the mobile `MetricGrid` printed the literal
  characters `null%` — a defect `tsc` cannot see, because a template literal accepts `null`
  without complaint. **Adding a field to a contract means adding it here, in the same change.**

Every consumer tests `== null`, never truthiness and never `?? 0`. A real `0` is a
measurement and must still render: 0 hPa, 0 %, 0 km, 0 °C dew point, UV 0 are all
valid and all appear in production. The previous guards were inconsistent — the
web app used `== null` for dew point but the mobile client used a truthiness test,
which hid a genuine 0 °C.

**`sunrise`/`sunset` must not be defaulted to solar noon.** An earlier version of
this contract declared them non-nullable on the grounds that the solar
calculation "falls back to solar noon during polar day/night, which is a real
instant, not a fiction." That is the same wrong reasoning that was already
retracted for the moon fields: solar noon is a *different quantity* printed under
the label "Sunrise". Svalbard, Tromsø, Kiruna, Murmansk, Nuuk and Utqiagvik get
`Sunrise 12:55 / Sunset 12:55` for months at a stretch. Longyearbyen is in polar
night roughly 26 Oct – 16 Feb and polar day roughly 20 Apr – 23 Aug, so this is
its normal winter state, not an edge case.

Two consequences that had to be handled rather than left to render nonsense:

- The daylight arc computes `set − rise`. With both null that is 0, which drew a
  sun on the horizon during a polar night and reported **"0% of daylight
  elapsed"**. It now states the state instead: *"Polar night — the sun does not
  rise"*.
- **Polar day and polar night both present as "no sunrise, no sunset"**, and only
  the sun's altitude separates them. The client has no altitude maths and no
  lat/lon, so `AstronomySchema` carries an explicit `polarDay: boolean` computed
  by the backend's `sunTimes`.

Cell 10 and 11–12 duplicate the hero and the Astronomy block, which is **intentional** — this is the
genre's defining redundancy: a reader scanning the detail grid must not have to travel. Cell 15 is
derived, not from the API, and is explicitly labelled as such.

**Delete entirely:** the "Atmosphere" section, its `#atmosphere` container, and all six horizontal
percentage bars. `windGust`, `cloudCoverage`, `humidity`, `pressure`, `visibility` and `dewPoint` all
move into the grid above. A 0–100 bar for `pressure` normalised as `(1013−950)/100` is meaningless
across the range the API actually returns, and `dewPoint` was given a hard-coded `pct: 50` — a bar
that is always half full is worse than no bar. This is the clearest example of decoration crowding out
data in the current build.

---

### 5.9 Air Quality — `#section-air-quality`

Half of `#section-pair`.

```
section#section-air-quality
  h2#air-quality-heading   "Air Quality"
  div#air-quality-head
    p#aqi-value            "58"      --nw-text-h1 300, category colour
    div#aqi-meta
      p#aqi-category       "Moderate"  600, category colour
      p#aqi-advice         airQuality.recommendation, --nw-text-sm --nw-text-body
  div#aqi-scale
    div#aqi-scale-bar      6-segment scale, active segment highlighted
    div#aqi-scale-labels   "Good … Hazardous"  (first + last only)
  ul#aqi-components  [role=list]
    li.aqi-comp  [role=listitem]
      span.aqi-comp-name    "PM2.5"
      span.aqi-comp-value   "12 µg/m³"
    ×6
```

- **The circular AQI gauge is deleted.** A donut chart encoding a 0–500 index is decoration. Replace
  with: the number at `--nw-text-h1` in the category colour, the category word next to it, and a
  **6-segment horizontal scale bar** where the active band is filled in the category colour and the
  rest is `--nw-surface-sunken` with `--nw-border` separators. That is a legend that is also a value.
- 6 segments, equal width, 8px tall, 2px gaps, `--nw-r-xs`. Labels below at `--nw-text-xs
  --nw-text-faint`, only "Good" (left) and "Hazardous" (right) to avoid crowding.
- The category colour comes from a corrected `aqiColorClass()` returning a token name
  (`aqi-unhealthy-sensitive` is currently missing from the map in `app.js` and silently falls back to
  green — a real correctness bug).
- `#aqi-components` is a 3-column grid at ≥640px and 2 at ≤639px, each cell a
  label above a value, `border-left: 1px solid var(--nw-rule)` except the first
  in each row.

  **This line contradicted itself** — it said "2 at 640–899" and then "2 columns
  on mobile" while the clause before it said 3. The code uses **3 columns from
  640px up**, which is what this section now specifies. Three columns × six cells
  is two exact rows with no ragged last row, and at 640px each cell is ~177px,
  which comfortably fits "PM2.5" over "12 µg/m³". The `≤639px` re-arm
  (`3n+1` for column 1, `2n+1` for column 2) lands correctly by construction, not
  by luck.
- Units are part of the value, `--nw-text-xs --nw-text-faint`, matching the existing
  `µg/m³` / `mg/m³` split: `pm25, pm10, ozone, nitrogenDioxide, sulfurDioxide` in `µg/m³`;
  `carbonMonoxide` in `mg/m³`.
- `null` values render `—` at `--nw-text-faint`. **The client's honest path was
  unreachable until this round**: all six components were `?? 0` in the producer,
  so a payload with no `components` block rendered six tiles reading "0.0 µg/m³" —
  every pollutant measured at exactly zero. They are nullable at both ends now,
  and a real `0` still renders as 0.
- The whole `bundle.airQuality` is **optional**. A failed `/air_pollution` fetch
  returns `undefined`, never a fabricated `{ aqi: 0, category: "good" }`, and
  `buildAlerts` is guarded so no air-quality alert can be raised from absent data.
  An AQI index outside 1–5 is also `undefined` rather than defaulting to the
  "good" band — an unclassifiable index is not clean air.

---

### 5.10 Astronomy — `#section-astronomy`

Half of `#section-pair`.

```
section#section-astronomy
  h2#astronomy-heading     "Astronomy"
  div#astro-arc            svg  ← keep the existing arc, restyle
  div#astro-arc-legend
    span#astro-daylight-progress   "62% of daylight elapsed"   (NEW)
  dl#astronomy
    div.astro-cell
      dt.astro-label       "Sunrise"
      dd.astro-val         "6:12"
    ×7
```

**Seven cells, not ten.** The tree above is the `#astronomy` grid. `#astro-light` is a **second,
separate** grid with 4 cells. Both are `<dl>`, both are unconditional, and between them that is
**11** `.astro-cell` elements on the page — the number the border rules are derived from.

- **Keep the sun-arc SVG** — it is one of the few genuinely informative graphics on the page and it is
  already correctly parameterised by the current code. Restyle only:
  - `.sun-arc-track`: `stroke: var(--nw-border-strong)`, `stroke-width: 2`, no dash.
  - `.sun-arc-progress`: `stroke: var(--nw-temp-high)`, `stroke-width: 2`. **Delete the
    `<linearGradient id="sunGrad">` def** and the `url(#sunGrad)` reference — a two-stop gradient on a
    2px line is invisible decoration.
  - `.sun-dot`: `fill: var(--nw-temp-high)`, `r: 5`, **delete the `drop-shadow` glow**.
  - Add a 1px dashed horizontal line at the arc's horizon (`y = 70`) in `--nw-border` so the arc
    reads as an arc and not a rainbow.
  - Height caps at `180px`, centred, with `--nw-4` of padding.
- **Eleven cells across TWO 2-column grids** — 7 in `#astronomy`, then a subrule and 4 more in
  `#astro-light` — with `border-bottom: 1px solid var(--nw-rule)` between them:

| `dt` | Source | Format |
|---|---|---|
| Sunrise | `astronomy.sunrise` | `6:12` (or `—`) |
| Sunset | `astronomy.sunset` | `20:04` (or `—`) |
| Daylight | derived from the two above | `13 hr 52 min` (or `—`) |
| Moonrise | `astronomy.moonrise` | `21:40` (or `—`) |
| Moonset | `astronomy.moonset` | `08:12` (or `—`) |
| Moon phase | `astronomy.moonPhase` | `Waxing gibbous` |
| Moon illumination | derived from phase | `72%` |

and in `#astro-light`:

| `dt` | Source | Format |
|---|---|---|
| Golden hour (am) | `astronomy.goldenHourMorning` | `5:48` (or `—`) |
| Golden hour (pm) | `astronomy.goldenHourEvening` | `19:32` (or `—`) |
| Blue hour (am) | `astronomy.blueHourMorning` | `5:21` (or `—`) |
| Blue hour (pm) | `astronomy.blueHourEvening` | `19:56` (or `—`) |

  These are **band starts, not ranges** — `19:32 – 19:56` was never shipped, and a band that does
  not occur is a dash, never a neighbouring band's boundary. Every one of the nine nullable, and
  `Daylight` is derived from two of them so it dashes with them.

  The four golden/blue-hour fields are **currently rendered nowhere**. They are the most
  photographer-relevant data the API sends and they are the clearest justification for a dedicated
  Astronomy block rather than a bolt-on. Put them last, under a `10px` uppercase sub-rule reading
  "LIGHT WINDOWS", so the block has a clear primary/secondary hierarchy.
- Moon phase glyph: 8 distinct phases, not the current `moonPhaseIcon()` which returns `'moon'` for
  all eight. Use a 16px inline SVG with a `<mask>` on a circle so the terminator differs per phase
  (`packages/shared/src/utils/lunar.ts` already computes this — reuse the same phases).
- Moon illumination is derived from the phase string via a lookup of the eight standard fractions
  (new 0%, waxing crescent 25%, first quarter 50%, waxing gibbous 75%, full 100%, and mirrored).
  Label it `Moon illumination` and mark it derived in a `title` attribute.

---

### 5.11 Mobile — `#jump-bar`

There are no tabs, so the tab nav's mobile behaviour is replaced by a **sticky bottom jump bar**,
visible only at ≤639px. It is a convenience, not a gate: the page scrolls identically without it.

```
nav#jump-bar  [hidden ≥640px]
  a.jump-link[href="#section-current"]   "Now"
  a.jump-link[href="#section-hourly"]    "Hourly"
  a.jump-link[href="#section-daily"]     "Daily"
  a.jump-link[href="#section-map"]       "Radar"
  a.jump-link[href="#section-details"]   "Details"
  a.jump-link[href="#section-air-quality"] "Air"
```

- `position: fixed; bottom: 0; left: 0; right: 0; z-index: 60; height: 52px;
  display: flex; background: var(--nw-surface); border-top: 1px solid var(--nw-border);
  padding-bottom: env(safe-area-inset-bottom);`
- `body { padding-bottom: calc(52px + env(safe-area-inset-bottom)) }` at ≤639px so the footer is not
  covered.
- Each link is `flex: 1; display: flex; align-items: center; justify-content: center;
  font: 600 var(--nw-text-xs)/1 var(--nw-font); color: var(--nw-text-muted); min-height: 44px;`
  with a 2px `--nw-accent` top rule on `.jump-link[aria-current="true"]` (set by an `IntersectionObserver`
  against the sections — one handler, ~12 lines).
- No horizontal scroll: 6 links at ~62px each fits a 375px viewport.
- `scroll-margin-top: 104px` on **every id-bearing band** in the forecast subtree, not only
  `section[id]` — the skip link targets `#forecast` and falls back to `#main`, and `#alerts`,
  `#insights` and `#section-pair` are `<div>`s too. 88px was less than the 85px sticky header plus
  its gap, so the first heading after any jump landed underneath. The jump-bar `rootMargin` matches
  at `-104px`.

---

## 6. Data field → display mapping (exhaustive)

Every field in `WeatherBundleSchema` and where it renders. **Nothing may be dropped.**

### 6.1 `location` (from `LocationResultSchema`)

| Field | Section | Element |
|---|---|---|
| `name` | §5.4 | `#current-location` |
| `region` | §5.4 | `#current-region` |
| `country` | §5.4 | `#current-region` |
| `timezone` | §5.4 | `#current-timezone` (local time) |
| `coordinates.lat/lon` | §5.7 | `#weather-map` centre, `#map-recentre` target |

**`location.timezone` is not just a display string — it is a rendering
parameter, on every client.** A forecast instant is not a device-local instant.
The web app has a dedicated layer for this (`isValidTimeZone` / `activeTimeZone`,
app.js) because `toLocale*String` with no `timeZone` silently uses the *reader's*
zone. **The mobile app had no equivalent**, and the failure modes were severe:

- `formatDay` parsed the bare `YYYY-MM-DD` key as UTC midnight and formatted it in
  the device zone, so **every row of the daily list was labelled with the
  previous calendar day** for any user west of UTC — the US, Canada, Mexico, most
  of South America, the Pacific.
- Sunrise, sunset, all four twilight bands, moonrise/moonset and every hourly axis
  tick rendered in the reader's zone. A reader in Kolkata looking at Longyearbyen
  was shown a sunrise of 7:41 PM.

So: `formatTime(value, timezone?)` and `formatDay(value, timezone?)` on mobile,
with `bundle.location.timezone` threaded from `HomeScreen` into
`DailyForecastList`, `AstronomyStrip` and `HourlyChart`. An invalid zone string
throws a `RangeError`, so it is validated and degrades to the device zone rather
than crashing. `formatDay` additionally formats at `timeZone: 'UTC'` from a
noon-anchored date (`${value}T12:00:00Z`), so the key cannot shift regardless of
the device.
| `id` | — | not displayed (used as cache key only) |
| `isFavorite` | §5.1 | `data-favorite="true"` → a 10px dot before `.loc-chip-name` |

### 6.2 `current`

| Field | Section | Element |
|---|---|---|
| `observedAt` | §5.4 | `#current-observed` ("As of 14:30") |
| `observedAt` | §5.8 | details cell 10 "Observed" |
| `temperature` | §5.4 | `#current-temp` |
| `temperature` | §5.6 | `.daily-bar-now` marker on row 0 |
| `feelsLike` | §5.4 | `#current-facts` fact 1 "Feels like" |
| `condition` | §5.4 | `#current-icon` glyph + `data-condition` |
| `conditionText` | §5.4 | `#current-condition` |
| `humidity` | §5.8 | details cell 3 |
| `pressure` | §5.8 | details cell 6 |
| `visibility` | §5.8 | details cell 7 |
| `uvIndex` | §5.8 | details cell 9 |
| `dewPoint` | §5.8 | details cell 2 |
| `windSpeed` | §5.8 | details cell 4 |
| `windDirection` | §5.8 | details cell 4 (cardinal + rotated arrow) |
| `windGust` | §5.8 | details cell 5 |
| `cloudCoverage` | §5.8 | details cell 8 |

### 6.3 `hourly[]`

| Field | Section | Element |
|---|---|---|
| `time` | §5.5 | `.hour-time`; also the SVG x-domain |
| `temperature` | §5.5 | `.hour-temp`; also the curve polyline |
| `feelsLike` | §5.5 | `.hour-feels` (only when `|Δ| ≥ 2`) |
| `condition` | §5.5 | `.hour-icon` |
| `precipitationProbability` | §5.5 | `.hour-pop`; also `.chart-precip-bar` height |
| `precipitationMm` | §5.5 | `.hour-mm` (only when `> 0`) |
| `windSpeed` | §5.5 | `#hourly-wind` summary ("Wind 12–24 km/h") |
| `windDirection` | §5.5 | `#hourly-wind` summary cardinal |
| `uvIndex` | §5.5 | `.hour-uv` (only when `≥ 6`) |

### 6.4 `daily[]`

| Field | Section | Element |
|---|---|---|
| `date` | §5.6 | `.daily-day` ("Today" / "Fri") + `data-today` |
| `high` | §5.6 | `.daily-hi`, `.daily-bar-range` right edge |
| `low` | §5.6 | `.daily-lo`, `.daily-bar-range` left edge |
| `high` / `low` | §5.4 | `#current-facts` facts 2 & 3 (from `daily[0]`) |
| `condition` | §5.6 | `.daily-icon` |
| `condition` | §5.6 | `.daily-desc` (title-cased) |
| `precipitationProbability` | §5.6 | `.daily-pop` |
| `sunrise` | §5.6 | `.daily-sun` |
| `sunset` | §5.6 | `.daily-sun` |
| `moonPhase` | §5.6 | `.daily-moon` (a 14px `phaseGlyph()` SVG, not a lucide icon) — **rendered** |
| `airQuality` | §5.6 | `.daily-aqi` (12px label, e.g. "AQI 41", `data-aqi-cat` tint) — **rendered**. The cell is empty when
  `daily[].airQuality` is absent, which with the free tier is every day, everywhere |
| `airQuality.aqi` | §5.6 | `.daily-aqi` numeric |
| `airQuality.category` | §5.6 | `.daily-aqi` colour token |
| `airQuality.pm25/pm10/ozone/carbonMonoxide/nitrogenDioxide/sulfurDioxide` | — | **not rendered per-day.** Showing six pollutants × 14 days is not readable and duplicates §5.9. Documented as a deliberate exception; `daily[].airQuality.aqi` and `.category` carry the per-day signal. |
| `airQuality.recommendation` | — | not rendered per-day (same reason) |

### 6.5 `airQuality` (top-level)

| Field | Section | Element |
|---|---|---|
| `aqi` | §5.9 | `#aqi-value` |
| `category` | §5.9 | `#aqi-category`, `#aqi-scale-bar` active segment, colour token |
| `recommendation` | §5.9 | `#aqi-advice` |
| `pm25` | §5.9 | `#aqi-components` cell 1, `µg/m³` |
| `pm10` | §5.9 | cell 2, `µg/m³` |
| `ozone` | §5.9 | cell 3 (`O₃`), `µg/m³` |
| `carbonMonoxide` | §5.9 | cell 4 (`CO`), `mg/m³` |
| `nitrogenDioxide` | §5.9 | cell 5 (`NO₂`), `µg/m³` |
| `sulfurDioxide` | §5.9 | cell 6 (`SO₂`), `µg/m³` |

### 6.6 `astronomy`

| Field | Section | Element |
|---|---|---|
| `sunrise` | §5.10 | `#astronomy` cell 1; also §5.8 details cell 11 |
| `sunset` | §5.10 | cell 2; also §5.8 details cell 12 |
| `moonrise` | §5.10 | cell 4; also §5.8 details cell 13 |
| `moonset` | §5.10 | cell 5 — **currently not rendered** |
| `moonPhase` | §5.10 | cell 6 glyph + name; also §5.8 details cell 14; also `daily[].moonPhase` glyphs |
| `goldenHourMorning` | §5.10 | cell 8 — **currently not rendered** |
| `goldenHourEvening` | §5.10 | cell 9 — **currently not rendered** |
| `blueHourMorning` | §5.10 | cell 10 — **currently not rendered** |
| `blueHourEvening` | §5.10 | cell 11 — **currently not rendered** |

### 6.7 `alerts[]`

| Field | Section | Element |
|---|---|---|
| `id` | §5.2 | element `id="alert-<id>"` |
| `type` | §5.2 | `.alert-window` type chip ("Wind", "Flood", …) |
| `title` | §5.2 | `.alert-title` |
| `description` | §5.2 | `.alert-desc` |
| `severity` | §5.2 | `.alert-badge` text + border-left colour |
| `startsAt` | §5.2 | `.alert-window` range start |
| `endsAt` | §5.2 | `.alert-window` range end |
| `source` | §5.2 | `.alert-source` |

**Currently unrendered: `id`, `type`, `startsAt`, `endsAt`.** All four must be added.

### 6.8 `insights[]`

| Field | Section | Element |
|---|---|---|
| `id` | §5.3 | element `id="insight-<id>"` |
| `priority` | §5.3 | `data-priority`, icon + rule colour |
| `category` | §5.3 | `.insight-kicker` |
| `message` | §5.3 | `.insight-msg` |
| `evidence` | §5.3 | `.insight-evidence` list items |

**Currently unrendered: `id`, `category`, `evidence`.** All three must be added.

### 6.9 `mapLayers[]`

| Field | Section | Element |
|---|---|---|
| `id` | §5.7 | `data-layer-id` on the button, `aria-pressed` match |
| `name` | §5.7 | button label |
| `opacity` | §5.7 | Leaflet tile `opacity`; initial value of `#map-opacity` |
| `refreshSeconds` | §5.7 | `#map-layer-refresh` text |
| `tileUrlTemplate` | §5.7 | passed to `L.tileLayer` |

**Currently unrendered: `opacity` (hard-coded to `0.7`), `refreshSeconds`.** Both must be wired.

### 6.10 Top level

| Field | Section | Element |
|---|---|---|
| `source` | §0 | `#data-source` badge in the masthead (existing behaviour, keep) |
| `generatedAt` | §5.4 | `#current-generated` — 11px `--nw-text-faint`, "Data generated 14:32" under `#current-observed` |
| *(units)* | §5.8 | `#unit-label` in masthead; also drives all temperature and km→mi conversions |

---

## 7. Existing CSS / JS: keep, rewrite, delete

### 7.1 Delete from `styles.css`

| Selector | Why |
|---|---|
| `.bg-scene`, `.bg-gradient`, `.weather-particles`, `.rain-drop`, `.snow-flake`, `.sun-ray`, `.cloud-puff`, `@keyframes rainFall/snowFall/sunRay/cloudDrift/bgPulse` | The animated background. Pure decoration, the single biggest distance from the target aesthetic, and a continuous repaint cost. |
| `body[data-condition=…]` blocks (9 of them) and the light-mode condition overrides | They only feed `--cond-grad-a/b/c`, which die with the gradient. `data-condition` on `<body>` stays, but now only drives the icon tint. |
| `.glass-card`, `backdrop-filter` / `-webkit-backdrop-filter` declarations anywhere | Glassmorphism. Replaced by `.panel`. |
| `.tabs-nav`, `.tab-btn`, `.tab-panel` | Tabs are gone. |
| `.globe-container`, `.landing-globe-container`, `.globe-section` | Globe is gone. |
| `@keyframes brandFloat`, `iconBob`, `emptyFloat`, `fadeInUp`, `fadeIn`, `shimmer` | All entrance/bob animations. The page must not animate on render. |
| `.hero-temp` gradient text (`background-clip: text` + `-webkit-text-fill-color: transparent`) | Gradient text. Replace with `font-weight: 300; color: var(--nw-text)`. |
| `.tab-btn.active` gradient pill, `.map-layer-btn.active` solid accent | The latter is kept (§5.7) but the former goes. |
| `.atmo-grid`, `.atmo-row`, `.atmo-bar-wrap`, `.atmo-bar` | The Atmosphere section is deleted; its data moves to §5.8. |
| `.aqi-ring*`, `.aqi-center` | Donut gauge deleted. |
| `@media print` block | Rewritten — see 7.4. |
| `--clr-*` custom properties (all 30) | Superseded wholesale by `--nw-*`. Do not keep both; two competing token sets is how drift starts. |
| `--ease-spring`, `--dur-slow` | No spring motion survives. |

### 7.2 Rewrite in `styles.css`

| Existing | Becomes |
|---|---|
| `.app` | `.nw-page` — `max-width: var(--nw-container)`, `margin: 0 auto`, `padding: 0 var(--nw-gutter) var(--nw-11)`. No `display:flex` on the page shell; each region manages its own layout. |
| `.app-header` | Sticky, flat, `border-bottom`, no radius, no shadow, no `flex-wrap`. |
| `.glass-card` | `.panel` — `background: var(--nw-surface); border: 1px solid var(--nw-border); border-radius: var(--nw-r-md); box-shadow: var(--nw-elev-1); padding: var(--nw-6);` |
| `.card-title` | `.h-section-title` (§3.1) |
| `.hero-*` | `#section-current` blocks (§5.4) |
| `.grid-2col`, `.grid-3col` | `#section-pair` (2-col) and `.hour-col` (flex). |
| `.hourly-chart` | Split into `#hourly-chart-wrap` (the SVG) and `#hourly-scroll` (the strip) |
| `.daily-list`, `.daily-row` | Grid table rows (§5.6) |
| `.weather-map`, `.map-section`, `.map-controls` | §5.7 |
| `.theme-dark .leaflet-layer { filter: brightness(.85) saturate(.8) }` | **Delete.** A CSS filter on the whole tile layer is the same "fake dark mode" trick as gradient text. If a dark basemap is wanted, use a dark tile URL as the base layer when `state.theme === 'dark'`. |
| `.theme-light` / `.theme-dark` | Single `.theme-dark` override block only — light lives on `:root`. |

### 7.3 Keep from `styles.css` (unchanged or near-unchanged)

- The reset block and `box-sizing`.
- `:focus-visible` (retint to `--nw-focus`).
- `.hidden { display: none !important }`.
- `.spinner` / `@keyframes spin` — retint; still used in the search dropdown.
- `.data-source` badge — restyled flat.
- `.alert-source` — keep.
- The `.lucide` icon sizing block — keep the base, drop the per-selector overrides that set colours.
- `box-shadow: var(--nw-elev-2)` on `.search-results`.
- The `<link>` to the three IBM Plex cuts (§3.1). `font-display: swap` is already in the Google URL. A
  single request now carries three families, so the page load is heavier than the one-family link it
  replaces — `preconnect` is already in place for both `fonts.googleapis.com` and `fonts.gstatic.com`.

### 7.4 Rewrite `@media print`

A forecast page is *the* thing people print. The current print block hides the map, which is wrong.

```css
@media print {
  :root, .theme-dark { --nw-page: #fff; --nw-surface: #fff; --nw-text: #000; --nw-text-body: #333; --nw-text-muted: #555; --nw-border: #ccc; }
  .icon-btn, .cover-link, .link-btn, #jump-bar, #search-form, #search-results, .brand-tag, .map-caption, #locations-bar, #map-layer-switch, #map-opacity, #map-recentre { display: none !important; }
  .panel { box-shadow: none; break-inside: avoid; }
  #section-map { display: none; }              /* tiles do not print legibly */
  #section-current { break-after: avoid; }
  .hour-col, .daily-row { break-inside: avoid; }
  #hourly-scroll, #daily-scroll { overflow: visible !important; }
  a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 10px; color: #555; }
}
```

> **The `:root, .theme-dark` selector list is load-bearing — do not reduce it to
> `.theme-dark`.** The light theme is the default, so `:root` alone already
> matches it; writing only `.theme-dark` looks like a harmless simplification and
> re-solves nothing for a light-theme reader, who then prints a `#000` page. This
> snippet previously read `.theme-dark { … }` and would have reinstated exactly
> the bug the block was written to close. It is the one place in this document
> where a shorter selector is a defect.

Three additions to the block above, each fixing a defect found in review:

- **`#hourly { grid-template-columns: repeat(7, 58px); }`** with default row flow.
  Laying the strip out in columns (`grid-auto-flow: column`) made the top printed
  row read hours 1, 8, 15, 22 — the reading order and the visual order disagreed.
  Seven *explicit* COLUMNS does **not** mean no implicit track is created: 16 items in 7
  columns make three rows however they are declared. What actually prevents an implicit row
  is the companion `grid-template-rows: repeat(7, auto)`, and it is the half that is easy to
  drop on the reasoning that the columns already cover it. `.daily { min-width: 0 }`
  is required or the 10-column table overflows the printable width of Letter
  portrait.
- **The print block must re-solve `--nw-border-input`.** Every other token is
  overridden for paper; the dark value of the search-input border would resolve to
  2.9:1 on white. Latent only, since `#search-form` is `display: none !important`
  in print — but a token that is not print-safe is a latent defect, not a safe one.
- **`.hour-divider` is recoloured to `--nw-rule` in print.** After the row-major
  reflow, index 1 lands at row 1 column 2, where the strong rule would print
  between two ordinary forecast hours.

### 7.5 `app.js`

**Delete**
- `spawnParticles()` and everything it touches (the `particle` key in `CONDITION_MAP`, the `body` gradient). `CONDITION_MAP` keeps its `icon` key.
- `initGlobe()`, `globeInstances`, the `window.addEventListener('resize', …)` globe handler, the `setTimeout(…, 100)` landing-globe call in `DOMContentLoaded`.
- `switchTab()` and the `.tab-btn` click binding in `DOMContentLoaded`.
- `renderAtmosphere()` and its call sites (`loadWeather`, `reRenderUnit`).
- The duplicate `data.map(...)` block inside `doSearch()` — the first `openSearchResults(data.map(...))` builds HTML with `outerHTML` and is immediately discarded by the second block. Delete the first; it is dead code that also builds unescaped HTML strings.

**Keep (it is good)**
- `escHtml()` — essential, and every new `innerHTML` template must use it, including `ins.message`, `ins.evidence[]`, `aq.recommendation`, `loc.name`, `loc.region`, and `loc.country`, none of which are escaped today (`search-result-item` interpolates `loc.name` raw).
- `detectStepHours()` / `stepLabel()` — the comment explaining the 3-hour free-tier discrepancy is correct; keep both.
- `toDisplay()`, `unitLabel()`, `formatTime()`, `formatHour()`, `dayName()`, `windDir()`, `conditionInfo()`.
- `renderSource()` — including the `title` tooltip explaining sample vs live.
- The whole `loadWeather()` orchestration, minus the two deleted render calls.
- `apiLayer` fetch + `?appid=` substitution.
- `applyTheme()` — but change the two hard-coded hexes to read from the token values, and set `document.title`.
- `localStorage` keys `theme` and `unit` — do not rename; users have stored values.

**Rewrite**
- `renderHero()` → split into `renderCurrent(current, daily0, location, generatedAt)` writing to the §5.4 IDs.
- `renderHourly()` → `renderHourlyChart()` (existing SVG, restyled) + `renderHourlyStrip()` (new).
- `renderDaily()` → grid rows with the range bar.
- `renderAirQuality()` → number + 6-segment scale + components grid.
- `renderAstronomy()` → arc restyle + 11-cell grid.
- `renderAlerts()` → add `type` and the `startsAt–endsAt` window.
- `renderInsights()` → add `category` kicker and the `evidence` list.
- `initMap()` → use `l.opacity`, wire `#map-opacity`, `#map-recentre`, `#map-layer-refresh`; `invalidateSize()` in `requestAnimationFrame` instead of a tab check.
- `showLoading()` → do not write `…` into `#current-temp`. Skeleton the current block instead (`.is-loading` on `#section-current` sets `color: transparent` + a `--nw-surface-sunken` shimmer-free `background` on the value cells — flat, not a moving gradient).

**Add**
- `updateTitle(current, daily0, name)`.
- `initJumpBar()` — `IntersectionObserver` writing `aria-current` on `.jump-link`.
- `fmtTimeRange(isoA, isoB)` for golden/blue hour cells.
- `moonIllumination(phase)` and `phaseGlyph(phase)` replacing `moonPhaseIcon()`.
- `uvWord(index)` → `Low | Moderate | High | Very high | Extreme`.
- `scalePct(value, min, max)` shared by the daily range bar and the AQI scale.
- `visibilityUnit(km)` → `km` / `mi`.

---

## 8. Responsive breakpoints

| Name | Range | Layout rules |
|---|---|---|
| **Desktop** | ≥ 1200px | Container 1280px, gutter 24px. `#section-current` = `300px 1fr auto`. `#section-details` = 3 columns. `#section-pair` = 2 columns. `#air-quality` components = 3 columns. `#insights` = 2 columns. Map 480px, full-bleed. Panels have no shadow (border is enough). `#jump-bar` hidden. |
| **Laptop** | 900-1199px | Container fluid, gutter 16px. `#section-current` = `240px 1fr` with `#current-facts` wrapping to a row beneath the temperature. `#section-details` = 2 columns. `#section-pair` stays 2 columns until 900. Map 420px, still full-bleed. |

**Two rules in this table need their reasoning recorded, because both look like
arbitrary choices and both are load-bearing.**

**1. `#current-facts` needs a definite ROW at 900–1199px, not just a column.**
It is the third child of `.current-grid`, and CSS Grid auto-placement seats any
item with a definite *column* position (step 5.1) **before** the auto-positioned
siblings. So `grid-column: 1 / -1` alone put the fact strip on row 1 and pushed
the place block and the temperature down to row 2 — inverting the layout and
demoting the one number the page exists to show, at the most common desktop
width. **Both** properties are scoped `@media (min-width: 900px)` on purpose: below
900px the grid is a single track, so the stack comes from order-modified document
order, and forcing a row there would strand the facts on row 2 and push the
temperature block to row 3. (An earlier version of this note said `order: -1`
already produced the correct stack at ≤899px. That stopped being true the moment
`order` was narrowed to ≤639px to match §8 Mobile — see note 2.)

**2. `.current-block { order: -1 }` is scoped `≤639px`, NOT `≤899px`.** The
temperature moves above the place block at **Mobile only**, exactly as §8 Mobile
says. Tablet keeps the document order this table specifies.

That scoping is not cosmetic — it changes a second rule as a consequence, and
getting it wrong is a real regression:

- At 640–899px the grid is a **single track**, so the rendered stack is decided
  entirely by order-modified document order. For it to be the document order,
  **every grid item must be fully auto** there. So `#current-facts` must carry
  **neither** `grid-column` **nor** `grid-row` in that band. Both properties are
  therefore inside the same `@media (min-width: 900px)` block.
- This was a trap worth writing down. `grid-column: 1 / -1` alone had been left in
  the `max-width: 1199px` block, so it also applied at 640–899px — where `1 / -1`
  is *still* a definite column, so the fact strip was seated first, at row 1,
  above the city name. It went unnoticed for as long as `order: -1` re-sorted the
  other two items above it: the `order` was **masking** the misordering. Narrowing
  `order` to `≤639px` in order to match this spec removed the mask and exposed the
  bug immediately.

Verified stack at every boundary, by applying the §8.3 placement algorithm to the
resolved declarations rather than eyeballing the CSS:

| viewport | tracks | rendered |
|---|---|---|
| ≥1200 | 3 | place · block · facts (one row) |
| 900–1199 | 2 | row 1: place · block — row 2: facts spanning |
| 640–899 | 1 | place → block → facts |
| ≤639 | 1 | block → place → facts |

| Name | Range | Layout rules |
|---|---|---|
| **Tablet** | 640-899px | Gutter 16px. **Masthead wraps to two rows**: row 1 = brand + controls, row 2 = `#search-form` at `100%` width. The right-alignment is `.header-right { margin-left: auto }`, not `justify-content` — `.site-header` declares no `justify-content` and adding one here would be describing a rule that does not exist. `#section-current` stacks in **document order**: place block, then icon + temperature, then `#current-facts` as a 3-up row of bordered cells spanning full width. No `order` re-sorting at this width — see the note below. `#section-pair` → 1 column. `#details` → 2 columns. `#hourly-*` unchanged (it scrolls). `.daily-sun` column removed. Map 360px, **not** full-bleed (see the note below). Layer switcher still floating. `#jump-bar` hidden. |
| **Mobile** | ≤ 639px | Gutter 8px. Panels lose their border radius to `--nw-r-sm` and their shadow entirely. `#current-temp` = `clamp(4rem, 22vw, 6rem)`, weight 400 (a light 300 was specified here and never
  built — §3.8 fixes it at 400 deliberately, and the sheet has no unloaded weight in it), `--nw-text-display` overrides. `#current-icon` drops to 56px and moves **above** the temperature (icon-then-number, the mobile convention). `#current-facts` = 3 equal columns, vertical dividers removed, replaced by a top rule per cell. `#section-details` = 1 column, cells keep their bottom rule. `.daily-row` grid → `64px 24px minmax(0,1fr) 28px 32px 32px` (six tracks: the day column is 64px, not the
  56px an earlier version of this row specified, because "Tomorrow" measures 60.15px in Plex Sans 600
  13px and overflowed 56px by 4.15px — enough to consume the 4px column-gap and touch the 24px icon
  track, which has no slack at all. The 8px came out of the `1fr`, which drops to 92px at 320px and
  still clears the longest single word) drop `.daily-sun`, `.daily-moon`, `.daily-bar-wrap` **and `.daily-aqi`**; **the range bar is removed on mobile** because at 32px of track it is unreadable, and the high/low pair alone is the mobile convention). The AQI removal is a data column going dark and should be a deliberate decision, not a side effect of dropping a neighbour — the panel above still carries it. `.aqi-components` = 2 columns. `#hourly-*` unchanged. Map 280px, edge to edge, **layer switcher moves below the map as a full-width scrollable pill row**. `#jump-bar` visible. `#insights` 1 column. `.astro` grid 1 column. |
| **Small** | ≤ 380px | `--nw-gutter: 10px`. `#current-temp` = `3.75rem`. `#current-facts` labels truncate to a hard `font-size: 10px` (`--nw-text-xs` is 11px, so this sits deliberately below it). `#section-pair` 1 column. `#jump-bar` labels reduce to 5 (drop "Air"). |

**Shared rules at all widths**
- `overflow-x: clip` on `<html>` (not `hidden` — `hidden` on the root breaks `position: sticky` in some engines). Required because `#map-stage` uses a `100vw` bleed.
- `scroll-margin-top: 104px` on **every id-bearing band** in the forecast subtree —
  the seven `<section>`s plus `#forecast`, `#main`, `#alerts`, `#insights` and
  `#section-pair`, which are `<div>`s and were measuring 0px. 88px left the top of
  every section heading underneath the 85px sticky header after a jump (2.4.11).
  The jump-bar `rootMargin` must match: `-104px`, not `-88px`.
- No horizontal page scrollbar at 320px. There are **five** deliberate horizontal
  scrollers, not two: `#locations`, `#hourly-chart-wrap`, `#hourly-scroll`,
  `#map-layer-switch` and `#daily-scroll` (which does not in fact scroll at 320px).
  An earlier version of this list named only two and was simply wrong. All other
  content must fit without a scroller.
- The layer switcher's right-edge scroll fade is applied **only when the element
  measurably overflows** (an `is-scrollable` class toggled in JS from
  `scrollWidth > clientWidth`). Unconditional, it dissolved the right edge of the
  opacity slider, the container border and its shadow at every viewport wide
  enough to show all seven layers. A hard-coded breakpoint is not acceptable
  either - the threshold is font-metric-derived and drifts if a layer is renamed
  or a typeface fails to load. The layer names are in Plex Sans Condensed at
  11px/600, so the switcher's natural width changes if that cut is substituted;
  measuring is the only version of this that survives a font change.
- Tap targets: the floor is **24×24 CSS px**, which is WCAG 2.2 **AA** 2.5.8, the level this
  document targets. 44×44 is 2.5.5, which is **AAA**, and an earlier version of this line cited
  it; a reader implementing to it would pad the masthead for no conformance benefit. Measured:
  `.jump-link` 44, `.loc-chip` 40, `#geo-btn` 36×40, `.icon-btn` / `.cover-link` /
  `#map-recentre` 32, `.map-layer-btn` 28, `.link-btn` and `#map-opacity` 24. `.alert-badge` is
  non-interactive and exempt.

---

## 9. Accessibility

### 9.1 Keep (already present, do not regress)

- `role="banner"` on `<header>`, `role="main"` on `<main>`, `role="contentinfo"` on `<footer>`.
- `role="search"` on the search wrapper **with an `aria-label`** — an unnamed
  `role="search"` wrapping an unnamed `<form>` produces two blank container
  landmarks before the first content. `role="listbox"` / `role="option"` on the
  results; all **four** popup states (loading / results / no-results / failed) are
  valid listbox children, so the non-result states carry `role="presentation"`
  and their spinners are `aria-hidden`.
- `role="list"` + `role="listitem"` on `#daily`, `#hourly`, `#current-facts`,
  `#aqi-components`, `#insight-list`. **`#locations` is `role="group"` of real
  `<button>`s**, not a list — see §5.1. `#insights` is `role="region"`; with only
  an `aria-labelledby` it was absent from the landmark list entirely.
- **`#alerts` is `role="region"` and is NOT a live region** — see §5.2. This list
  previously said to keep `aria-live`, which is the one item here that was a
  defect.
- `aria-label` on the hourly chart SVG and on the map container.
- `aria-pressed` on the map layer buttons, `aria-expanded` if the results are ever a disclosure.
- `aria-autocomplete` / `aria-controls` on `#q`.
- Global `:focus-visible` ring.

### 9.2 Fix

1. **`role="alert"` + `aria-live="polite"` on the same element is a conflict** — `role="alert"` implies `aria-live="assertive"`, and the explicit `polite` wins unpredictably across AT. Change `#alerts` to
   `role="region" aria-label="Active weather alerts"`, and **remove `aria-live`
   entirely** — see §5.2 for why the live region was the bigger problem and what
   replaces it. Keep the separate visually hidden `#live-status` for
   "3 active weather alerts" on load, silent on a background refresh unless the
   count changed.
2. **The search listbox has no keyboard support.** `#q` has `aria-controls="search-results"` but no
   `aria-activedescendant` management, and `role="option"` items are not focusable. Add
   ↑/↓/Enter/Escape handling, `aria-expanded` on `#q`, and `aria-selected` on the active option.
   The existing `.loc-chip` `keydown` Enter/Space handler is the pattern to copy.
3. **`#hourly-scroll` and `#daily-scroll` are keyboard-unscrollable.** Add `tabindex="0"`,
   `role="region"`, and an `aria-label` to each. A scrollable region with no focus is unreachable
   without a mouse.
4. **Icon-only buttons** (`#geo-btn`, `#notify-toggle`, `#theme-toggle`, `#map-recentre`) already have
   `aria-label` — keep, and ensure the label is updated on state change (`theme-toggle` should go
   from "Switch to dark theme" to "Switch to light theme"; the current "Toggle light/dark theme" is
   ambiguous about the action).
5. **`#unit-toggle`** is a `<button>` displaying "°C". Its accessible name must
   satisfy **2.5.3 Label in Name**: the visible text has to be *contained* in the
   accessible name, or speech input saying "click °C" fails. It must also state the
   **current** unit, not only the next one. The name is
   `"°C, Celsius. Switch to Fahrenheit"`, built by a shared `unitToggleLabel()`
   helper. Both the visible label and the accessible name are written **together,
   at the one site that changes `state.unit`** — the click handler. The name update
   used to live inside `reRenderUnit()`, which returns on its second line when
   there is no bundle, so in the empty state (the default first-run view) the
   visible label moved to `°F` while the name still said `°C, Celsius. Switch to
   Fahrenheit`: the wrong current unit *and* the wrong next action, reachable
   without doing anything unusual. Writing both at the single state-changing site
   also removes the last way the two could drift. The visible span stays
   `aria-hidden="true"`.
6. **The `#hourly` container is `role="img"`** and will now contain nine real list items. Move
   `role="img"` + the descriptive `aria-label` to the new `#hourly-chart` SVG wrapper, and give
   `#hourly` `role="list"`. The generated `aria-label` string already produced by `renderHourly()`
   (point count, step, range, peak rain chance) is good — keep the wording.
7. **Table semantics for the daily list.** `role="list"` is retained, and each
   `.daily-row` is named with **`visually-hidden` prefixes inside its cells**,
   not with an `aria-label` on the row — see §5.6 for the retraction and the
   reasoning. An `aria-label` on a `listitem` replaces its contents in the
   accessibility tree, so the prefixes would become unreachable.
8. **`<dl>` for the details and astronomy grids** instead of `div`/`span` pairs (§5.8, §5.10).
9. **Colour is never the only signal.** AQI category, alert severity, and UV index all carry a word
   (`Moderate`, `Severe`, `High`) alongside the colour. The daily range bar is decorative
   (`aria-hidden="true"`) with the high/low spelled out as text.
10. **Contrast.** Every token was re-solved numerically against the **worst surface it actually
    reaches** — not against white, and not against the bare `--nw-page` where the surface is
    itself composited — and the numbers below are measured, not asserted. The token
    values quoted in earlier versions of this document were wrong in both hue and lightness and
    would not pass:

    | token | earlier claim here | actual | shipped |
    |---|---|---|---|
    | `--nw-text-faint` | `hsl(215 11% 60%)` = "3.1:1" | **2.95:1** — fails | `40.75%` light (4.61:1) / `59.8%` dark (4.63:1) |
    | `--nw-uv-moderate` | `hsl(43 92% 40%)` = "4.6:1" — "passes" | **2.89:1** — fails | `hsl(48 90% 27.6%)` (5.03:1) |

    **Where a surface is composited, solve against the worst point of it, not the
    page.** The four `--nw-sev-*` inks sit on the alert band, which is `--nw-page`
    + `--nw-sev-tint` + the three mesh washes. In the light theme that band runs
    rgb(222,234,244) to rgb(245,248,250), and the darker end of it dropped
    `--nw-sev-severe` from 4.60:1 to **4.03:1** — a "Severe" badge failing 1.4.3
    while every table in this document said it passed. The four are now solved
    for the worst of the band's range, and in the dark theme for the *lighter*
    end, which is what binds there. The three mesh washes are radial, so the
    ground genuinely moves across the page; taking a single point is what made
    the original claim look fine.

    **The same mistake, one token over, and it survived a full review round.**
    `--nw-text-muted` and `--nw-text-faint` were solved here against surfaces, and the list of
    surfaces below — `--nw-surface`, `--nw-surface-sunken`, `--nw-surface-alt`, `--nw-header` and
    paper — is entirely made of panels. It never asked what ground these two actually reach,
    and they do reach the page: `.section-meta`, `.h-section-title`, `.current-generated`,
    `.insight-evidence li`, `.map-caption` and `.fact-label` all sit outside `.panel`. Their
    background is `--nw-page` + three mesh washes + the 4px grid + the SVG grain, and it MOVES:
    measured over ten viewports the light-theme page runs rgb(245,247,250) down to rgb(225,229,234),
    and the dark-theme page runs rgb(17,22,31) up to rgb(32,47,59). Solved on white, the two were
    4.09:1 and 3.98:1 there; solved on the ground they are 4.97:1 and 4.61:1. `--nw-text-faint`
    was also **4.07:1 in the dark theme** and that half was not reported at all.
    A "five bands" enumeration is only as good as the list of bands. There is a sixth here, and
    it is the one that binds.

    The band colours are text on `--nw-surface`, on `--nw-surface-sunken` (the "Now" column) and on
    paper, so each needed its own solve. Measured minimum across all five bands × both themes ×
    screen/print is **4.91:1**, at the dark-theme `very-high` band. `--nw-text-muted` is the floor
    for anything that must be read; `--nw-text-faint` is for **units, and for secondary text that
    is genuinely duplicated or recoverable elsewhere on the page** — a section's "Every 3 hours ·
    12° – 21° · Wind 5–12 km/h N" summary, the map layer's refresh interval, and the live-vs-sample
    data credit in the footer. Those three are not decoration and were previously waved through by
    this paragraph; the print block calls the data credit information-bearing, and this line used
    to call the same text decorative.
11. **`prefers-reduced-motion` block** even though almost nothing animates:
    `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important } }`
    `animation-iteration-count: 1 !important` is the clause that actually matters, and an earlier
    version of this line omitted it. Zeroing `animation-duration` alone does not stop an
    `infinite` animation — it makes each cycle instantaneous and then repeats it forever at
    whatever delay is in play, which is still motion a reader cannot escape.
    This also disables Leaflet's default zoom animation, which is a genuine comfort issue for
    vestibular disorders.

    **§3.9 — the four motions, and why they are gated at the source.** On a data page, motion that is
    not explaining something is noise, and the page has to stay readable the instant it paints. So
    nothing here delays content, and every animation is transform/opacity/stroke only —
    compositor-friendly, and no layout thrash on the fixed-track grids.

    | name | what | timing |
    |---|---|---|
    | `panel-in` | staggered reveal in document order, via `counter(nw-panel)` and `animation-delay: calc(var(--nw-reveal-step) * (counter(nw-panel) - 1))` | 420ms, 40ms step |
    | `arc-draw` | the daylight arc draws itself with `stroke-dashoffset` | 900ms, 240ms delay |
    | `bar-grow` | the daily range bars scale in from the centre | 460ms, 40ms step per row |
    | `live-pulse` | the `Live data` lamp breathes | 2.4s, **6 iterations** (≈15s, then stops) |

    All four are declared **inside** `@media (prefers-reduced-motion: no-preference)`, not cancelled
    afterwards. Gating at the source is safer: an animation that is declared and then neutralised
    still costs a style recalculation, and the reduced-motion block above does not have to know these
    exist. The 40ms step is long enough to read as a sequence and short enough that the last panel is
    not noticeably late.

    `panel-in`'s selector is **`#main .panel`, not `#main > .panel`**. The direct children of
    `<main>` are `.empty-state` and `#forecast`; every `.panel` is a grandchild, so the child
    combinator matched nothing and the whole cascade was two elements — the header at delay 0 and
    the featured strip at 40ms — with `counter-reset` on `#forecast` equally inert. Three comments
    and this table described a document-order stagger that never ran.

    **`live-pulse` is finite, and that is a 2.2.2 requirement rather than a stylistic
    preference.** The earlier justification here — 2.4s is far under the 3Hz flash threshold, and
    it is opacity only — answers 2.3.1 and stops, which is beside the point. 2.2.2 is a separate
    criterion with a separate test: anything moving for **more than five seconds** needs a
    mechanism to pause, stop or hide it. `infinite` gave a reader with a vestibular or migraine
    sensitivity a 0.42Hz opacity cycle they could not switch off, on every page view, forever. Six
    iterations ends the animation on its own, so no control is needed, and the badge's state is
    already carried by the words "Live data" beside the lamp.

    `--arc-len` is measured from the DOM by `app.js` (`getTotalLength`) because the path is an
    *elliptical* arc — the chord is 120 and the arc is πr ≈ 188.5, so using the chord would make the
    stroke overshoot. The measurement is wrapped in a try because `getTotalLength` needs a rendered
    layout; the analytic 188.5 fallback stands when there isn't one, and an arc that animates
    approximately beats an arc that does not animate at all.

    Hover states exist **only on things that are actually interactive** — a data row that is not
    clickable does not get one.
12. **Landmarks.** Add `<nav aria-label="Sections">` to `#jump-bar`. Add `aria-label` to the new
    `#section-pair` div or drop the div and use the sections directly.
13. **`html { scroll-behavior: smooth }` is currently global.** Gate it behind
    `@media (prefers-reduced-motion: no-preference)`.
14. **Heading order.** The page is `h1` (location) → `h2` (section) → `h3` (sub-block). The current
    markup has no `h1` at all — the location name is a `div`. Fix that; the hero's location is the
    page's `h1`.
15. **Notification permission `alert()`s.** The current code fires a native `alert()` for every
    permission state. Route these into `#live-status` (`role="status"`) and a small inline toast
    instead. Native `alert()` is a blocking, unstyled modal and is jarring on a data page.

---

## 10. The landing page (`frontend/landing.html`)

A self-contained single page that exists to make one argument: **this product shows you what it
does not know.** It is not a marketing page with a demo embedded — the demo IS the page, and the
argument is carried by the readout actually attempting a live fetch. The reader watches Delhi's UV
cell come back as a dash, because the free OpenWeatherMap tier reports no UV index for any location
anywhere, and the page says so rather than printing 0.

**Why Delhi, specifically.** The city is chosen because it exercises the honest-dash path on
purpose. Its AQI is genuinely poor and its UV reading is genuinely absent, so the same panel shows
a real number beside a dash, which is the whole thesis in one row.

### 10.1 The four lamp states

The lamp is the page's only status channel, and it has four states, not three:

| `data-state` | text | meaning |
|---|---|---|
| `pending` | `connecting` | before the fetch resolves. The CSS default. |
| `live` | `live` | a current reading arrived. Green. |
| `none` | `nothing reported` | the service answered but carried no reading. Amber. |
| `down` | `api offline` | the fetch failed, timed out, or returned a non-2xx. Red. |

**`live` is a claim about the freshness of a NUMBER, so it may only be made when there is a
number.** A response with no `current` — an empty body, a proxy returning `{}`, a server a version
ahead of the contract this page was written against — answers 200 with nothing in it, and calling
that "live" sets a green lamp over six dashes. That is the single claim this page must never make.

**`api offline` would be the other falsehood**: the service is plainly up, it simply said nothing.
So `none` gets its own state and its own colour rather than being rounded to one of the existing
two. A red lamp would libel the service; a green one would libel us.

The envelope is read without destructuring. `const { data } = await res.json()` throws on a body
of `{}`, and that throw lands in the `catch` and reports "api offline" — for a service that had
just answered 200. The two are different facts and the lamp distinguishes them.

### 10.2 `put()` builds nodes; it never splices markup

Every readout cell goes through one function, `put(id, value, suffix, tail)`:

- `null`/`undefined` → the em dash. `0` → `"0"`. That distinction is the whole product, so it lives
  in one function rather than six inline ternaries.
- `suffix` becomes a real `<small>` element and `tail` a real `<span class="dir">`. Neither is built
  by string interpolation into `textContent`, which does not parse markup — an earlier version did
  exactly that and printed `80<small>%</small>` in six cells at once.
- `tail` is a separate element because it is a **different kind of thing** from the unit. The wind
  bearing is a measurement; folded into the suffix it inherited the 0.6875rem faint unit styling and
  read as leftover unit trivia hanging off the end of the speed.
- There is **no `innerHTML` anywhere in the readout**, so nothing a provider returns can reach the
  DOM as markup however the value was derived.

### 10.3 Print

The print block re-solves eight foreground tokens for white. It previously set `background: #fff` and
left every token on its dark-theme value, which printed the page's `h1` at **1.12:1** and its body
text at 1.92:1 — a blank sheet, on the one artefact a reader is most likely to carry around.
Stripping the atmosphere is only half the job; the app's own print block (§7.4) spends forty lines on
the half that was missing here.

Worst printed pair is `--faint` at 5.03:1. The neutrals are taken from the app's print block rather
than a second set invented here. The block also neutralises the grain, the mesh washes and the grid.

### 10.4 Accessibility

The lamp carries `role="status"` and `aria-live="polite"`. This was left off deliberately at first,
to keep the page free of live regions, and that was the wrong call **for this page specifically**: the
entire argument is that the product tells you what it does not know, so a reader who is never told
the API is down gets a page that silently fails at the one thing it exists to demonstrate. It is the
only live region in the document. Nothing there is focusable and the fetch never touches
`document.activeElement`.

### 10.5 The way back

`frontend/index.html` carries a `.cover-link` — a real `<a href="landing.html">` with an `arrow-left`
icon and a "Cover" label, first in the masthead's right group and hairline-separated from the
toggles so it reads as "leave the instrument" rather than as another state control. The label
collapses to the bare arrow at ≤639px.

It is an `href`, not `history.back()`: the reader may have arrived by deep link, and back would then
leave the site entirely. `app.js` never references it, and it is hidden in print — a link nobody can
follow, printed in the one place the reader might take with them.

---

## 11. Deliberate cuts


| Cut | Why |
|---|---|
| **3D globe** (`globe.gl`, `#globe-container`, `#landing-globe-container`, the "Globe" tab, the 15-city hardcoded picker) | Explicit user instruction. Also: it was a WebGL canvas with an auto-rotating camera, ~15 hardcoded cities as the only content, and no way to search within it. A 480px-tall WebGL globe displaces an entire screen of forecast data. The city picker is fully covered by `#search-form` + `#locations-bar`, both of which are keyboard-accessible. |
| **Tabbed nav** | Explicit instruction. Tabs hide data behind interaction, break deep-linking, and make the page unscrollable as a document. Replaced by one scroll and a mobile-only `#jump-bar`. |
| **Animated particle background** | Opposite of the target. 55 DOM nodes + infinite CSS animations, running permanently, for zero information. |
| **Glassmorphism** (`backdrop-filter` on 6+ elements) | Backdrop blur is one of the most expensive CSS properties; on a page that also runs Leaflet tiles it competes for GPU time. It also destroys the crisp 1px border that carries the whole flat aesthetic. |
| **Gradient-clipped hero temperature** | `-webkit-background-clip: text` is unreadable in forced-colours mode and prints as a black blob. |
| **Atmosphere percentage-bar section** | Bars normalised to arbitrary ranges (`(1013−950)/100`, `dewPoint → 50`) communicate nothing. All six fields survive in the Details grid. |
| **AQI donut gauge** | A 0–500 index is a linear scale; a ring encodes it as arc length, which is harder to read than the number. Replaced by the number + a 6-segment categorical scale that actually maps to the AQI bands. |
| **3-hourly chart time labels and per-point temperature labels** | They duplicated the column strip directly below them. Removing both is what makes the curve read as a *trend* and the strip as *data*. |
| **Horizontal pill scroller for insights** | Insight messages are sentences (`packages/shared/src/utils/weather.ts` generates multi-clause strings). Forcing them into fixed-width pills either truncates them or requires a horizontal scroll to read. Converted to a 2-column list. |
| **Brand floating, icon bobbing, empty-state float, entrance fades** | Motion with no informational content. |
| **`.theme-dark .leaflet-layer { filter: brightness(.85) }`** | Fake dark mode via a CSS filter on tiles desaturates the radar product specifically — which is the one map layer that carries a colour legend. If dark mode needs a dark basemap, use a dark tile URL. |
| **Hiding the map in `@media print`** | Reversed: a forecast page is printed to be taken outside. The map is removed from print (tiles print as noise) but everything else now prints properly with a white-surface override. |
| **`--clr-*` tokens kept alongside `--nw-*`** | Two token systems in one stylesheet guarantees drift. Full replacement. |

---

## 12. Implementation order (suggested)

1. Replace the `:root` / `.theme-light` / `.theme-dark` token blocks wholesale.
2. Delete particles, glass, tabs, globe, animations from `styles.css`. Get to a plain document.
3. Rebuild the DOM to the §4 / §5 structure, in order. Delete `.tabs-nav` and the four `.tab-panel`s
   in the same pass — do not leave a half-migrated hybrid.
4. Port the JS renderers one at a time, in the §7.5 order, deleting the matching old renderer in the
   same commit. Never have two functions writing to `#current-temp`.
5. Wire the new fields (`alerts` window/type, `insights` evidence/category, `astronomy` light windows
   and moonset, `daily` sunrise/sunset/moon/AQI, `hourly` feels-like/mm/uv, `mapLayers` opacity/refresh)
   and verify against the §6 mapping table row by row. **A §6 row with no element in the DOM is a
   field that will be dropped.**
6. Responsive pass at the five widths in §8, checking 320px for horizontal overflow.
7. Accessibility pass against the §9.2 list, item by item.

### Definition of done

- [ ] No `backdrop-filter`, no `linear-gradient` on text, and no `@keyframes` beyond the six the motion design actually ships: `panel-in`, `arc-draw`, `bar-grow`, `live-pulse` (§3.9), `spin` (the search dropdown's loader), and on the landing page `rise`, `draw`, `breathe`. An earlier version of this line read "no `@keyframes` other than `spin`" — which §3.9, added in the same revision, flatly contradicts. A reader working this checklist item by item, as a checklist invites, would have deleted the four motions the design depends on.
- [ ] No `globe` string anywhere in `index.html` or `app.js`; the `globe.gl` script tag is gone.
- [ ] No `role="tab"` or `role="tabpanel"` in the document.
- [ ] Every row in §6 has a real element in the DOM.
- [ ] Light theme is the default when `localStorage.theme` is unset, regardless of
      `prefers-color-scheme` (currently it follows the OS; a data-dense page should be light unless
      asked otherwise).
- [ ] The page has exactly one `<h1>` and it is the location name.
- [ ] `axe` reports zero violations on the page in both themes.
