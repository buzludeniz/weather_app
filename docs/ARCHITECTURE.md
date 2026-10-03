# Architecture

The README is the entry point. This document covers *why* the codebase is shaped
the way it is, and records the decisions that are expensive to rediscover.

---

## 1. The honest-data discipline

This is the spine of the project. The rest is detail.

### The rule

> A number the provider did not send is never displayed. Absence is rendered as
> an em dash, and the contract makes absence representable so that rendering it
> is easy rather than heroic.

### Why it is not obvious

Every field below was, at some point, substituted with a plausible value. Each
one looked harmless in isolation. All of them were wrong in a way that mattered:

| what was shown | what the provider actually said | how wrong |
|---|---|---|
| `UV index 0 — Low` in reassuring green | nothing; the free tier has no UV | a fabricated health verdict |
| `Visibility 10 km` | nothing | the single most reassuring value the field can take |
| `Sunrise 12:55 / Sunset 12:55` | the sun does not rise, for four months a year | a different quantity wearing the right label |
| `0% of daylight elapsed` | polar night | a fabricated progress figure |
| `AQI 0 (good)` on every forecast day | the endpoint carries no air quality | clean air reported beside a live AQI of 150 |
| `5-day highs all 30.9°` | 22–27° | **10.2 °C of error, for every city** |

The last one is the instructive one. It came from a fix that was *correct where
it was written*: a clamp recovering the already-elapsed part of today, whose
3-hour window the remaining slots no longer describe. The bug was applying it to
all seven rows instead of one.

### The failure mode: fix one branch, miss the sibling

That last defect is not an isolated mistake. The same shape occurred **five
times**, and always the same way — a field derived in one place, and its sibling
quietly disagreeing:

1. `airQuality` omitted in one branch, hardcoded `"good"` in the other
2. the current-window clamp added for today, then applied to the whole week
3. `precipitationProbability` stopped at `0` in one branch, and invented `80`
   from the same observation in the other
4. `sunrise`/`sunset` made nullable in one branch, solar-noon fallback kept in
   the other
5. the `silent` flag added to a success path, with a `state.currentTimezone = null`
   on the line *above* the new early return

**The pattern is two branches where there should be one, plus cleanup statements
adjacent to early returns.**

The response was structural, not vigilance. `mapDailyFromForecast` used to
contain two inline branches inside a single `.map()`; it now delegates to one
`dailyRow()` constructor, with the genuinely source-dependent fields isolated in
`dayMeasurements()`. Anything not dependent on which source a day came from is
computed exactly once and cannot drift.

**And:** adding a field to a contract means adding it to the nullable table in
`weather-ui-spec.md` §5.8 *in the same change*. That table exists precisely
because it was the thing that kept getting omitted.

### A real zero is not an absence

The corollary, and the easiest thing to get wrong: every consumer tests
`== null`, never truthiness. 0 hPa, 0 %, 0 km, 0 °C dew point and UV 0 are all
real measurements and all occur in production. A truthiness guard hides every
one of them, and `tsc` cannot help — a template literal accepts `null` without
complaint, which is exactly how the mobile client came to print the literal
characters `null%` through a green type check.

---

## 2. Contracts

`packages/shared/src/contracts/weather.ts` is Zod rather than bare TypeScript
types. A TS type is erased at runtime and cannot reject a malformed payload; a
schema can, and can therefore be used to *prove* a value is present before
dereferencing it. It is the only way the nullability discipline is enforceable
rather than merely documented.

Two structural notes:

- **`@nimbus/shared` resolves to `dist/`, not to source.** After editing it you
  must `npm run build -w @nimbus/shared` or the API and the clients keep
  importing the previous build. This caused one round of "the fix didn't work"
  that was really a stale artefact.
- **The schema is not yet enforced at runtime.** `WeatherBundleSchema` is
  imported by nobody at parse time; the route boundary validates only the query
  string, and both clients cast rather than parse. That is why the nullability
  work so far has been a TypeScript exercise plus unit tests, and it is the
  single highest-value thing left to add: parse at the producer.

---

## 3. Solar and lunar maths

`packages/shared/src/utils/astronomy.ts` and `lunar.ts` implement sunrise,
sunset, twilight bands, moonrise, moonset and moon phase from scratch — there is
no astronomy dependency.

Validated against OpenWeatherMap's own `sys.sunrise`/`sys.sunset` across 30
cities: **worst deviation 0.7 minutes**. That lens is considered settled.

Two subtleties that are easy to reintroduce:

- **Longitude-aware day counters.** `localNoon` and the day-boundary helpers take
  a longitude, because the local solar day is not the UTC day. Auckland, Tonga
  and Kiritimati were all getting sunrise two days early with sunset on a
  different day before this.
- **A twilight band that does not occur is `null`,** not its neighbour's
  boundary. Nuuk at 64°N on 21 December has no golden hour; it used to publish
  blue hour's closing instant under the label "Golden hour (am) from 05:48".

---

## 4. The frontend

Static: `index.html`, `app.js`, `styles.css`, plus `landing.html`. No build step,
no framework, no bundler. That is a deliberate trade — it is the fastest thing to
iterate on and the easiest thing to break subtly.

### What is load-bearing

- **Track count must equal placed item count, at every breakpoint.** A
  conditional child hidden with its track kept, or a track removed with the child
  kept, pushes the last item onto an implicit row whose `border-bottom` then
  draws a rule through the middle of it. The counts legitimately *differ* per
  breakpoint because items are hidden; the hidden ones must go with their tracks.
- **Grid auto-placement places definite-*column* items first.** `#current-facts`
  is the third child of `.current-grid`, so `grid-column: 1 / -1` alone put the
  fact strip on row 1 and pushed the hero temperature to row 2. Both `grid-row`
  and `grid-column` are scoped to `900–1199px` for this reason.
- **A shorthand can clobber a longhand set elsewhere.** This appeared four times
  (`padding` resetting `padding-inline`; `.panel` beating `.panel-flush` at equal
  specificity by source order; a `border-bottom` short/long interplay; an
  `overflow` shorthand beating a scroll axis). Every shorthand inside every
  `@media` block is now audited for it.
- **The `#map-stage` full-bleed needs a scrollbar correction on BOTH the width and
  the margin.** `100vw` includes the scrollbar gutter; `100%` does not. Fixing
  only the width moved the defect from "cropped both edges" to "cropped left, gap
  right".

### Anything painted over text must be a `background-image`

`.panel::before` is positioned, so it paints in the positioned layer — **above**
the panel's own static text. A 55% white sheen there washed out the top 42% of
every panel. A `background-image` is behind the text by construction. The bezel
chamfer stays in the `::before` because it is a 1px line inside the padding and
cannot reach a glyph.

### Tokens are solved, not chosen

Every colour was computed numerically against the **worst surface it actually
reaches** — not against white. The band colours are text on `--nw-surface`, on
`--nw-surface-sunken` (the "Now" column) and on paper, so each needed its own
solve. Worst measured pair across both themes, screen and print: **4.53:1**.

A token used in one theme but not the other is a defect; so is one used in the
print block that was not re-solved for paper. Two were found and fixed this way
(`--nw-border-input`, `--nw-text-invert`).

---

## 5. Review process

Three subagents with distinct lenses — data integrity, accessibility, visual
layout — each voting ready or not ready to ship, iterated until all three agree.

Two things about it were worth the cost:

- **The recurring ask is "systematically enumerate every field in every schema
  and ask whether absence is handled honestly, in both directions."** A producer
  that fabricates, and a consumer that assumes presence. That question found
  every defect in §1.
- **Treat agent reports as claims, not findings.** Across five rounds, roughly
  half the reported problems were real. The other half were my own verification
  tooling lying to me: a CSS resolver that missed a base rule, a contrast harness
  that built `--text` instead of `--nw-text` and reported a total contrast
  regression that did not exist, a `textContent` search that matched a comment
  *inside the app.js my own harness had injected*, a regex window too short for a
  108-line gap, and a `fetch` stub that returned `ok: true` with `status: 500`.

  The rule that emerged: **when a harness fails, read the source before changing
  the code.** Every genuine finding came from checking rendered output against a
  concrete constraint, never from CSS introspection.

---

## 6. Deliberate omissions

Things that look unfinished and are not:

- **`provider.ts` still generates fixed UTC-ish sun times** for its sample data.
  It is a demo generator, labelled `is-sample` everywhere it surfaces.
- **One `windDirection` conversion is left at `?? 0`** in the sample provider
  only. The real mapper is nullable; the sample generator always produces one.
- **The JS bundle is a single 120 KB file** with no minification, because there is
  no build step. Fine for a local instrument, wrong for a CDN.
- **No runtime schema validation at the boundary** (see §2).
