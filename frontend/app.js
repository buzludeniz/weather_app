/**
 * Nimbus Weather — Frontend Application
 * Connects to the Nimbus Express API (http://localhost:4000/v1)
 * Uses OpenWeatherMap free-tier data via the backend proxy.
 *
 * Layout and tokens follow docs/design/weather-ui-spec.md. Every field in
 * WeatherBundleSchema is rendered somewhere — see the §6 mapping table.
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   CONFIG
   ══════════════════════════════════════════════════════════════════════════ */
const API_BASE     = (window.API_BASE || 'http://localhost:4000') + '/v1';
const REFRESH_MS   = 10 * 60 * 1000; // auto-refresh every 10 min

/* Runtime-overridable configuration.
 *
 * There is deliberately no OpenWeatherMap credential here. It used to be a
 * committed literal, which handed anyone who opened devtools a live key — and
 * that key had been revoked, so all five overlay layers returned 401 and the map
 * layers rendered empty. The backend now signs each tile template
 * (`withTileKey` in provider.ts), so no secret ships in this bundle and there is
 * nothing here to override. */
const CONFIG = {
  /* CARTO basemap key, for the dark theme's raster. Also a browser-visible
   * credential, but it grants tile access only — not the OpenWeatherMap
   * endpoints — and a missing one degrades the dark basemap rather than the
   * forecast. */
  cartoTileKey: (window.NIMBUS_CONFIG && window.NIMBUS_CONFIG.cartoTileKey)
    || 'cb1_44as_1_ad43854a3212118d96e60893',
};

/* Basemaps. A CSS `filter` on the tile layer is deliberately NOT used to fake a
 * dark map (spec §7.2) — it desaturated the radar legend, the one layer that
 * carries colour meaning. Instead the dark theme gets a genuinely dark raster.
 * Both are free, key-less and map-data sources with the same terms. */
const BASE_TILES = {
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  dark: {
    // CARTO's raster API. The key is optional for basemaps at low volume but
    // rate-limits harder without one; it grants tile access only, not the
    // OpenWeatherMap endpoints.
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key='
      + (CONFIG.cartoTileKey || ''),
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors '
      + '© <a href="https://carto.com/attributions">CARTO</a>',
  },
};
const OWM_ATTRIBUTION = '© <a href="https://openweathermap.org">OpenWeatherMap</a>';

/** The basemap config for the theme currently applied. */
function baseTileConfig() {
  return state.theme === 'light' ? BASE_TILES.light : BASE_TILES.dark;
}

/* Horizontal pitch of one hourly column. The SVG curve and the column strip
 * both read this, so a temperature label sits exactly above its own column. */
const HOUR_COL_W = 58;

/* Left gutter reserved inside the SVG for the axis labels. The column strip
 * reserves the identical gutter (see `--nw-hour-gutter-*` in styles.css), so
 * column i's centre in the strip lands on curve point i's x. */
const HOUR_GUTTER_L = 26;
const HOUR_GUTTER_R = 12;

/* Leaflet arrives from a third-party `defer` script, so it can legitimately be
 * absent on the first bundle. initMap() runs on every load, so a handful of
 * attempts covers a slow CDN without ever loading a dead map. */
const MAP_INIT_ATTEMPTS = 5;

/* ══════════════════════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════════════════════ */
/* Storage can throw rather than return null: Firefox with dom.storage disabled,
 * some embedded webviews, and third-party-cookie partitioning all raise on
 * getItem. Because this is a classic script, a throw inside the `state` literal
 * would abort the whole file and leave a permanently dead page, so both reads
 * are guarded. The values are also validated: a stale or hand-edited "K" would
 * otherwise render as "°K" everywhere, since toDisplay() only tests for 'F'. */
function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* A refused write only costs the reader their preference next visit. */
  }
}

function readStored(key, allowed, fallback) {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

const state = {
  currentLat:  null,
  currentLon:  null,
  currentName: null,
  /* IANA zone of the loaded location. Every forecast instant is rendered in
   * this zone, never the viewer's — see formatTime() and friends. */
  currentTimezone: null,
  unit:        readStored('unit', ['C', 'F'], 'C'),
  /* Light is the default when nothing is stored, regardless of the OS
   * preference — a data-dense page should be light unless asked otherwise. */
  theme:       readStored('theme', ['light', 'dark'], 'light'),
  lastBundle:  null,
  activeLayerId: 'precipitation',
  mapOpacity:  null,
  /* The opacity slider is the reader's setting; it is seeded from the active
   * layer once and never overwritten again (see applyMapLayer). */
  opacitySeeded: false,
  mapLayers:   [],
  mapInitAttempts: 0,
  refreshTimer: null,
  /* True once a background refresh has failed, so the auto-refresh label can say
   * so instead of promising a refresh that is no longer scheduled. */
  refreshFailed: false,
  /* The alert count as last announced, so a background refresh only speaks when
   * that count has actually CHANGED. `null` means "never announced", which makes
   * the first cycle a change. */
  announcedAlertCount: null,
  /* The provider `source` as last announced. Same contract as the alert count: a
   * background refresh only speaks when provenance actually CHANGES, because
   * "you are now looking at sample data" is the one thing on that payload worth
   * interrupting a reader for — and without this the badge in the masthead flips
   * silently while the live region stays quiet. */
  announcedSource: null,
  loading:     false,
  loadingSeq:  0,
  toastTimer:  null,
  lastNotifiedAlertId: null,
  searchResults: [],
  searchIndex:  -1,
};

/* ══════════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════════ */
const el = (id) => document.getElementById(id);

/** Escape untrusted text before it goes into an innerHTML template. */
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchJSON(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) {
    /* The response body is NOT surfaced. It reaches
     * `renderCurrentError` -> the DOM and `announce` -> the live region, so a
     * stack trace, an HTML error page or an internal message would be read aloud
     * and painted on screen. The status code is the useful part; the body is
     * the server's business. */
    await res.text().catch(() => '');
    throw new Error(`The forecast service is unavailable (HTTP ${res.status}).`);
  }
  return res.json();
}

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

function toDisplay(celsius) {
  if (state.unit === 'F') return Math.round(celsius * 9 / 5 + 32);
  return Math.round(celsius * 10) / 10;
}

function unitLabel() { return `°${state.unit}`; }

/**
 * The unit toggle's accessible name.
 *
 * Two requirements in tension. 2.5.3 Label in Name (AA) requires the visible
 * label to be contained in the accessible name — the visible text is "°C" — and a
 * name of "Switch units to Fahrenheit" does not contain it, so "click °C" fails
 * under speech input. But naming only the *next* state is also wrong: the
 * current unit is never stated, even though it is what the numbers on the page
 * are in. So the name carries both, current first, which is the reading order a
 * sighted person gets from "°C" plus the action.
 */
function unitToggleLabel() {
  const current = state.unit === 'C' ? 'Celsius' : 'Fahrenheit';
  const next = state.unit === 'C' ? 'Fahrenheit' : 'Celsius';
  return `${unitLabel()}, ${current}. Switch to ${next}`;
}

/* ── Time zone plumbing ─────────────────────────────────────────────────────
 * Every formatter below renders a forecast instant in the LOCATION's zone, not
 * the viewer's. `toLocale*String` with no `timeZone` uses the reader's zone, so
 * a reader in UTC-7 was shown a Tirana sunrise as "8:54 PM the night before".
 *
 * `location.timezone` is only as good as its producer: the search providers map
 * a missing zone to the literal string "UTC" and the sample provider can emit
 * anything. Every candidate is therefore validated through Intl before it is
 * trusted, and an invalid one falls back to the viewer-supplied default (the
 * option simply being omitted), which is the pre-existing behaviour.
 */
const validTimeZones = new Map();

function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  if (validTimeZones.has(tz)) return validTimeZones.get(tz);
  let ok = false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    ok = true;
  } catch (err) {
    ok = false;
  }
  validTimeZones.set(tz, ok);
  return ok;
}

/**
 * The zone an instant should be rendered in.
 *
 * `tz` overrides `state.currentTimezone`; pass it when the caller has a bundle
 * in hand. Returns null when there is nothing trustworthy, which means "use the
 * runtime default zone" for every caller of tzOptions() below.
 */
function activeTimeZone(tz) {
  const candidate = tz === undefined ? state.currentTimezone : tz;
  return isValidTimeZone(candidate) ? candidate : null;
}

/** Add `timeZone` to Intl options only when we have a zone we can trust. */
function tzOptions(options, tz) {
  const zone = activeTimeZone(tz);
  return zone ? Object.assign({}, options, { timeZone: zone }) : options;
}

/** The viewer's own zone name, for the one line that labels it. */
function viewerTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  } catch (err) {
    return 'local time';
  }
}

function toDate(isoStr) {
  const d = new Date(isoStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM-DD' for an instant as it falls in the active zone. */
function dateKeyInZone(iso, tz) {
  const d = toDate(iso);
  if (!d) return null;
  return new Intl.DateTimeFormat('en-CA',
    tzOptions({ year: 'numeric', month: '2-digit', day: '2-digit' }, tz)).format(d);
}

/** Shift a 'YYYY-MM-DD' key by whole days without touching a Date. */
function shiftDateKey(key, days) {
  const parts = key.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getUTCDate()).padStart(2, '0')}`;
}

function formatTime(isoStr, tz) {
  const d = toDate(isoStr);
  if (!d) return '—';
  return d.toLocaleTimeString([], tzOptions({ hour: '2-digit', minute: '2-digit' }, tz));
}

/** The wall-clock hour as read in the active zone, 0–23. */
function hourInZone(isoStr, tz) {
  const d = toDate(isoStr);
  if (!d) return 0;
  const parts = new Intl.DateTimeFormat('en-US',
    tzOptions({ hour: '2-digit', hourCycle: 'h23' }, tz)).formatToParts(d);
  const hour = Number((parts.find((p) => p.type === 'hour') || {}).value);
  return Number.isFinite(hour) ? hour % 24 : 0;
}

function formatHour(isoStr, tz) {
  const h = hourInZone(isoStr, tz);
  if (h === 0)  return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/**
 * Compact 24-hour clock, "07:39". For the daily table's sun column ONLY.
 *
 * That cell is a single day, so AM/PM is redundant — the row already says which
 * day — and it is also the tightest fixed track on the page at 110px. The 12-hour
 * form renders "↑07:39 AM ↓07:47 PM", which is 19 characters; at the mono cut's
 * ~0.6em advance that is ~125px in an 110px box, and a grid item does not clip
 * by default, so the text ran under the next column. Dropping the meridiem
 * gives 13 characters (~86px) and is unambiguous on a dated row.
 *
 * The details grid and the hourly strip keep the 12-hour form: those are
 * labelled, single-value cells where "7:39 AM" is the more readable shape and
 * where the track is not the constraint.
 */
function formatClock(isoStr, tz) {
  const d = toDate(isoStr);
  if (!d) return '—';
  return d.toLocaleTimeString([], tzOptions({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, tz));
}

function formatDayMonth(isoStr, tz) {
  const d = toDate(isoStr);
  if (!d) return '—';
  return d.toLocaleDateString([], tzOptions({ day: 'numeric', month: 'short' }, tz));
}

/** "14:30, 29 Sep" — the details-grid form of an instant. */
function formatStamp(isoStr, tz) {
  if (!isoStr) return '—';
  return `${formatTime(isoStr, tz)}, ${formatDayMonth(isoStr, tz)}`;
}

/** "13 hr 52 min" — derived, never from the API, and zone-independent. */
function formatDuration(isoA, isoB) {
  if (!isoA || !isoB) return '—';
  const ms = new Date(isoB) - new Date(isoA);
  if (!(ms > 0)) return '—';
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} hr${h > 1 ? 's' : ''} ${m} min` : `${m} min`;
}

/**
 * "6:12 – 6:44" inside one local day, or a full stamp on both ends when the
 * window crosses local midnight. The comparison is on the *location's* dates,
 * so a window that is a single evening there is not split just because the
 * reader is on the other side of the planet.
 */
function formatTimeRange(isoA, isoB, tz) {
  if (!isoA) return '—';
  if (!isoB) return formatTime(isoA, tz);
  const a = toDate(isoA);
  const b = toDate(isoB);
  if (!a) return '—';
  if (!b) return formatTime(isoA, tz);
  const sameDay = dateKeyInZone(a, tz) === dateKeyInZone(b, tz);
  if (sameDay) return `${formatTime(a, tz)} – ${formatTime(b, tz)}`;
  const short = (d) => d.toLocaleString([], tzOptions(
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, tz));
  return `${short(a)} – ${short(b)}`;
}

/**
 * "Today" / "Tomorrow" are decided against the LOCATION's current date. Using
 * the reader's date made the first daily row read "Tomorrow" while
 * `data-today="true"` coloured it as today, and left the list with no "Today"
 * row at all for any reader west of the location.
 *
 * `daily[].date` is a bare 'YYYY-MM-DD' key, so the weekday is read from that
 * key at UTC noon rather than from a viewer's local noon — otherwise a reader
 * at UTC+14 would see the day name shift back one day.
 */
function dayName(dateStr, short = true) {
  if (!dateStr) return '—';
  const key = String(dateStr).slice(0, 10);
  const today = dateKeyInZone(new Date());
  if (today && key === today) return 'Today';
  if (today && key === shiftDateKey(today, 1)) return 'Tomorrow';
  const [y, m, day] = key.split('-').map(Number);
  if (!y || !m || !day) return '—';
  return new Date(Date.UTC(y, m - 1, day))
    .toLocaleDateString([], { weekday: short ? 'short' : 'long', timeZone: 'UTC' });
}

/**
 * Human-readable condition text that cannot throw.
 *
 * `d.condition.replace(...)` threw on a payload with the field missing, and
 * that throw used to blank the entire page. A missing condition renders as
 * "unknown" instead.
 */
function conditionText(d) {
  const raw = d && d.condition;
  return String(raw || 'unknown').replace(/_/g, ' ');
}

/**
 * The forecast row that is actually today at the location.
 *
 * Selecting `daily[0]` assumed the provider always leads with the local day.
 * When a payload is bucketed by UTC instead — or a provider groups the 3-hour
 * forecast across a local midnight — index 0 is yesterday, and the hero's high
 * and low come from the wrong day. Match on the date key, and fall back to
 * index 0 only if nothing matches.
 */
function todayPoint(bundle) {
  const daily = bundle && bundle.daily;
  if (!daily || !daily.length) return null;
  const today = dateKeyInZone(new Date());
  const match = today ? daily.find((d) => String(d.date).slice(0, 10) === today) : null;
  return match || daily[0];
}

/**
 * Is this row's daily range actually a range?
 *
 * A row that reports the same number for its high and its low has not had a
 * narrow day — it has had no day. OWM's 3-hourly list starts at the present, so
 * "today" only ever holds the buckets between now and local midnight: one at
 * 22:24, two an hour earlier. Aggregate one temperature and the high and low
 * are that temperature, and the page prints "High 14.5° / Low 14.5°" for a day
 * whose real span was about seventeen degrees. Live on Tirana, with tomorrow
 * reading 13.7 / 29.8 beside it.
 *
 * The backend marks such a row `partial`, because its slots do not cover a day.
 * A badge alone is not enough: the numbers themselves are the claim, and a
 * reader comparing them would take them at face value. So a degenerate range
 * renders as "we do not know" at every point that shows one, and the honest
 * missing-value character is used rather than the number.
 *
 * A zero-width range is impossible in nature whatever the provider claims, so if
 * one arrives it is unknown whether or not it was flagged — and the cost of being
 * wrong in that direction is a dash for a day that did have a range, which is
 * recoverable. The cost of the other direction is a physical impossibility
 * stated as fact.
 *
 * AND a `partial` row is not a range at all. The backend sets that flag when a
 * day's slots do not cover a day, so its high/low are a lower bound on the day's
 * range rather than the range: measured over 96 samples, `partial` was set on 91%
 * of today's rows and 94 of 96 printed a span that was wrong — median 0.6° under,
 * worst 5.7°, and at 23:00 local the hero read 22.3 / 16.5 against a true 8–27.
 *
 * The comment here used to say "Deliberately NOT gated on `partial`" on the
 * grounds that only degeneracy is certain — three lines after saying "a badge
 * alone is not enough: the numbers themselves are the claim". Both cannot hold,
 * and the second one is the project's own principle.
 *
 * ONE predicate, for every site that states or draws a range: the hero High/Low,
 * the tab title, the week range line, the daily row's own cells, its bar, and the
 * week scale those bars are drawn against. They used to disagree — the hero and
 * the title checked degeneracy, the week line checked nothing, the bar checked
 * neither — which is how a partial row reached the page as a range in three
 * places while being labelled in one.
 *
 * The cost of this direction is real and worth stating: a partial row's actual
 * observations are shown nowhere. That is the trade this project makes
 * everywhere else — a dash beside a `partial` chip is recoverable, a wrong number
 * presented as the day's range is not.
 */
function rangeKnown(d) {
  return !!d && d.high != null && d.low != null && d.high !== d.low && !d.partial;
}

/** Position of `value` inside [min, max] as a 0–100 percentage. */
function scalePct(value, min, max) {
  const span = max - min;
  if (!(span > 0)) return null;
  return Math.max(0, Math.min(100, ((value - min) / span) * 100));
}

/** km below, miles above — the genre convention. */
function visibilityUnit(km) {
  if (km === null || km === undefined) return { value: '—', unit: '' };
  if (state.unit === 'F') return { value: (km * 0.621371).toFixed(1), unit: 'mi' };
  return { value: String(km), unit: 'km' };
}

/** Compass direction from degrees. */
function windDir(deg) {
  if (deg === null || deg === undefined) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8] || 'N';
}

/* ══════════════════════════════════════════════════════════════════════════
   ENUM MAPS — every value audited against packages/shared/.../weather.ts
   ══════════════════════════════════════════════════════════════════════════ */

/* WeatherConditionSchema — all 11 contract values. */
const CONDITION_MAP = {
  clear:         { icon: 'sun' },
  partly_cloudy: { icon: 'cloud-sun' },
  cloudy:        { icon: 'cloud' },
  fog:           { icon: 'cloud-fog' },
  drizzle:       { icon: 'cloud-drizzle' },
  rain:          { icon: 'cloud-rain' },
  thunderstorm:  { icon: 'cloud-lightning' },
  snow:          { icon: 'snowflake' },
  sleet:         { icon: 'cloud-snow' },
  wind:          { icon: 'wind' },
  extreme:       { icon: 'alert-triangle' },
};

function conditionInfo(cond) {
  return CONDITION_MAP[cond] || { icon: 'thermometer' };
}

/* AlertSeveritySchema — all 4 contract values. `token` is the CSS mapping key
 * (`.sev-<token>` in styles.css) and `label` is the always-visible word, so the
 * colour is never the only signal. */
const SEVERITY_MAP = {
  minor:    { token: 'sev-minor',    label: 'Minor' },
  moderate: { token: 'sev-moderate', label: 'Moderate' },
  severe:   { token: 'sev-severe',   label: 'Severe' },
  extreme:  { token: 'sev-extreme',  label: 'Extreme' },
};
function severityInfo(sev) { return SEVERITY_MAP[sev] || SEVERITY_MAP.minor; }

/* Lower is more severe. Unknown values sort last rather than as "minor", so a
 * new contract value is never presented as the least urgent thing on screen. */
const SEVERITY_RANK = { extreme: 0, severe: 1, moderate: 2, minor: 3 };
function severityRank(sev) {
  const rank = SEVERITY_RANK[sev];
  return rank === undefined ? Object.keys(SEVERITY_RANK).length : rank;
}

/* WeatherAlertSchema.type — all 6 contract values. */
const ALERT_TYPE_MAP = {
  storm:       'Storm',
  flood:       'Flood',
  heat:        'Heat',
  wind:        'Wind',
  snow:        'Snow',
  air_quality: 'Air quality',
};
function alertTypeLabel(type) { return ALERT_TYPE_MAP[type] || 'Weather'; }

/* AirQualitySchema.category — all 6 contract values, in EPA band order. */
const AQI_CATEGORIES = ['good', 'moderate', 'unhealthy_sensitive', 'unhealthy', 'very_unhealthy', 'hazardous'];

/* The EPA band names. `unhealthy_sensitive` is "Unhealthy for sensitive
 * groups", not "unhealthy sensitive" — the bare replace()-underscores form was
 * contradicting the segment tooltips sitting next to it. */
const AQI_CATEGORY_LABEL = {
  good:                 'Good',
  moderate:             'Moderate',
  unhealthy_sensitive:  'Unhealthy for sensitive groups',
  unhealthy:            'Unhealthy',
  very_unhealthy:       'Very unhealthy',
  hazardous:            'Hazardous',
};

function aqiCategoryIndex(cat) {
  const i = AQI_CATEGORIES.indexOf(cat);
  return i === -1 ? 0 : i;
}

/** An out-of-contract category is echoed back verbatim rather than hidden. */
function aqiCategoryLabel(cat) {
  return AQI_CATEGORY_LABEL[cat] || (cat ? String(cat).replace(/_/g, ' ') : 'Unknown');
}

/**
 * Returns the CSS class carrying the category's colour token.
 *
 * `unhealthy_sensitive` was missing from the old map and fell through to the
 * green default, so that EPA band rendered as good air. Unknown values now warn
 * and fall back to a neutral rather than to `aqi-good`.
 */
function aqiColorClass(cat) {
  if (AQI_CATEGORIES.indexOf(cat) === -1) {
    console.warn('Nimbus: air-quality category outside AirQualitySchema.category:', cat);
    return 'aqi-unknown';
  }
  // The contract spells it `unhealthy_sensitive`; CSS classes use hyphens.
  return 'aqi-' + cat.replace(/_/g, '-');
}

/* current.uvIndex bands — Low 0–2, Moderate 3–5, High 6–7, Very high 8–10,
 * Extreme 11+. Colour is never the only signal: the word ships with it. */
const UV_BANDS = [
  { max: 2,  key: 'low',        label: 'Low' },
  { max: 5,  key: 'moderate',   label: 'Moderate' },
  { max: 7,  key: 'high',       label: 'High' },
  { max: 10, key: 'very-high',  label: 'Very high' },
  { max: Infinity, key: 'extreme', label: 'Extreme' },
];
/* Returns null when the index is not reported.
 *
 * OpenWeatherMap's free tier sends no UV reading at all, and the provider
 * already maps that to null. `Number(null) || 0` used to collapse it to 0,
 * which lands in the `low` band — so every page rendered "UV index 0 — Low" in
 * reassuring green, including in Seville at 1pm. Absence must not acquire a
 * verdict; callers check for null and print an em dash instead. */
function uvBand(index) {
  if (index === null || index === undefined) return null;
  const v = Number(index);
  if (!Number.isFinite(v)) return null;
  return UV_BANDS.find((b) => v <= b.max) || UV_BANDS[UV_BANDS.length - 1];
}
function uvWord(index) { return uvBand(index)?.label ?? ''; }
function uvKey(index) { return uvBand(index)?.key ?? ''; }

/* MoonPhaseSchema — all 8 contract values, with the standard illuminated
 * fraction for each (0/25/50/75/100/75/50/25). */
const MOON_PHASES = {
  new:              { illum: 0,   waxing: false, name: 'New moon' },
  waxing_crescent:  { illum: 25,  waxing: true,  name: 'Waxing crescent' },
  first_quarter:    { illum: 50,  waxing: true,  name: 'First quarter' },
  waxing_gibbous:   { illum: 75,  waxing: true,  name: 'Waxing gibbous' },
  full:             { illum: 100, waxing: false, name: 'Full moon' },
  waning_gibbous:   { illum: 75,  waxing: false, name: 'Waning gibbous' },
  last_quarter:     { illum: 50,  waxing: false, name: 'Last quarter' },
  waning_crescent:  { illum: 25,  waxing: false, name: 'Waning crescent' },
};

/** Derived: the fraction of the disc lit, looked up from the phase string. */
/* DELETED: `moonIllumination(phase)`. It returned `MOON_PHASES[phase].illum`
 * — a per-phase constant, 0/25/50/75/100 — and the astronomy strip printed that
 * under the label "Moon illumination". Measured over a synodic month: mean error
 * 7.9 points, maximum 21 (a real 96% rendered as 75%). The real fraction has
 * always been computed by `moonInfo` and is now carried on the contract as
 * `moonIllumination`. `MOON_PHASES[].illum` itself stays below, because
 * `phaseGlyph` uses it to place the terminator on a schematic, aria-hidden icon
 * where a quantised phase is the right input. */

function moonPhaseName(phase) {
  const info = MOON_PHASES[phase];
  return info ? info.name : (phase ? phase.replace(/_/g, ' ') : '—');
}

/**
 * Eight distinct phase glyphs, each an inline 16px SVG.
 *
 * The lit region is the limb semicircle plus a half-ellipse standing in for
 * the terminator; that ellipse's semi-minor axis is r·|2k−1|, so a new moon
 * (k=0) and a full moon (k=1) collapse onto the limb and both quarter phases
 * collapse to a straight line — which is what they actually look like.
 */
function phaseGlyph(phase, cls) {
  const info = MOON_PHASES[phase];
  if (!info) return '';
  const k = info.illum / 100;
  const r = 6.5;
  const cx = 8, cy = 8;
  const b = (r * Math.abs(2 * k - 1)).toFixed(2);
  const classAttr = cls ? ` class="${escHtml(cls)}"` : '';
  const outline = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="1.1"/>`;
  let body = outline;
  if (k >= 1) {
    body += `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
  } else if (k > 0) {
    // Right limb top → bottom, then the terminator back up. The terminator
    // bulges towards the dark side, so the crescent and gibbous cases differ
    // only in the sweep flag.
    const sweep = k < 0.5 ? 0 : 1;
    body += `<path d="M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} `
         + `A ${b} ${b} 0 0 ${sweep} ${cx} ${cy - r} Z"/>`;
  }
  const flip = info.waxing ? '' : ` transform="translate(16 0) scale(-1 1)"`;
  return `<svg${classAttr} viewBox="0 0 16 16" width="16" height="16" fill="currentColor" `
       + `stroke="none" aria-hidden="true" focusable="false"><g${flip}>${body}</g></svg>`;
}

/* InsightSchema.priority — all 3 contract values. */
const INSIGHT_PRIORITY_ICON = {
  high: 'alert-triangle', medium: 'lightbulb', low: 'info',
};

/* InsightSchema.category — all 6 contract values. */
const INSIGHT_CATEGORY_LABEL = {
  precipitation: 'Precipitation',
  temperature:   'Temperature',
  uv:            'UV',
  wind:          'Wind',
  air_quality:   'Air quality',
  travel:        'Travel',
};

/* MapLayerSchema.id — all 7 contract values. The switcher is built from the API
 * array rather than this table, so it only supplies a validated name fallback
 * and an enum check. */
const MAP_LAYER_IDS = ['radar', 'precipitation', 'clouds', 'temperature', 'wind', 'pressure', 'satellite'];
const MAP_LAYER_FALLBACK_NAME = {
  radar: 'Radar', precipitation: 'Precipitation', clouds: 'Clouds',
  temperature: 'Temperature', wind: 'Wind', pressure: 'Pressure', satellite: 'Satellite',
};

/* ══════════════════════════════════════════════════════════════════════════
   LIVE REGION / TOAST
   ══════════════════════════════════════════════════════════════════════════ */
function announce(message) {
  const live = el('live-status');
  if (!live) return;
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = message; });
}

function showToast(message) {
  const toast = el('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
  announce(message);
}

/* ══════════════════════════════════════════════════════════════════════════
   THEME
   ══════════════════════════════════════════════════════════════════════════ */
function applyTheme(t) {
  state.theme = t;
  const dark = t !== 'light';
  /* Light lives on :root; .theme-dark is the only override block, so the
   * class is simply added or removed. */
  document.body.classList.toggle('theme-dark', dark);

  el('theme-icon').innerHTML = dark ? '<i data-lucide="moon"></i>' : '<i data-lucide="sun"></i>';
  el('theme-toggle').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  refreshIcons();

  // Read the token rather than hard-coding a hex, so the two never drift.
  const pageToken = getComputedStyle(document.body).getPropertyValue('--nw-page').trim();
  const meta = el('meta-theme-color');
  if (meta && pageToken) meta.content = pageToken;

  /* The basemap is a dark raster in dark mode, not a filtered light one, so the
   * tile source and the caption both have to follow the theme. */
  if (leafletMap) {
    applyBaseTileLayer();
    renderMapCaption(currentMapLayer());
  }

  writeStored('theme', t);
}

/** Genre convention: the tab title carries today's range and the place. */
function updateTitle(current, daily0, name) {
  if (!name) {
    document.title = 'Nimbus Weather — Local Forecast';
    return;
  }
  if (current) {
    /* A degenerate range is dropped from the title rather than repeated in it:
     * "15° 15° Tirana" in a tab strip is a claim, and it is a false one. */
    const hi = rangeKnown(daily0) ? `${Math.round(toDisplay(daily0.high))}° ` : '';
    const lo = rangeKnown(daily0) ? `${Math.round(toDisplay(daily0.low))}° ` : '';
    document.title = `${hi}${lo}${name} — Nimbus Weather`.replace(/\s+/g, ' ').trim();
  } else {
    document.title = `${name} — Nimbus Weather`;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   FEATURED LOCATIONS
   ══════════════════════════════════════════════════════════════════════════ */
async function loadFeatured() {
  const strip = el('locations');
  if (!strip) return;
  strip.setAttribute('aria-busy', 'true');
  try {
    const { data } = await fetchJSON('/locations');
    strip.innerHTML = '';
    data.forEach((loc) => {
      const sub = [loc.region, loc.country].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i).join(', ');
      const fav = loc.isFavorite
        ? '<span class="loc-fav" aria-hidden="true"><i data-lucide="star"></i></span>'
        : '';
      /* A real <button>, so it is a control to assistive tech and gets the
       * platform's own activation behaviour (Enter, Space, focus ring) for free.
       * It previously claimed role="listitem" inside a list, so it was announced
       * as a list entry rather than as something you can activate.
       *
       * (An earlier version of this comment justified it by claiming ARIA 1.2
       * prohibits naming a listitem. That prohibition was ARIA **1.1** and 1.2
       * removed it — `listitem` is `Name From: author` in 1.2. The `<button>` is
       * still the right element; the stated reason was not.) */
      const li = document.createElement('button');
      /* Without this the button defaults to type="submit". Harmless while the
       * strip is not inside a form, one DOM move away from every chip
       * submitting the search form. */
      li.type = 'button';
      li.className = 'loc-chip';
      li.setAttribute('aria-label', `${loc.name}, ${sub}`);
      if (loc.isFavorite) li.dataset.favorite = 'true';
      li.innerHTML = `${fav}<span class="loc-chip-name">${escHtml(loc.name)}</span>`
        + `<span aria-hidden="true">·</span>`
        + `<span class="loc-chip-sub">${escHtml(sub)}</span>`;
      li.addEventListener('click', () => {
        // `lon`, not `longitude`: LocationResult.coordinates is
        // CoordinatesSchema = { lat, lon }. Reading `.longitude` here sent
        // lon=undefined, every chip 400'd, and the page blanked — the browser
        // Geolocation shape was mixed in by mistake.
        const lon = loc.coordinates.lon;
        if (!Number.isFinite(lon)) return;
        loadWeather(loc.coordinates.lat, lon, loc.name, li);
      });
      // No keydown handler: a real <button> already fires click on Enter and
      // Space, and preventDefault on Space would have stopped that.
      strip.appendChild(li);
    });
    refreshIcons();
  } catch (err) {
    strip.innerHTML = '<p class="loc-error">Could not load featured cities.</p>';
    el('locations-bar').hidden = true;
    // Losing the city strip is most likely exactly when search is also
    // degraded, so say so rather than silently shrinking the page.
    showToast('Could not load featured cities. Search still works.');
  } finally {
    strip.setAttribute('aria-busy', 'false');
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   SEARCH
   ══════════════════════════════════════════════════════════════════════════ */
function openSearchResults(html) {
  const box = el('search-results');
  box.innerHTML = html;
  box.hidden = false;
  el('q').setAttribute('aria-expanded', 'true');
  state.searchIndex = -1;
  el('q').removeAttribute('aria-activedescendant');
}

function closeSearchResults() {
  /* Cancel the pending debounced search FIRST.
   *
   * `onSearchInput` arms a 320ms timer, and neither Escape nor the
   * outside-click handler cleared it — so the popup closed, `aria-expanded` went
   * to "false", and the in-flight `doSearch` reopened it a third of a second
   * later. A screen-reader user who dismissed the popup was then told it had
   * come back, and a sighted user could not make it stay closed. */
  clearTimeout(searchDebounce);
  const box = el('search-results');
  box.hidden = true;
  box.innerHTML = '';
  el('q').setAttribute('aria-expanded', 'false');
  state.searchResults = [];
  state.searchIndex = -1;
  el('q').removeAttribute('aria-activedescendant');
}

function selectSearchResult(index) {
  const box = el('search-results');
  const options = box.querySelectorAll('.search-result-item');
  if (!options.length) return;
  const clamped = (index + options.length) % options.length;
  state.searchIndex = clamped;
  options.forEach((opt, i) => {
    opt.setAttribute('aria-selected', String(i === clamped));
  });
  const active = options[clamped];
  el('q').setAttribute('aria-activedescendant', active.id);
  active.scrollIntoView({ block: 'nearest' });
}

function commitSearchResult(index) {
  const loc = state.searchResults[index];
  if (!loc) return;
  closeSearchResults();
  el('q').value = '';
  loadWeather(loc.coordinates.lat, loc.coordinates.lon, loc.name);
  /* Send focus somewhere real. The whole page has just been replaced and the
   * input is empty, so leaving the caret there strands the keyboard reader at
   * the top of a document they have to re-traverse. `#current-location` is the
   * h1 that now names what is on screen. */
  const heading = el('current-location');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

async function doSearch(q) {
  if (!q.trim()) { closeSearchResults(); return; }
  /* `role="presentation"` and `aria-hidden`, matching the no-results and
   * search-failed states. A `listbox` may own only `option` and `group`, so an
   * unroled `<div>` is an invalid child — and this is the state the popup holds
   * for the whole request, i.e. precisely when the API is slow or down. */
  openSearchResults('<div class="search-loading" role="presentation"><div class="spinner" aria-hidden="true"></div></div>');
  try {
    const { data } = await fetchJSON('/locations/search?q=' + encodeURIComponent(q));
    if (!el('q').value.trim()) return;
    if (!data.length) {
      state.searchResults = [];
      /* `role="presentation"` keeps the <p> a legal child of the listbox, which
       * may only contain option/group — an unroled <p> there is invalid. The
       * message is also announced: focus stays in the input, so a screen-reader
       * user had no other way of learning the search had come back empty. */
      openSearchResults('<p class="search-no-results" role="presentation">No cities found — try a different name.</p>');
      announce('No cities found. Try a different name.');
      return;
    }
    state.searchResults = data;
    openSearchResults('');
    const box = el('search-results');
    data.forEach((loc, i) => {
      const sub = [loc.region, loc.country].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i).join(', ');
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.id = `search-option-${i}`;
      div.setAttribute('role', 'option');
      div.setAttribute('aria-selected', 'false');
      div.innerHTML = `
        <span class="loc-flag" aria-hidden="true"><i data-lucide="map-pin"></i></span>
        <div>
          <div class="loc-name">${escHtml(loc.name)}</div>
          <div class="loc-sub">${escHtml(sub)}</div>
        </div>`;
      /* `mousedown` is prevented so the input keeps DOM focus.
       *
       * The options are `role="option"` divs, not focusable, so a click on one
       * blurs the combobox to <body> before `click` fires — and `closeSearchResults`
       * then removes the popup, so focus ended on <body> with the whole page
       * replaced under it. The keyboard path (Enter) keeps focus in the input, so
       * the two routes behaved differently for no good reason. */
      div.addEventListener('mousedown', (e) => e.preventDefault());
      div.addEventListener('click', () => commitSearchResult(i));
      div.addEventListener('mousemove', () => selectSearchResult(i));
      box.appendChild(div);
    });
    refreshIcons();
  } catch (err) {
    state.searchResults = [];
    /* Same treatment as the empty result: announced, and kept out of the
     * listbox role. A failed search was previously completely silent. */
    openSearchResults('<p class="search-no-results" role="presentation">Search failed — is the API running?</p>');
    announce('Search failed. The location service may be unavailable.');
  }
}

let searchDebounce = null;
function onSearchInput(value) {
  clearTimeout(searchDebounce);
  if (!value.trim()) { closeSearchResults(); return; }
  searchDebounce = setTimeout(() => doSearch(value), 320);
}

function onSearchKeydown(e) {
  const box = el('search-results');
  if (e.key === 'Escape') { closeSearchResults(); return; }
  if (box.hidden) {
    /* Let ArrowDown open a closed popup, so the list is reachable without
     * typing. Previously the only way in was to produce results first. */
    if (e.key === 'ArrowDown' && state.searchResults.length) {
      e.preventDefault();
      selectSearchResult(0);
    }
    return;
  }
  if (e.key === 'ArrowDown') { e.preventDefault(); selectSearchResult(state.searchIndex + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); selectSearchResult(state.searchIndex - 1); }
  /* Home/End move the LIST cursor only once the reader has actually entered it.
   * Intercepting them whenever the popup happened to be open meant someone
   * editing their query could no longer jump to the start or end of their own
   * text — the standard caret keys were stolen by a widget they had not engaged. */
  else if (e.key === 'Home' && state.searchIndex >= 0) { e.preventDefault(); selectSearchResult(0); }
  else if (e.key === 'End' && state.searchIndex >= 0) { e.preventDefault(); selectSearchResult(state.searchResults.length - 1); }
  else if (e.key === 'Enter' && state.searchIndex >= 0) { e.preventDefault(); commitSearchResult(state.searchIndex); }
}

/* ══════════════════════════════════════════════════════════════════════════
   GEOLOCATION
   ══════════════════════════════════════════════════════════════════════════ */
function useMyLocation() {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser.');
    return;
  }
  const btn = el('geo-btn');
  /* `aria-disabled`, not `disabled`.
   *
   * Disabling the control the reader just activated blurs it to <body> in every
   * major browser, so their place in the tab order is destroyed the instant they
   * press it — and geolocation can take up to 10 seconds to answer.
   * `aria-disabled` keeps it focusable, and `aria-busy` states the condition. The
   * click handler short-circuits below, so it still cannot be double-fired. */
  const setBusy = (busy) => {
    if (busy) {
      btn.innerHTML = '<span aria-hidden="true"><i data-lucide="loader-circle" class="spin"></i></span>';
      btn.setAttribute('aria-disabled', 'true');
      btn.setAttribute('aria-busy', 'true');
    } else {
      btn.innerHTML = '<i data-lucide="map-pin"></i>';
      btn.removeAttribute('aria-disabled');
      btn.removeAttribute('aria-busy');
    }
    refreshIcons();
  };
  if (btn.getAttribute('aria-disabled') === 'true') return;
  setBusy(true);
  const reset = () => setBusy(false);
  /* Geolocation can take up to 10 seconds to answer. If the reader picks a
   * city in the meantime, that is a newer intent than the one they expressed by
   * tapping the button, so the late callback must not overwrite it. Without
   * this, an impatient click on a featured city is silently replaced by
   * "My Location" when the permission prompt finally resolves. */
  const requestedAt = state.loadingSeq;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      reset();
      if (state.loadingSeq !== requestedAt) return;
      loadWeather(pos.coords.latitude, pos.coords.longitude, 'My Location');
    },
    (err) => {
      reset();
      /* Not `err.message`: this string goes to the DOM and is announced, so a
       * geolocation API message (which varies by browser and can name internal
       * states) must not be read aloud verbatim. */
      showToast('Could not get your location. Check the browser permission and try again.');
    },
    { timeout: 10000, maximumAge: 300000 }
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   RENDERERS
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Current / hero ─────────────────────────────────────────────────────── */
function renderCurrent(current, daily0, location, generatedAt) {
  const info = conditionInfo(current.condition);
  /* The zone is read from the bundle rather than from module state so the hero
   * can never contradict the "Local time" line beside it. */
  const tz = activeTimeZone(location && location.timezone);

  el('current-location').textContent = String(location.name || 'Unknown location');
  /* De-duplicated: a provider that reports only a country code would otherwise
 * render "CA, CA". The OWM mapper now omits `region` entirely, but a saved or
 * search-derived location could still repeat it. */
  el('current-region').textContent = [location.region, location.country]
    .filter((v, i, a) => Boolean(v) && a.indexOf(v) === i)
    .join(', ');

  /* Both of these must come out of the same formatter with the same zone: the
   * previous pair ("As of 05:39 PM" above "Local time 02:39 AM") differed by
   * exactly the reader's offset from the location. */
  const localNow = formatTime(generatedAt || current.observedAt, tz);
  el('current-timezone').textContent =
    `Local time ${localNow} (${tz || viewerTimeZone()})`;

  const observed = el('current-observed');
  observed.textContent = `As of ${formatTime(current.observedAt, tz)}`;
  /* Only set `datetime` for a parseable instant. It used to be written
   * unconditionally, so a payload missing `observedAt` produced the literal
   * attribute `datetime="undefined"` — which no AT can read and which reads as
   * a bug to anyone inspecting the DOM. The element is a `<time>`, so the
   * attribute is meaningful. */
  if (current.observedAt && !Number.isNaN(Date.parse(current.observedAt))) {
    observed.setAttribute('datetime', current.observedAt);
  } else {
    observed.removeAttribute('datetime');
  }
  el('current-generated').textContent = `Data generated ${formatTime(generatedAt, tz)}`;
  el('current-conditions').textContent = toDate(current.observedAt)
    ? toDate(current.observedAt).toLocaleDateString([],
      tzOptions({ weekday: 'long', day: 'numeric', month: 'long' }, tz))
    : '';

  el('current-icon').innerHTML = `<i data-lucide="${info.icon}"></i>`;
  el('current-icon').dataset.condition = current.condition;
  el('current-temp').textContent = `${toDisplay(current.temperature)}${unitLabel()}`;
  el('current-condition').textContent = current.conditionText;

  el('fact-feels').textContent = `${toDisplay(current.feelsLike)}${unitLabel()}`;
  /* High/Low come from daily[0] — there is no current high/low in the contract.
   * A degenerate range is not shown as a range: see `rangeKnown`. */
  el('fact-high').textContent = rangeKnown(daily0) ? `${toDisplay(daily0.high)}${unitLabel()}` : '—';
  el('fact-low').textContent = rangeKnown(daily0) ? `${toDisplay(daily0.low)}${unitLabel()}` : '—';

  el('current-error').classList.add('hidden');
  el('current-temp-wrap').classList.remove('is-loading');
  el('current-block').classList.remove('is-error');
  el('section-current').classList.remove('is-loading');
  document.body.dataset.condition = current.condition || 'clear';

  updateTitle(current, daily0, location.name);
  refreshIcons();
}

/**
 * @param {string} message  Untrusted; sanitised below.
 * @param {boolean} silent  True for a BACKGROUND refresh. A failed background
 *   poll must not take over the page.
 */
function renderCurrentError(message, silent) {
  /* The message is written to the DOM and reaches the live region, so it is
   * treated as untrusted: a JavaScript TypeError from anywhere in the load path
   * would otherwise be shown and read aloud verbatim. Anything not one of our
   * own sentences is replaced with a plain-English fallback.
   *
   * Membership, not a prefix. This was `/^(The forecast service|…)/`, which
   * accepts any string BEGINNING with one of our sentences — probed with
   * "The forecast service is unavailable (HTTP 500). <img src=x onerror=…>", the
   * whole thing reached the DOM, the toast and the live region. Not exploitable
   * today (the text goes in via `textContent`, and nothing constructs such a
   * message), but the guard did not do what its comment claimed, which is worse
   * than no guard: it invites the next reader to widen the prefix.
   *
   * So the two shapes this file can actually produce are matched exactly. */
  const RAW = String(message || '');
  const isOurs = /^The forecast service is unavailable \(HTTP \d{3}\)\.$/.test(RAW)
    || RAW === 'The forecast service returned an incomplete response.';
  const safe = isOurs ? RAW : 'The forecast could not be loaded. Please try again.';

  if (silent) {
    /* Keep the last good forecast on screen.
     *
     * A background refresh failing says nothing about the data already on the
     * page, and the full error treatment below is destructive by design: it
     * blanks the hero, all eight sections, the map, the alerts and
     * `state.lastBundle`. Doing that on a timer meant that once the API was
     * unreachable for more than ten minutes, a reader who had scrolled to the
     * astronomy panel or started typing a city lost their entire context with no
     * action of their own — and a screen-reader user had the whole document
     * replaced mid-sentence, every ten minutes, forever. The same recurring
     * interruption the `silent` flag on the success path exists to prevent.
     *
     * So: a quiet inline note, no toast, no announcement, and the existing
     * forecast left intact. If there is no previous bundle there is nothing to
     * preserve, so fall through to the full treatment. */
    if (state.lastBundle) {
      el('current-error-text').textContent = 'Showing the last update — the service is not responding.';
      el('current-error').classList.remove('hidden');
      el('current-temp-wrap').classList.remove('is-loading');
      el('section-current').classList.remove('is-loading');
      return;
    }
  }

  el('current-temp').textContent = '—';
  el('current-condition').textContent = 'Forecast unavailable';
  el('current-error-text').textContent = safe;
  el('current-error').classList.remove('hidden');
  el('current-temp-wrap').classList.remove('is-loading');
  el('current-block').classList.add('is-error');
  el('section-current').classList.remove('is-loading');

  /* Clear EVERY section, not just the hero.
   *
   * The previous version only blanked the temperature, the facts, and the
   * region/zone lines. That left the old city name, the old "As of" time, and
   * eight intact sections of the previous location's data sitting under the new
   * location's error message — a reader could easily believe they were looking
   * at the new city. A stale forecast from somewhere else is worse than an
   * honest blank. */
  el('current-location').textContent = '—';
  el('current-conditions').textContent = '';
  el('current-observed').textContent = '';
  el('current-observed').removeAttribute('datetime');
  el('current-place').querySelectorAll('.current-region, .current-timezone, .current-generated')
    .forEach((node) => { node.textContent = ''; });
  el('current-facts').querySelectorAll('.fact-value').forEach((n) => { n.textContent = '—'; });

  /* The hero icon is a weather glyph for the *previous* city. Leaving a
   * thunderstorm cloud next to "Forecast unavailable" for a place that is no
   * longer on screen is exactly the leak this function exists to prevent. */
  el('current-icon').innerHTML = '';
  el('current-icon').dataset.condition = '';
  document.body.removeAttribute('data-condition');

  /* Provenance and the map both describe the previous location too. initMap
   * only runs on the success path, so the map is still showing the old tiles
   * and still marked Live or Sample for the old fetch. */
  renderSource(null);
  renderMapCaption(null);
  const mapStage = el('map-stage');
  if (mapStage) mapStage.hidden = true;
  el('map-layer-refresh').textContent = 'Map unavailable';
  el('map-caption').textContent = 'The map is not showing the requested location.';

  renderAlerts([]);
  renderInsights([]);
  renderHourly([]);
  renderDaily([], null);
  renderDetails(null);
  renderAirQuality(null);
  renderAstronomy(null);
  state.lastBundle = null;
  updateTitle(null, null, 'Forecast unavailable');

  /* Drop the highlighted chip: the city it marked did not load. */
  document.querySelectorAll('.loc-chip.active').forEach((chip) => chip.classList.remove('active'));

  /* `safe`, not `message`. This line used the raw value, so the sanitiser
   * added for the inline text was bypassed 50 lines later: a `fetch` rejection —
   * the single most likely failure, i.e. the API not running — put the literal
   * string "Failed to fetch" into the live region via `showToast` -> `announce`,
   * and painted the same on screen. `showToast` both displays and announces, so
   * the raw value reached the reader twice.
   *
   * Not reached on a silent background failure: that path returns early above, so
   * a failing poll neither toasts nor announces, and the toast at <=639px sits
   * over the jump bar. */
  showToast(safe);
}

/* ── Alerts ─────────────────────────────────────────────────────────────── */

/* Every producer emits location-independent constant alert ids — "wind-gust",
 * "heavy-rain", "thunderstorm" — so an id alone cannot identify an occurrence.
 * Dedupe on the location as well, or a genuinely new city's identical alert is
 * silently swallowed. */
function alertKey(a) {
  /* Deliberately NOT keyed on startsAt. The producers stamp `startsAt` with the
   * fetch time, so it changes on every 10-minute refresh and a persistent alert
   * would raise a fresh OS notification each cycle, forever. Location plus
   * alert id is the stable identity; the severity is folded in so an alert that
   * escalates is announced again. */
  return `${state.currentName || ''}:${a.id}:${a.severity}`;
}

/* Most severe first. The backend emits alerts in derivation order
 * (wind, rain, air quality, thunderstorm) regardless of severity, so without
 * this a minor wind advisory can sit above an extreme air-quality alert. */
function sortAlertsBySeverity(alerts) {
  return [...alerts].sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function renderAlerts(alerts) {
  const band = el('alerts');
  if (!alerts || !alerts.length) {
    band.classList.add('hidden');
    band.innerHTML = '';
    state.lastNotifiedAlertId = null;
    return;
  }
  const ordered = sortAlertsBySeverity(alerts);
  band.classList.remove('hidden');
  band.innerHTML = ordered.map((a) => {
    const sev = severityInfo(a.severity);
    const type = alertTypeLabel(a.type);
    return `
      <article class="alert-item" id="alert-${escHtml(a.id)}" data-sev="${escHtml(sev.token)}" data-severity="${escHtml(a.severity)}">
        <span class="alert-badge">${escHtml(sev.label)}</span>
        <div class="alert-text">
          <strong class="alert-title">${escHtml(a.title)}</strong>
          <p class="alert-desc">${escHtml(a.description)}</p>
          <p class="alert-window" data-starts-at="${escHtml(a.startsAt)}" data-ends-at="${escHtml(a.endsAt)}">
            ${escHtml(formatTimeRange(a.startsAt, a.endsAt))}
            · <span class="alert-type">${escHtml(type)}</span>
          </p>
          <span class="alert-source">${escHtml(a.source)}</span>
        </div>
      </article>`;
  }).join('');

  /* No announce() here. It was written and then overwritten by the single
   * consolidated announcement in loadWeather within the same frame, so the live
   * region was mutated twice per load and the second write always won. */

  /* Notify about the most severe alert, and only for one this city has not
   * already announced. Taking alerts[0] picked whatever the backend happened to
   * derive first, which is not necessarily the one worth waking someone for. */
  const top = ordered[0];
  const key = top ? alertKey(top) : null;
  if (top && key !== state.lastNotifiedAlertId) {
    state.lastNotifiedAlertId = key;
    if (notificationsGranted()) {
      try {
        new Notification(top.title || 'Weather alert', { body: top.description || '' });
      } catch (err) { /* notification construction is best-effort */ }
    }
  }
}

/* ── Data source label ──────────────────────────────────────────────────── */
/**
 * Show which provider produced this bundle. The API silently falls back to
 * deterministic sample data when the live provider fails, so without this the
 * two are indistinguishable in the UI.
 */
function renderSource(bundle) {
  const label = el('data-source');
  const footer = el('site-footer');
  const credit = footer ? footer.querySelector('#footer-credit') : null;
  if (!label) return;
  // Tolerates a null bundle so the error path can clear provenance.
  const source = bundle && bundle.source;
  if (!source) {
    label.hidden = true;
    if (credit) credit.textContent = 'Data via the Nimbus API';
    return;
  }
  const isLive = source === 'openweathermap';
  label.hidden = false;
  label.textContent = isLive ? 'Live data' : 'Sample data';
  label.classList.toggle('is-sample', !isLive);
  /* The breathing status dot is driven off this attribute, not off `.is-sample`
   * — a rule of the form `.is-sample::before { animation: … }` has to be
   * re-negated for every other state, and the moment a third state appears the
   * negation is forgotten and a stale dot pulses on sample data. An explicit
   * attribute has exactly one true value. */
  label.dataset.source = isLive ? 'live' : 'sample';
  label.title = isLive
    ? 'Live data from OpenWeatherMap'
    : 'Showing generated sample data — the live provider is unavailable';
  // Do not credit OpenWeatherMap for data the service never fetched from it.
  if (credit) {
    credit.textContent = isLive
      ? 'Live data from OpenWeatherMap'
      : 'Generated sample data — live provider unavailable';
  }
}

/* ── Insights ───────────────────────────────────────────────────────────── */
function renderInsights(insights) {
  const band = el('insights');
  const list = el('insight-list');
  if (!insights || !insights.length) {
    band.classList.add('hidden');
    list.innerHTML = '';
    el('insights-meta').textContent = '';
    return;
  }
  band.classList.remove('hidden');
  el('insights-meta').textContent = `${insights.length} insight${insights.length === 1 ? '' : 's'}`;

  list.innerHTML = insights.map((ins) => {
    const priority = ins.priority || 'low';
    const icon = INSIGHT_PRIORITY_ICON[priority] || 'info';
    const kicker = INSIGHT_CATEGORY_LABEL[ins.category] || 'Weather';
    /* `role="listitem"` pairs with the container's `role="list"`. `.insight-evidence`
   * sets `list-style: none` on the CONTAINER, which is the one case where
   * WebKit/VoiceOver strips list semantics entirely — the `·` from `li::before`
   * then reads as a run-on with no structure. The other five lists in the app
   * set `list-style: none` on the children, which keeps semantics. */
  const evidence = (ins.evidence || [])
    .map((e) => `<li role="listitem">${escHtml(e)}</li>`).join('');
    return `
      <li class="insight-item" id="insight-${escHtml(ins.id)}" data-priority="${escHtml(priority)}" role="listitem">
        <span class="insight-icon" aria-hidden="true"><i data-lucide="${icon}"></i></span>
        <div class="insight-body">
          <p class="insight-kicker">${escHtml(kicker)}</p>
          <p class="insight-msg">${escHtml(ins.message)}</p>
          ${evidence ? `<ul class="insight-evidence" role="list">${evidence}</ul>` : ''}
        </div>
      </li>`;
  }).join('');
  refreshIcons();
}

/* ── Hourly ─────────────────────────────────────────────────────────────── */
/**
 * Detect the interval between the first two forecast points.
 *
 * The sample provider emits hourly steps; the OpenWeatherMap free tier emits
 * 3-hour steps. Labelling ticks with the wrong step would read "12pm, 3pm, 6pm"
 * as consecutive hours, so the label is derived from the data instead.
 */
function detectStepHours(hourly) {
  if (!hourly || hourly.length < 2) return 1;
  const diffMs = new Date(hourly[1].time) - new Date(hourly[0].time);
  const hours = diffMs / 3_600_000;
  if (!(hours > 0)) return 1;
  // Round to a whole hour so DST-shifted or off-grid steps still label sanely.
  return Math.max(1, Math.round(hours));
}

function stepLabel(stepHours) {
  return stepHours === 1 ? 'Hourly' : `Every ${stepHours} hours`;
}

function hourlyRangeLabel(hourly) {
  const temps = hourly.map((h) => toDisplay(h.temperature));
  return `${Math.round(Math.min(...temps))}° – ${Math.round(Math.max(...temps))}°`;
}

function hourlyWindLabel(hourly) {
  if (!hourly.length) return '';
  /* `windSpeed` is nullable, and `Math.min(null)` is 0 — so an unfiltered list
   * reads "0–0 km/h", a dead calm asserted from slots that measured nothing. With
   * every slot unmeasured there is no range to quote, and the whole label goes:
   * this is a section summary, so a partial one is better than a false one. */
  const speeds = hourly.map((h) => h.windSpeed).filter((s) => s != null);
  if (!speeds.length) return '';
  const lo = Math.round(Math.min(...speeds));
  const hi = Math.round(Math.max(...speeds));
  const speed = lo === hi ? `${lo} km/h` : `${lo}–${hi} km/h`;
  /* The direction is nullable now, and the schema agrees (see the Wind detail
   * cell). "W → N" is a claim about where the wind came from and went, and with
   * no reading there is nothing to claim — printing "—" twice would read as two
   * unknown bearings. */
  const first = hourly[0].windDirection;
  const last = hourly[hourly.length - 1].windDirection;
  if (first == null || last == null) return `Wind ${speed}`;
  const from = windDir(first);
  const to = windDir(last);
  return from === to ? `Wind ${speed} ${from}` : `Wind ${speed} ${from} → ${to}`;
}

/**
 * The temperature trend line. A sparkline, not a chart: 96px tall, two grid
 * lines, no time axis and no per-point temperature labels — both of those
 * numbers now live in the column strip directly below.
 *
 * The left gutter is exactly the padding `#hourly-scroll` reserves, so curve
 * point i's x and column i's centre agree to the pixel.
 */
function renderHourlyChart(hourly) {
  const svg = el('hourly-chart');
  const wrap = el('hourly-chart-wrap');
  if (!svg || !wrap) return;
  if (!hourly || !hourly.length) {
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.innerHTML = '';
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;

  const pointWidth = HOUR_COL_W;
  const padLeft = HOUR_GUTTER_L, padRight = HOUR_GUTTER_R, padTop = 18, padBottom = 24;
  const plotHeight = 54;
  const width = padLeft + padRight + pointWidth * hourly.length;
  const height = padTop + plotHeight + padBottom;
  const baseline = padTop + plotHeight;

  const temps = hourly.map((h) => h.temperature);
  const rawMin = Math.min(...temps);
  const rawMax = Math.max(...temps);
  // Pad the temperature range so a flat day does not render as a straight
  // line pinned to the top of the plot.
  const spread = Math.max(rawMax - rawMin, 2);
  const min = rawMin - spread * 0.15;
  const max = rawMax + spread * 0.15;
  const span = Math.max(max - min, 0.001);

  const xFor = (i) => padLeft + i * pointWidth + pointWidth / 2;
  const yFor = (t) => baseline - ((t - min) / span) * plotHeight;

  const line = hourly.map((h, i) => `${xFor(i).toFixed(1)},${yFor(h.temperature).toFixed(1)}`).join(' ');
  const areaPath =
    `M ${xFor(0).toFixed(1)} ${baseline} ` +
    line.split(' ').map((p) => `L ${p}`).join(' ') +
    ` L ${xFor(hourly.length - 1).toFixed(1)} ${baseline} Z`;

  // Only the two extreme grid lines; the values must go through the same unit
  // conversion as everything else, or switching to °F leaves the axis in Celsius.
  const gridlines = [0, 1].map((f) => {
    const y = baseline - f * plotHeight;
    const value = Math.round(toDisplay(min + f * span));
    const anchor = f === 1 ? 'start' : 'end';
    const yPos = f === 1 ? padTop - 6 : baseline + 14;
    return `
      <line class="chart-grid" x1="${padLeft}" y1="${y.toFixed(1)}" x2="${(width - padRight).toFixed(1)}" y2="${y.toFixed(1)}" />
      <text class="chart-axis-label" x="${padLeft - 6}" y="${yPos.toFixed(1)}" text-anchor="${anchor}">${value}°</text>`;
  }).join('');

  const bars = hourly.map((h, i) => {
    if (!(h.precipitationProbability > 0)) return '';
    const h2 = (h.precipitationProbability / 100) * (plotHeight * 0.6);
    return `<rect class="chart-precip-bar" x="${(xFor(i) - 1.5).toFixed(1)}" `
         + `y="${(baseline - h2).toFixed(1)}" width="3" height="${h2.toFixed(1)}" rx="1" />`;
  }).join('');

  const points = hourly.map((h, i) =>
    `<circle class="chart-point" cx="${xFor(i).toFixed(1)}" cy="${yFor(h.temperature).toFixed(1)}" r="2.5" />`
  ).join('');

  const step = detectStepHours(hourly);
  const peakPop = Math.max(...hourly.map((h) => h.precipitationProbability));
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-label',
    `Forecast of ${hourly.length} points at ${stepLabel(step).toLowerCase()}, `
    + `${Math.round(toDisplay(rawMin))} to ${Math.round(toDisplay(rawMax))} degrees, `
    + `peak rain chance ${peakPop} percent`);
  svg.innerHTML = `${gridlines}<g>${bars}</g>`
    + `<path class="chart-area" d="${areaPath}" />`
    + `<polyline class="chart-line" points="${line}" />`
    + `<g>${points}</g>`;
}

function renderHourlyStrip(hourly) {
  const list = el('hourly');
  if (!list) return;
  if (!hourly || !hourly.length) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = hourly.map((h, i) => {
    const info = conditionInfo(h.condition);
    const delta = Math.abs(toDisplay(h.feelsLike) - toDisplay(h.temperature));

    /* "Now" only when it IS now.
     *
     * The first slot is a FORECAST, not the current observation: with a 3-hour
     * step it is 0-2 h 59 m ahead, and the block containing the present moment is
     * not in the strip at all. Labelling column 0 "Now" — and marking it
     * `aria-current="time"` — told the reader the first figure was observed when
     * it was not, and made the strip's times jump from "Now" straight to "1am",
     * a gap that does not exist in the data. Auckland at 20:06 showed
     * "Now 13° | 1am 12°" for an hour two hours in the future.
     *
     * The current conditions are already shown in the hero directly above, so a
     * column claiming to be "Now" adds nothing. Inside 30 minutes of now the
     * label is kept, because then it is literally true. */
    const isNow = i === 0
      && Math.abs(Date.parse(h.time) - Date.now()) < 30 * 60 * 1000;

    /* Reserve every slot rather than omitting one.
     *
     * `.hour-col` is a flex column with no fixed slot heights, so dropping a
     * child shifted everything below it up a line: the precipitation figures
     * ended up on 2-3 different baselines across 48 columns, which is the same
     * failure mode as the old `.daily-row` grid bug, in the flex axis. An empty
     * slot keeps the column aligned; the class hides the content but not the
     * space. */
    const slot = (cls, html, extra, title) => html
      ? `<span class="${cls}${extra ? ' ' + extra : ''}"${title ? ` title="${escHtml(title)}"` : ''}>${html}</span>`
      : `<span class="${cls} is-empty" aria-hidden="true"></span>`;

    const feels = slot('hour-feels', delta >= 2
      ? `feels ${Math.round(toDisplay(h.feelsLike))}°` : '');

    /* Each sub-value carries a `visually-hidden` prefix, the same technique the
     * daily rows already use. Without them a column announced as a bare
     * "Now 21° 40% 0.4mm ↑6" — three unlabelled numbers. The prefixes are
     * emitted only when there IS a value, so a slot never announces a label with
     * nothing after it.
     *
     * The `uv-<band>` class goes on the SLOT, not on a span nested inside it.
     * `.hour-uv` reads `color: var(--uv, …)`, and the `.uv-high` mapping rule
     * defines `--uv` on whatever element it matches — with the class on a child,
     * the slot never matched, `var(--uv)` always took the fallback, and every UV
     * chip rendered in faint grey with the five band colours dead. The `title`
     * also belongs on the slot: a tooltip on a non-interactive nested span is
     * unreachable by keyboard. */
    const pop = slot('hour-pop', h.precipitationProbability > 0
      ? `<span class="visually-hidden">Chance of precipitation </span>${h.precipitationProbability}%`
      : '');
    const mm = slot('hour-mm', h.precipitationMm > 0
      ? `<span class="visually-hidden">Precipitation </span>${h.precipitationMm}`
        + '<span class="visually-hidden"> millimetres</span>'
      : '');
    const uv = h.uvIndex != null && h.uvIndex >= 6
      ? slot('hour-uv', `<span class="visually-hidden">UV index </span>${h.uvIndex}`,
             `uv-${uvKey(h.uvIndex)}`, `UV index ${h.uvIndex} — ${uvWord(h.uvIndex)}`)
      : slot('hour-uv', '');

    /* `role="listitem"`, NOT `role="group"`.
     *
     * A previous version used `group` with a summarised `aria-label`, on the
     * premise that ARIA marks the listitem name author-prohibited. That
     * prohibition was ARIA **1.1**; 1.2 removed it, so the premise was wrong —
     * and the swap was actively harmful:
     *   - `role="list"` requires owned `listitem`s, so the strip became a list
     *     containing zero items, which is a 1.3.1 failure.
     *   - naming the group AND leaving the text inside it meant every column's
     *     time and temperature were spoken twice, with the "feels like" wording
     *     differing between the two copies.
     * The `visually-hidden` prefixes on the sub-values above do the labelling
     * without either problem, and are emitted only when there IS a value. */
    const classes = ['hour-col'];
    /* The divider marks the boundary between the observed "Now" column and the
     * forecast. Since the "Now" label became conditional (the first slot is up
     * to 2 h 59 m ahead, so it is only labelled "Now" when it is genuinely
     * within 30 minutes), an unconditional divider put a strong rule between
     * two ordinary forecast hours — with no meaning. */
    if (i === 1 && isNow) classes.push('hour-divider');
    return `
      <li class="${classes.join(' ')}" role="listitem" data-now="${isNow}"${
        isNow ? ' aria-current="time"' : ''}>
        <span class="hour-time">${isNow ? 'Now' : formatHour(h.time)}</span>
        <span class="hour-icon" aria-hidden="true"><i data-lucide="${info.icon}"></i></span>
        <span class="hour-temp">${Math.round(toDisplay(h.temperature))}°</span>
        ${feels}${pop}${mm}${uv}
      </li>`;
  }).join('');
  refreshIcons();
}

function renderHourly(hourly) {
  const has = Boolean(hourly && hourly.length);
  const step = detectStepHours(hourly || []);
  el('hourly-step').textContent = has ? stepLabel(step) : '';
  el('hourly-range').textContent = has ? hourlyRangeLabel(hourly) : '';
  el('hourly-wind').textContent = has ? hourlyWindLabel(hourly) : '';
  /* Hide the section when there is nothing to show. It used to render a heading
   * with three empty meta slots above an empty scroller — a ~42px blank white bar
   * on the error path. */
  el('section-hourly').classList.toggle('hidden', !has);
  renderHourlyChart(hourly);
  renderHourlyStrip(hourly);
  // A new location always starts at "Now" / "Today", not mid-scroll.
  el('hourly-scroll').scrollLeft = 0;
  el('hourly-chart-wrap').scrollLeft = 0;
}

/* Keep the sparkline and the column strip on the same horizontal offset. */
let syncingScroll = false;
function initHourlyScrollSync() {
  const wrap = el('hourly-chart-wrap');
  const strip = el('hourly-scroll');
  if (!wrap || !strip) return;
  wrap.addEventListener('scroll', () => {
    if (syncingScroll) return;
    syncingScroll = true;
    strip.scrollLeft = wrap.scrollLeft;
    syncingScroll = false;
  });
  strip.addEventListener('scroll', () => {
    if (syncingScroll) return;
    syncingScroll = true;
    wrap.scrollLeft = strip.scrollLeft;
    syncingScroll = false;
  });
}

/* ── Daily ──────────────────────────────────────────────────────────────── */
function renderDaily(daily, current) {
  const list = el('daily');
  if (!list) return;
  if (!daily || !daily.length) {
    list.innerHTML = '';
    el('daily-heading').textContent = 'Daily Forecast';
    el('daily-meta').textContent = 'No forecast data';
    return;
  }

  el('daily-heading').textContent = `${daily.length}-Day Forecast`;
  /* `data-today` marks the row whose date key is the location's today, not
   * index 0. Bucketing by UTC upstream can make index 0 yesterday, which shaded
   * the wrong row and read "Today" against a "Wed" label. */
  const todayKey = dateKeyInZone(new Date());
  /* The week's range is a CLAIM about the week, so it is built only from rows that
   * support a range claim. This line had no gate at all: folding in a partial
   * row's lower bound moved the headline — forcing one degenerate today changed
   * "8–27" to "8–26", a bound no printed row supports, and it re-scaled and
   * compressed every other row's bar as a side effect. 33% of samples were
   * distorted this way, and nothing on the line says so. */
  const ranged = daily.filter((d) => rangeKnown(d));
  const hasWeekRange = ranged.length > 0;
  /* Zero when there is no range to draw, so `scalePct` returns null rather than
   * dividing by a span built from placeholder numbers. */
  const weekMin = hasWeekRange ? Math.min(...ranged.map((d) => d.low)) : 0;
  const weekMax = hasWeekRange ? Math.max(...ranged.map((d) => d.high)) : 0;
  /* The week's range lives here, once. It also used to be written into a
   * visually-hidden `#daily-range-legend`, which nothing referenced — no
   * aria-describedby, no labelledby, no role="img" wrapping the bar it claimed
   * to describe (the bar is aria-hidden). A screen reader therefore heard the
   * range twice and the phrase "range bar" had no referent at all. */
  const weekRangeText = hasWeekRange
    ? ` · ${Math.round(toDisplay(weekMin))}° – ${Math.round(toDisplay(weekMax))}°`
    : '';
  el('daily-meta').textContent = `${daily.length} days${weekRangeText}`;
  el('daily-scroll').scrollLeft = 0;

  list.innerHTML = daily.map((d, i) => {
    /* ONE definition of "is this today", in one place. This comparison was
     * written out four times inside this single callback, which is the same
     * drift the file warns about elsewhere: fix one copy and the other three
     * quietly disagree. Match the location's local day, not index 0 — a
     * UTC-bucketed payload can make index 0 yesterday. */
    const isToday = String(d.date).slice(0, 10) === todayKey;
    /* `partial` marks the synthesised "rest of today" row, whose high/low are a
     * 3-hour window's lower bound rather than a real daily range. It is set by
     * `dailyRow` in the backend. Without saying so, a number that is softer than
     * it looks is presented as if it were a daily range — the same class of
     * problem as every other fabrication this round removed, except here the
     * value is real and only its precision is not. */
    /* BOTH spans must stay INSIDE `.daily-hi`. `.daily-row` is a fixed 10-track
     * grid, so any element that is a direct child of the row becomes an extra
     * grid item: putting these two after the closing `</span>` of `.daily-hi` gave
     * the marked row 12 children against 10 tracks, which pushes the last track
     * onto an implicit row and draws that row's `border-bottom` through the
     * middle of it. It only happened on the one day that carries the marker. */
    /* The CAUSE differs by day, and the old wording asserted one cause for all
     * of them. Today's row is short because the day has partly happened. A
     * FUTURE row is short because the provider's 40 slots do not tile evenly into
     * local days, so the last one is always short of a full day — measured on
     * plain OpenWeatherMap at 294 of 336 loads (88%), no tampering required.
     * Telling a reader that a day four days out has "already passed" is simply
     * false, and a false explanation is worse than none. The flag itself is
     * correct in both cases; only the reason was wrong. */
    const partialNote = d.partial
      ? '<span class="visually-hidden"> Partial range, '
        + (isToday
          ? 'from what has already passed.'
          : 'from fewer readings than a full day.')
        + '</span>'
        + '<span class="daily-partial" aria-hidden="true">partial</span>'
      : '';
    const info = conditionInfo(d.condition);
    /* Both cells are emitted unconditionally. `.daily-row` is a fixed-track
     * grid, so omitting an element lets auto-placement pull every later item one
     * column left: a 0% day crushed the range bar into the 44px pop track and
     * knocked the high/low column out of line with the rows around it. An empty
     * cell is quiet; a missing one is a layout bug. */
    /* The label prefix is emitted only alongside a value. Unconditionally it left
     * every 0% day announcing "Chance of precipitation" with nothing after it.
     * The element itself is always present so the grid cell is never missing. */
    /* `> 0` is false for null, so the synthesised rest-of-today row — which has no
     * forecast at all for its remaining hours — renders an empty cell rather
     * than an invented percentage. The element is still always emitted, which is
     * what keeps the grid's column count equal to its item count. */
    const pop = d.precipitationProbability > 0
      ? `<span class="daily-pop"><span class="visually-hidden">Chance of precipitation </span>${
        d.precipitationProbability}%</span>`
      : '<span class="daily-pop"></span>';
    const aqLabel = d.airQuality ? aqiCategoryLabel(d.airQuality.category) : '';
    const aq = `<span class="daily-aqi"${
      d.airQuality ? ` data-aqi-cat="${escHtml(d.airQuality.category)}"` : ''
    }${
      d.airQuality ? ` title="Air quality: ${escHtml(aqLabel)}"` : ''
    }>${d.airQuality ? `AQI ${d.airQuality.aqi}` : ''}</span>`;

    /* No bar unless this row states a range.
     *
     * `scalePct` was independent of `rangeKnown`, so all three of these drew
     * something for a row whose cells both say "—":
     *   - `Math.max(…, 2)` guaranteed a visible 1.67px sliver, which reads as a very
     *     narrow measured range rather than an unknown one;
     *   - when the degenerate value was the week's extreme, `scalePct` clamped to
     *     100 and the bar was emitted at `left:100%`, painting OUTSIDE its own
     *     track into the 12px column gap — confirmed in a 3x pixel capture;
     *   - the hard-coded `left:40%;width:20%` fallback was the worst of the three,
     *     implying a fifth of the week's range for a row that states none.
     *
     * `scalePct` is monotonic in `value`, so `high > low` guarantees `p2 > p1` and
     * the `Math.min`/`Math.abs`/width-floor are unnecessary once the row is gated.
     */
    const p1 = rangeKnown(d) ? scalePct(d.low, weekMin, weekMax) : null;
    const p2 = rangeKnown(d) ? scalePct(d.high, weekMin, weekMax) : null;
    const barRange = p1 !== null && p2 !== null && p2 > p1
      ? `<div class="daily-bar-range" style="left:${p1.toFixed(2)}%;width:${(p2 - p1).toFixed(2)}%"></div>`
      : '';
    // Match the location's today, not index 0: a UTC-bucketed payload can make
    // index 0 yesterday, which put the "now" tick on the wrong row.
    const nowPct = isToday
      ? scalePct(current.temperature, weekMin, weekMax)
      : null;
    const nowTick = nowPct === null
      ? ''
      : `<div class="daily-bar-now" style="left:${nowPct.toFixed(2)}%"></div>`;

    return `
      <li class="daily-row" role="listitem" data-today="${isToday}"${
        isToday ? ' aria-current="date"' : ''}>
        <span class="daily-day">${escHtml(dayName(d.date))}</span>
        <span class="daily-icon" aria-hidden="true"><i data-lucide="${info.icon}"></i></span>
        <span class="daily-moon" aria-hidden="true">${phaseGlyph(d.moonPhase)}</span>
        <span class="daily-desc">${escHtml(conditionText(d))}</span>
        ${aq}
        <span class="daily-sun">${
          /* The prefixes are emitted only alongside a value, like the PoP cell
           * and the hourly slots. Unconditionally they announced a label naming
           * a number that does not exist: "Sunrise ↑— sunset ↓—" reads as two
           * labelled dashes with the arrow, which is decoration, inside the
           * spoken run. With both absent the cell renders EMPTY, not a dash: no
           * label, no invented glyph, which is what `.daily-pop` and `.daily-aqi`
           * already do. An earlier version of this sentence promised "a bare dash
           * per pair", and the code did not do that. */
          d.sunrise ? `<span class="visually-hidden">Sunrise </span>↑${escHtml(formatClock(d.sunrise))}` : ''
        }${d.sunrise || d.sunset ? ' ' : ''}${
          d.sunset ? `<span class="visually-hidden">sunset </span>↓${escHtml(formatClock(d.sunset))}` : ''
        }</span>
        ${pop}
        <div class="daily-bar-wrap" aria-hidden="true">
          <div class="daily-bar">${barRange}${nowTick}</div>
        </div>
        <span class="daily-lo"><span class="visually-hidden">Low </span>${rangeKnown(d) ? `${Math.round(toDisplay(d.low))}°` : '—'}</span>
        <span class="daily-hi"><span class="visually-hidden">high </span>${rangeKnown(d) ? `${Math.round(toDisplay(d.high))}°` : '—'}${partialNote}</span>
      </li>`;
  }).join('');
  refreshIcons();
}

/* ── Current Weather Details ─────────────────────────────────────────────── */
function detailCell(label, valueHtml, opts) {
  const options = opts || {};
  const icon = options.icon ? `<i data-lucide="${options.icon}"></i>` : '';
  const uvAttr = options.uv ? ` data-uv="${escHtml(options.uv)}"` : '';
  const note = options.note ? `<span class="detail-note">${escHtml(options.note)}</span>` : '';
  return `
    <div class="detail-cell"${uvAttr}>
      <dt class="detail-label"><span class="detail-head">${icon}${escHtml(label)}</span></dt>
      <dd class="detail-value">${valueHtml}${note}</dd>
    </div>`;
}

function renderDetails(current, astronomy) {
  const grid = el('details');
  if (!grid) return;
  /* Hide the whole section rather than emptying it. An empty `<dl>` still left
   * a 2px-tall bordered box under a heading on the error path — air quality and
   * astronomy already hide themselves, so this matches them. */
  if (!current) {
    grid.innerHTML = '';
    el('section-details').classList.add('hidden');
    return;
  }
  el('section-details').classList.remove('hidden');

  const vis = visibilityUnit(current.visibility);
  const uv = uvKey(current.uvIndex);

  const cells = [
    detailCell('Feels like', `${toDisplay(current.feelsLike)}${unitLabel()}`),
    /* `== null`, not a truthiness test. `dewPoint` was 0 for "not reported" and
     * the old `current.dewPoint ? …` check would also have hidden a genuine dew
     * point of exactly 0 °C. It is nullable now. */
    detailCell('Dew point', current.dewPoint == null ? '—' : `${toDisplay(current.dewPoint)}${unitLabel()}`),
    detailCell('Humidity', `${current.humidity}<span class="unit">%</span>`),

    /* Both wind fields are nullable: OWM omits the whole `wind` block in calm
     * conditions. `windDir(0)` renders "N" — so `?? 0` reported calm or variable
     * wind as due north — and `Math.round(null)` is 0, so `?? 0` on the speed
     * reported a dead calm from no measurement at all. The arrow is `aria-hidden`
     * decoration, so with no direction there is nothing to point and nothing to
     * say. `== null`, not truthiness: a genuine 0 km/h and a genuine 0° are both
     * real readings and both still render. */
    detailCell('Wind',
      current.windSpeed == null
        ? '<span class="wind-dir-unknown">not reported</span>'
        : current.windDirection == null
          ? `${Math.round(current.windSpeed)}<span class="unit">km/h</span> <span class="wind-dir-unknown">direction not reported</span>`
          : `<span class="wind-arrow" style="transform:rotate(${current.windDirection}deg)" aria-hidden="true">`
            + `<i data-lucide="arrow-up"></i></span>${Math.round(current.windSpeed)}`
            + `<span class="unit">km/h</span> ${escHtml(windDir(current.windDirection))}`,
      { icon: 'wind' }),

    /* Both of these are null when the provider did not report them, which the
     * free OpenWeatherMap tier never does. They used to render as "0 km/h" and
     * "0 Low" — a fabricated measurement, and in UV's case one wearing a green
     * "no action needed" verdict. An em dash is the honest rendering. */
    detailCell('Wind gust', current.windGust == null
      ? '—'
      : `${Math.round(current.windGust)}<span class="unit">km/h</span>`),
    /* `pressure` and `cloudCoverage` were `?? 0` and `?? 0` in the mapper, so an
     * absent reading rendered "0 hPa" and "0 %" — cloudless sky and vacuum,
     * presented as measurements. `Number.isInteger(null)` is false and
     * `null.toFixed` throws, so both needed the guard, not just a format change.
     * `== null` rather than truthiness, so a real 0 hPa or 0 % still renders. */
    detailCell('Pressure',
      current.pressure == null
        ? '—'
        : `${Number.isInteger(current.pressure) ? current.pressure : current.pressure.toFixed(1)}`
          + `<span class="unit">hPa</span>`),

    detailCell('Visibility', `${escHtml(vis.value)}<span class="unit">${escHtml(vis.unit)}</span>`),
    detailCell('Cloud cover', current.cloudCoverage == null
      ? '—'
      : `${current.cloudCoverage}<span class="unit">%</span>`),
    detailCell('UV index',
      current.uvIndex == null
        ? '—'
        : `${current.uvIndex}<span class="detail-note">${escHtml(uvWord(current.uvIndex))}</span>`,
      // No `uv` attribute when unknown, so the cell is not tinted at all.
      { uv }),

    detailCell('Observed', escHtml(formatStamp(current.observedAt))),
    detailCell('Sunrise', astronomy && astronomy.sunrise ? escHtml(formatTime(astronomy.sunrise)) : '—'),
    detailCell('Sunset', astronomy && astronomy.sunset ? escHtml(formatTime(astronomy.sunset)) : '—'),

    detailCell('Moonrise', astronomy && astronomy.moonrise ? escHtml(formatTime(astronomy.moonrise)) : '—'),
    detailCell('Moon phase', astronomy
      ? `<span class="moon-glyph" aria-hidden="true">${phaseGlyph(astronomy.moonPhase)}</span>`
        + escHtml(moonPhaseName(astronomy.moonPhase))
      : '—'),
    detailCell('Daylight', astronomy && astronomy.sunrise && astronomy.sunset
      ? escHtml(formatDuration(astronomy.sunrise, astronomy.sunset))
      : '—', { note: 'derived' }),
  ];

  grid.innerHTML = cells.join('');
  refreshIcons();
}

/* ── Air Quality ────────────────────────────────────────────────────────── */
const AQI_COMPONENTS = [
  { key: 'pm25',            name: 'PM2.5', unit: 'µg/m³' },
  { key: 'pm10',            name: 'PM10',  unit: 'µg/m³' },
  { key: 'ozone',           name: 'O₃',    unit: 'µg/m³' },
  { key: 'carbonMonoxide',  name: 'CO',    unit: 'mg/m³' },
  { key: 'nitrogenDioxide', name: 'NO₂',   unit: 'µg/m³' },
  { key: 'sulfurDioxide',   name: 'SO₂',   unit: 'µg/m³' },
];

function renderAirQuality(aq) {
  const value = el('aqi-value');
  const category = el('aqi-category');
  const advice = el('aqi-advice');
  const meta = el('aqi-meta');
  const list = el('aqi-components');
  const bar = el('aqi-scale-bar');
  if (!value || !list) return;

  // With no data at all, the head and the scale would read as "0 / unknown".
  [el('air-quality-head'), el('aqi-scale'), el('aqi-scale-labels')].forEach((node) => {
    if (node) node.classList.toggle('hidden', !aq);
  });
  el('section-air-quality').classList.toggle('hidden', !aq);
  updatePairVisibility();

  if (!aq) {
    value.textContent = '—';
    category.textContent = '—';
    value.className = 'aqi-value num';
    category.className = 'aqi-category';
    advice.textContent = 'No air quality data';
    if (meta) meta.dataset.empty = 'true';
    list.innerHTML = '';
    return;
  }
  if (meta) delete meta.dataset.empty;

  // Pass the category through unchanged: aqiColorClass() owns the unknown-value
  // decision. Coercing to 'good' here hid the very defect that map exists to
  // surface — an unrecognised band rendered as clean air instead of warning.
  const cat = aq.category;
  const colorClass = aqiColorClass(cat);

  value.textContent = String(aq.aqi);
  value.className = `aqi-value num ${colorClass}`;
  category.textContent = aqiCategoryLabel(cat);
  category.className = `aqi-category ${colorClass}`;
  advice.textContent = aq.recommendation;

  if (bar) {
    const active = aqiCategoryIndex(cat);
    bar.querySelectorAll('.aqi-seg').forEach((seg, i) => {
      seg.dataset.active = String(i === active);
    });
    bar.setAttribute('aria-label',
      `Air quality ${aq.aqi}, ${aqiCategoryLabel(cat)}. Scale: `
      + AQI_CATEGORIES.map(aqiCategoryLabel).join(', ') + '.');
  }
  list.innerHTML = AQI_COMPONENTS.map((c) => {
    const raw = aq[c.key];
    const empty = raw === null || raw === undefined;
    return `
      <li class="aqi-comp" role="listitem">
        <span class="aqi-comp-name">${escHtml(c.name)}</span>
        <span class="aqi-comp-value${empty ? ' is-empty' : ''}">`
        + (empty ? '—' : `${raw} <span class="unit">${escHtml(c.unit)}</span>`)
        + `</span>
      </li>`;
  }).join('');
}

/* ── Astronomy ──────────────────────────────────────────────────────────── */
/** The pair wrapper only earns its place on the page when at least one half has data. */
function updatePairVisibility() {
  const pair = el('section-pair');
  if (!pair) return;
  const noAir = el('section-air-quality').classList.contains('hidden');
  const noAstro = el('section-astronomy').classList.contains('hidden');
  pair.classList.toggle('hidden', noAir && noAstro);
  /* When only one half has data the survivor kept its 1fr of a 2-track grid, so
   * it rendered as a half-width panel with a hole beside it. `:has(> :only-child)`
   * cannot express this — a `display:none` sibling is still a child, so the
   * visible section is never `:only-child`. An explicit class is the reliable
   * signal, and it is the one that survives grid auto-placement. */
  pair.classList.toggle('is-single', noAir !== noAstro);
}

function astroCell(label, valueHtml, empty, title) {
  return `
    <div class="astro-cell">
      <dt class="astro-label">${escHtml(label)}</dt>
      <dd class="astro-val${empty ? ' is-empty' : ''}"${title ? ` title="${escHtml(title)}"` : ''}>${valueHtml}</dd>
    </div>`;
}

function renderAstronomy(ast) {
  const grid = el('astronomy');
  const light = el('astro-light');
  const arc = el('astro-arc');
  const subrule = el('astro-subrule');
  const progress = el('astro-daylight-progress');
  if (!grid || !light || !arc) return;

  if (!ast) {
    grid.innerHTML = '';
    light.innerHTML = '';
    arc.hidden = true;
    el('astro-arc-legend').hidden = true;
    subrule.hidden = true;
    progress.textContent = '';
    el('section-astronomy').classList.add('hidden');
    updatePairVisibility();
    return;
  }
  arc.hidden = false;
  el('astro-arc-legend').hidden = false;
  subrule.hidden = false;
  el('section-astronomy').classList.remove('hidden');
  /* `loadWeather` runs air quality before astronomy, so on the success path
   * `is-single` is computed from a STALE reading of this section. Not reachable
   * today — `astronomy` is non-nullable in `WeatherBundleSchema` and both
   * providers always build it — but the correctness of the pair's width rests on
   * a contract invariant rather than on this function, so close it here too. */
  updatePairVisibility();

  const now = new Date();
  /* Polar day and polar night have no sunrise or sunset, so there is no arc to
   * draw and no fraction of a day to have elapsed. Substituting solar noon made
   * `set - rise` exactly 0, which rendered "0% of daylight elapsed" and drew a
   * sun sitting on the horizon on a night with no sun. Say which state it is
   * instead — the reader is the only one who can tell, and both are real. */
  const hasSun = Boolean(ast.sunrise && ast.sunset);
  const rise = hasSun ? new Date(ast.sunrise) : null;
  const set = hasSun ? new Date(ast.sunset) : null;
  const totalMs = hasSun ? set - rise : 0;
  const elapsed = hasSun ? Math.max(0, Math.min(now - rise, totalMs)) : 0;
  const frac = totalMs > 0 ? elapsed / totalMs : 0;
  /* Which polar state it is, from the backend's own `sunTimes` result rather
   * than re-deriving an altitude here: this renderer has no lat/lon, and the
   * solar calculation already distinguishes `polarDay` from `polarNight`. */
  const polarNight = !hasSun && !ast.polarDay;

  // Arc from (30,70) to (150,70) — a semicircle of radius 60 about (90,70).
  const cx = 90, cy = 70, r = 60;
  const angle = Math.PI - frac * Math.PI;
  const dotX = cx + r * Math.cos(angle);
  const dotY = cy - r * Math.sin(angle);

  arc.innerHTML = `
    <svg viewBox="0 0 180 80" width="180" height="80" focusable="false">
      <line class="sun-horizon" x1="18" y1="70" x2="162" y2="70" />
      <path class="sun-arc-track" d="M 30 70 A 60 60 0 0 1 150 70" />
      <path class="sun-arc-progress" d="M 30 70 A 60 60 0 0 1 ${dotX.toFixed(1)} ${dotY.toFixed(1)}" />
      <circle class="sun-dot" cx="${dotX.toFixed(1)}" cy="${dotY.toFixed(1)}" r="5" />
    </svg>`;

  /* Feed the CSS the real arc length so the draw-on animation is exact.
   *
   * The path is an elliptical arc, so the chord length is NOT the path length:
   * for a semicircle of radius 60 the chord is 120 and the arc is πr ≈ 188.5.
   * Getting this wrong means the stroke overshoots or stops short, so the
   * measurement is taken from the DOM when the browser can report it, and the
   * 188.5 fallback below is the exact analytic value for a half-circle.
   *
   * `getTotalLength` needs a rendered layout, which is why it is wrapped in a
   * try and degrades silently — an arc that animates approximately is strictly
   * better than one that does not animate at all. The property is set on the
   * container, and custom properties inherit, so the `<path>` picks it up. */
  const arcPath = arc.querySelector('.sun-arc-progress');
  if (arcPath && typeof arcPath.getTotalLength === 'function') {
    try {
      const len = arcPath.getTotalLength();
      if (len > 0) arc.style.setProperty('--arc-len', len.toFixed(1));
    } catch (e) { /* no layout yet; the analytic fallback stands */ }
  }
  progress.textContent = hasSun
    ? `${Math.round(frac * 100)}% of daylight elapsed`
    : (polarNight ? 'Polar night — the sun does not rise' : 'Polar day — the sun does not set');

  /* The contract carries the real illuminated fraction, 0 to 1. `== null` rather
   * than a truthiness test: 0 is a real value here — a new moon IS fully dark,
   * and `0 || null` would render it as unknown. */
  const illum = ast.moonIllumination == null ? null : Math.round(ast.moonIllumination * 100);
  grid.innerHTML = [
    astroCell('Sunrise', ast.sunrise ? escHtml(formatTime(ast.sunrise)) : '—', !ast.sunrise),
    astroCell('Sunset', ast.sunset ? escHtml(formatTime(ast.sunset)) : '—', !ast.sunset),
    astroCell('Daylight', hasSun
      ? `${escHtml(formatDuration(ast.sunrise, ast.sunset))}<span class="unit">derived</span>`
      : '—', !hasSun),
    astroCell('Moonrise', ast.moonrise ? escHtml(formatTime(ast.moonrise)) : '—', !ast.moonrise),
    astroCell('Moonset', ast.moonset ? escHtml(formatTime(ast.moonset)) : '—', !ast.moonset),
    astroCell('Moon phase',
      `<span class="moon-glyph" aria-hidden="true">${phaseGlyph(ast.moonPhase)}</span>`
      + escHtml(moonPhaseName(ast.moonPhase))),
    astroCell('Moon illumination',
      illum === null ? '—' : `${illum}%<span class="unit">derived</span>`, illum === null),
  ].join('');

  /* The contract types the four light windows as a single datetime, and the
   * API sends the instant the window opens. There is no end time to render, so
   * show the start and say so rather than inventing a closing time. */
  const windows = [
    ['Golden hour (am)', ast.goldenHourMorning],
    ['Golden hour (pm)', ast.goldenHourEvening],
    ['Blue hour (am)', ast.blueHourMorning],
    ['Blue hour (pm)', ast.blueHourEvening],
  ];
  light.innerHTML = windows.map(([label, value]) => astroCell(
    label,
    value ? `${escHtml(formatTime(value))}<span class="unit">from</span>` : '—',
    !value,
    value ? 'Start of the light window' : null
  )).join('');
}

/* ══════════════════════════════════════════════════════════════════════════
   MAP
   ══════════════════════════════════════════════════════════════════════════ */
let leafletMap = null;
let leafletTileLayer = null;
let baseTileLayer = null;

function currentMapLayer() {
  return state.mapLayers.find((l) => l.id === state.activeLayerId) || state.mapLayers[0] || null;
}

function layerRefreshLabel(layer) {
  if (!layer || !layer.refreshSeconds) return '';
  const mins = layer.refreshSeconds / 60;
  const text = mins >= 1 ? `${Math.round(mins)} min` : `${layer.refreshSeconds} sec`;
  return `updates every ${text}`;
}

function renderMapCaption(layer) {
  const caption = el('map-caption');
  if (!caption) return;
  const name = layer ? layer.name : 'Map';
  const interval = layer && layer.refreshSeconds
    ? `${layerRefreshLabel(layer).replace('updates every ', '')} animation`
    : 'tiles';
  /* Attribution must describe the basemap that is actually on screen, which is
   * not the same tile source in both themes. */
  caption.innerHTML = `${escHtml(name)} tiles · ${escHtml(interval)} · `
    + `${baseTileConfig().attribution} · ${OWM_ATTRIBUTION}`;
}

/**
 * Swap the basemap when the theme changes.
 *
 * The dark raster is a real dark tile source rather than a CSS filter on the
 * tile pane, which the spec forbids because it desaturates the radar product —
 * the one layer that carries a colour legend.
 */
function applyBaseTileLayer() {
  if (!leafletMap) return;
  const config = baseTileConfig();
  if (baseTileLayer) {
    if (baseTileLayer._nimbusUrl === config.url) return;
    leafletMap.removeLayer(baseTileLayer);
  }
  /* No tile key here: neither basemap is an OpenWeatherMap product. */
  baseTileLayer = L.tileLayer(config.url, {
    attribution: config.attribution,
    maxZoom: 18,
  }).addTo(leafletMap);
  baseTileLayer._nimbusUrl = config.url;
  baseTileLayer.bringToBack();
}

function applyMapLayer() {
  if (!leafletMap) return;
  const layer = currentMapLayer();
  if (leafletTileLayer) { leafletMap.removeLayer(leafletTileLayer); leafletTileLayer = null; }
  if (!layer) return;

  const layerOpacity = typeof layer.opacity === 'number' ? layer.opacity : 0.7;
  /* The slider is the reader's setting, so it is seeded from the layer exactly
   * once. applyMapLayer also runs on every 10-minute auto-refresh, and seeding
   * unconditionally silently undid a drag the reader had just made. */
  if (!state.opacitySeeded) {
    state.opacitySeeded = true;
    state.mapOpacity = layerOpacity;
    const seed = el('map-opacity');
    if (seed) seed.value = String(Math.round(layerOpacity * 100));
  }
  const opacity = typeof state.mapOpacity === 'number' ? state.mapOpacity : layerOpacity;

  leafletTileLayer = L.tileLayer(tileUrlWithKey(layer.tileUrlTemplate), {
    opacity,
    maxZoom: 18,
    attribution: OWM_ATTRIBUTION,
  }).addTo(leafletMap);

  el('map-layer-refresh').textContent = `${layer.name} · ${layerRefreshLabel(layer)}`;
  renderMapCaption(layer);
  refreshIcons();
}

/**
 * The backend signs each tile template itself (see `withTileKey` in
 * provider.ts), so the template arrives ready to use and this is a pass-through.
 *
 * A `{appid}` placeholder is rejected rather than filled. There is no credential
 * here to fill it with, and substituting an empty string would produce
 * `?appid=` and a 401 for every tile — the exact failure the committed key used
 * to cause silently. Failing loudly in development is better than an empty map.
 */
function tileUrlWithKey(template) {
  if (!template) return '';
  if (template.includes('{appid}')) {
    console.warn('Nimbus: tile template uses an {appid} placeholder, but the '
      + 'credential is server-side only. The backend must append it (withTileKey).');
  }
  return template;
}

function renderMapLayerButtons() {
  const sw = el('map-layer-switch');
  if (!sw) return;
  sw.querySelectorAll('.map-layer-btn').forEach((b) => b.remove());
  const anchor = sw.querySelector('.map-switch-rule');
  state.mapLayers.forEach((layer) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'map-layer-btn';
    btn.dataset.layerId = layer.id;
    btn.setAttribute('aria-pressed', String(layer.id === state.activeLayerId));
    btn.textContent = layer.name || MAP_LAYER_FALLBACK_NAME[layer.id] || layer.id;
    btn.addEventListener('click', () => {
      state.activeLayerId = layer.id;
      sw.querySelectorAll('.map-layer-btn').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.layerId === state.activeLayerId));
      });
      applyMapLayer();
    });
    if (anchor) anchor.before(btn); else sw.appendChild(btn);
  });
  syncSwitcherOverflow();
}

/* Show the scroll affordance only when the switcher actually overflows.
 *
 * The fade was applied unconditionally, so at every viewport wide enough to show
 * all seven layers — which is >=900px, where the band is full-bleed and the
 * reserved strip is ~885px against a ~607px natural width — there was nothing
 * to scroll and the mask still dissolved the right edge of `#map-opacity`, the
 * container's border, its radius and its shadow. Measuring beats a hard-coded
 * breakpoint, which would be a font-metric-derived number that drifts if a layer
 * is renamed or Inter fails to load. */
function syncSwitcherOverflow() {
  const sw = el('map-layer-switch');
  if (sw) sw.classList.toggle('is-scrollable', sw.scrollWidth > sw.clientWidth + 1);
}

function initMap(lat, lon, layers) {
  const mapEl = el('weather-map');
  const stage = el('map-stage');
  if (!mapEl) return;
  if (typeof L === 'undefined') {
    /* leaflet.js is a third-party `defer` script, so it can lose the race with
     * this one. initMap() runs on every bundle load, so retry a few times
     * before declaring the map unavailable for good. */
    state.mapInitAttempts += 1;
    if (state.mapInitAttempts < MAP_INIT_ATTEMPTS) return;
    if (stage) stage.hidden = true;
    el('map-layer-refresh').textContent = 'Map unavailable — Leaflet did not load';
    el('map-caption').textContent = 'Map requires the Leaflet library, which could not be loaded.';
    return;
  }
  state.mapInitAttempts = 0;
  if (!layers || !layers.length) {
    if (stage) stage.hidden = true;
    el('map-layer-refresh').textContent = 'No map layers returned';
    return;
  }

  /* Un-hide on every success. Both failure paths above set `stage.hidden`, and
   * nothing else cleared it, so one transient Leaflet failure left the map
   * invisible for the rest of the session even after a later successful load. */
  if (stage) stage.hidden = false;

  state.mapLayers = layers;
  const unknown = layers.filter((l) => !MAP_LAYER_IDS.includes(l.id));
  if (unknown.length) {
    console.warn('Nimbus: map layer id(s) outside MapLayerSchema.id:',
      unknown.map((l) => l.id).join(', '));
  }
  if (!layers.some((l) => l.id === state.activeLayerId)) {
    state.activeLayerId = layers[0].id;
  }

  if (!leafletMap) {
    /* The default zoom control sits top-left, exactly where #map-layer-switch is
     * pinned. `.leaflet-top` is z-index 1000 and the switcher 500, and
     * `.leaflet-control` sets `pointer-events: auto`, so the zoom bar covered
     * the left third of the first (default-active) layer button at every width
     * >= 640px — the button was unclickable. Top-right is free: the attribution
     * strip is bottom-right and #map-recentre is bottom-centre-right. */
    leafletMap = L.map('weather-map', { zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'topright' }).addTo(leafletMap);
    applyBaseTileLayer();

    const slider = el('map-opacity');
    if (slider) {
      slider.addEventListener('input', () => {
        const value = Number(slider.value) / 100;
        state.mapOpacity = value;
        if (leafletTileLayer) leafletTileLayer.setOpacity(value);
      });
    }

    const recentre = el('map-recentre');
    if (recentre) {
      recentre.addEventListener('click', () => {
        if (leafletMap && state.currentLat !== null) {
          leafletMap.setView([state.currentLat, state.currentLon], 7);
        }
      });
    }

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => { if (leafletMap) leafletMap.invalidateSize(); }).observe(mapEl);
      /* The switcher's overflow state is a function of its WIDTH, so it has to
       * be re-measured when the width changes — not only when the layers are
       * rebuilt on a bundle load. Without this, a reader who loaded at 1280px
       * (all seven layers fit, so no mask) and then narrowed the window to
       * tablet got no scroll cue at all, and the reverse left a fade over
       * content that fits. `overflow-x: auto` is unconditional, so this is only
       * ever the affordance, never the scrollability itself. */
      const sw = el('map-layer-switch');
      if (sw) new ResizeObserver(() => syncSwitcherOverflow()).observe(sw);
    } else {
      window.addEventListener('resize', () => {
        if (leafletMap) leafletMap.invalidateSize();
        syncSwitcherOverflow();
      });
    }
  }

  leafletMap.setView([lat, lon], 7);
  renderMapLayerButtons();
  applyMapLayer();

  // The map is no longer behind a tab, so it initialises on first paint.
  requestAnimationFrame(() => { if (leafletMap) leafletMap.invalidateSize(); });
}

/* ══════════════════════════════════════════════════════════════════════════
   MOBILE JUMP BAR
   ══════════════════════════════════════════════════════════════════════════ */
function initJumpBar() {
  const links = Array.from(document.querySelectorAll('#jump-bar .jump-link'));
  if (!links.length || typeof IntersectionObserver === 'undefined') return;

  const visible = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) visible.add(entry.target.id);
      else visible.delete(entry.target.id);
    });
    if (!visible.size) return;
    // Whichever visible section sits closest to the top of the viewport wins.
    let bestId = null;
    let bestTop = Infinity;
    links.forEach((link) => {
      const id = link.dataset.target;
      if (!visible.has(id)) return;
      const rect = document.getElementById(id).getBoundingClientRect();
      if (rect.top < bestTop) { bestTop = rect.top; bestId = id; }
    });
    if (!bestId) return;
    links.forEach((link) => {
      if (link.dataset.target === bestId) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-104px 0px -55% 0px', threshold: 0 });

  links.forEach((link) => {
    const target = document.getElementById(link.dataset.target);
    if (target) observer.observe(target);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN LOAD
   ══════════════════════════════════════════════════════════════════════════ */
function showForecast() {
  el('empty-state').classList.add('hidden');
  el('forecast').classList.remove('hidden');
}

function showLoading() {
  el('section-current').classList.add('is-loading');
  el('current-temp-wrap').classList.add('is-loading');
}

function clearRefreshTimer() {
  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = null;
  }
}

async function loadWeather(lat, lon, name, activeChip, silent) {
  // A newer request always supersedes an in-flight one; only the newest
  // response is allowed to render, and only it schedules a refresh.
  const seq = ++state.loadingSeq;
  state.loading = true;

  /* Clear the pending refresh BEFORE awaiting anything.
   *
   * This used to happen after the fetch resolved, which left the previous
   * city's 10-minute timer live for the whole duration of this request. When it
   * fired mid-flight it called loadWeather for the old coordinates, bumped
   * loadingSeq, and made the user's newer response stale — so a reader who
   * asked for Sydney could end up looking at Tirana with no obvious cause. */
  clearRefreshTimer();

  state.currentLat  = lat;
  state.currentLon  = lon;
  state.currentName = name;

  document.querySelectorAll('.loc-chip').forEach((c) => c.classList.remove('active'));
  if (activeChip) activeChip.classList.add('active');

  showForecast();
  showLoading();
  updateTitle(null, null, name);

  /* Whether this attempt ended in a failure. Decides whether the background
   * refresh re-arms: a failed poll must not keep retrying a service already known
   * to be down, or the page re-renders once a minute for the whole outage. */
  let loadFailed = false;

  try {
    const resp = await fetchJSON(`/weather/bundle?lat=${lat}&lon=${lon}`);
    if (seq !== state.loadingSeq) return;
    const data = resp.data;

    /* Validate before ANY use.
     *
     * The guards on the announcement below never got a chance to run: a null
     * `data` threw at `data.location` further down, fell into the catch, and
     * `renderCurrentError(err.message)` -> `showToast` -> `announce` put the
     * verbatim "Cannot read properties of null (reading 'location')" into the
     * live region and painted it on screen. Rejecting the shape here means the
     * catch only ever sees an error we chose, and the message is ours too. */
    if (!data || !data.location || !data.current) {
      throw new Error('The forecast service returned an incomplete response.');
    }

    state.lastBundle = data;

    /* Set before any renderer runs: every formatter below reads this, so the
     * whole page renders in the location's zone even when the reader is not. */
    state.currentTimezone = activeTimeZone(data.location && data.location.timezone);

    /* Each renderer gets its own boundary.
     *
     * These all sit inside the request's try block, so a single malformed field
     * — `d.condition.replace` on an absent condition, `pressure.toFixed(1)` on a
     * missing number — used to route into the shared catch and blank the whole
     * page as "Forecast unavailable", even though the response was fine. That is
     * the same failure the map was just rescued from. One bad section now
     * degrades one section; only the fetch itself can fail the load. */
    const section = (name, fn) => {
      try {
        fn();
      } catch (err) {
        console.warn(`Nimbus: ${name} section failed to render; the rest of the page is unaffected.`, err);
      }
    };

    section('source', () => renderSource(data));
    section('alerts', () => renderAlerts(data.alerts));
    section('insights', () => renderInsights(data.insights));
    section('current', () => renderCurrent(data.current, todayPoint(data), data.location, data.generatedAt));
    section('hourly', () => renderHourly(data.hourly));
    section('daily', () => renderDaily(data.daily, data.current));
    section('details', () => renderDetails(data.current, data.astronomy));
    section('air quality', () => renderAirQuality(data.airQuality));
    section('astronomy', () => renderAstronomy(data.astronomy));
    section('map', () => initMap(lat, lon, data.mapLayers));

    /* The alert count is folded into this single announcement.
     *
     * It used to be written by renderAlerts and then immediately overwritten by
     * this line — both `announce()` calls land in the same animation frame, so
     * the second won, and a screen-reader user heard only "Forecast loaded".
     * `#alerts` cannot reliably announce its own first population, so this is
     * the one path that does reach one.
     *
     * Guarded, because it sits outside the per-section boundaries: a payload
     * with a null `current` or `location` would otherwise announce a raw
     * TypeError to the live region, which is worse than saying nothing. */
    const alertCount = (data.alerts || []).length;
    const place = (data.location && data.location.name) || 'this location';
    const observed = data.current && data.current.observedAt;

    /* Silent on the auto-refresh path, and never silent when the alert count has
     * CHANGED.
     *
     * A refresh does not move the page under the reader, so announcing it every
     * 10 minutes was pure noise. But suppressing the whole announcement would
     * also swallow an alert that appeared since the last cycle, which is the one
     * thing worth interrupting for.
     *
     * "Changed", not "greater than zero". `alertCount > 0` re-announced a
     * PERSISTENT advisory on every single background poll — measured at ten
     * identical announcements across six polls, ten minutes apart, for a reader
     * who had done nothing. That is the exact recurring interruption removing
     * `aria-live` from `#alerts` was meant to end, reintroduced one level up.
     * The first cycle always announces, so a count that has never been
     * announced is treated as a change. */

    /* Provenance is announced the way the count is: a refresh that stays live says
     * nothing, and a payload that has become SAMPLE data speaks up even mid-poll.
     * The masthead badge is the disclosure for a reader who looks at it; this is
     * the disclosure for one who does not, and R2 measured that the badge is
     * `display:none` below 380px. Hiding it removes the node from the accessibility
     * tree rather than leaving a stale one, so nothing is MISREAD -- but the footer
     * then carries the disclosure, and neither of those is a screen reader
     * ANNOUNCING the switch. Silence is not disclosure.
     *
     * Wording avoids a dash: this string is spoken, and a pause character is read
     * inconsistently across readers.
     *
     * `data.source` absent is treated as live, matching `renderSource`, which hides
     * the badge outright for a falsy source. The two must agree or the announcement
     * would contradict the label. */
    const source = data.source;
    const isSample = !!source && source !== 'openweathermap';
    const wasSample = state.announcedSource !== null && state.announcedSource !== 'openweathermap';
    const sourceChanged = isSample !== wasSample;
    state.announcedSource = source || null;

    const announcedBefore = state.announcedAlertCount;
    const countChanged = alertCount !== announcedBefore;
    state.announcedAlertCount = alertCount;
    if (!silent || countChanged || sourceChanged) {
      announce([
        silent ? `Forecast updated for ${place}.` : `Forecast loaded for ${place}.`,
        observed ? `Observed ${formatTime(observed)}.` : '',
        isSample ? 'Live provider unavailable, showing sample data.' : '',
        alertCount ? `${alertCount} active weather alert${alertCount === 1 ? '' : 's'}.` : ''
      ].filter(Boolean).join(' '));
    }
  } catch (err) {
    if (seq !== state.loadingSeq) return;
    loadFailed = true;
    /* Do not leave the failed location's zone on the module for a re-render —
     * but ONLY when the page is actually being torn down.
     *
     * `renderCurrentError(message, silent)` preserves the whole forecast when the
     * failure was a background poll and a bundle exists, and returns early. This
     * reset used to run first and unconditionally, so the preserved page was left
     * with no zone: the hero reads the zone from the BUNDLE and looked fine, but
     * the hourly strip, the daily sunrise/sunset column, the "Today" highlight
     * and the details Observed/Sunrise/Sunset cells all fall back to
     * `state.currentTimezone` — so the next unit toggle silently re-rendered them
     * in the READER's zone while the hero above still said "Local time 08:17
     * (Pacific/Kiritimati)". The page contradicted itself by nine hours.
     *
     * Nothing recovers it: a failed poll does not re-arm the timer, so the stale
     * state persists for hours. Same shape as every other bug this round — a
     * cleanup step adjacent to an early return, not gated on the return. */
    if (!(silent && state.lastBundle)) state.currentTimezone = null;
    /* `renderCurrentError` sanitises the message, so a TypeError raised anywhere
     * in the render path cannot reach the DOM or the live region verbatim. The
     * `silent` flag matters here as much as on the success path: without it a
     * failed BACKGROUND poll re-ran the whole destructive error treatment —
     * blanking eight sections and re-announcing — every ten minutes, forever. */
    renderCurrentError(err && err.message, silent);
  } finally {
    if (seq === state.loadingSeq) state.loading = false;
  }

  // Superseded mid-flight: the newer request owns the timer.
  if (seq !== state.loadingSeq) return;

  // Exactly one timer, always: the previous one is cleared first.
  clearRefreshTimer();

  /* `silent` on the timer path. #live-status is role=status, and announce()
   * clears then re-sets the text, so the mutation fires even when the string is
   * identical: a reader who left the tab open was interrupted with an
   * unsolicited "Forecast loaded for X" every 10 minutes, forever. That is the
   * same unskippable recurring interruption that removing aria-live from #alerts
   * was meant to end. A manual load (city, chip, search, retry, geolocation)
   * still announces.
   *
   * A FAILED background poll does not re-arm at all. Re-arming kept the loop
   * alive against a service that was already known to be down, so the page
   * re-rendered (and re-noted) once a minute for as long as the outage lasted.
   * The next attempt is the reader's own: a city change, Retry, or a reload all
   * call `loadWeather` again and re-arm on success. */
  if (loadFailed) {
    state.refreshFailed = true;
    el('auto-refresh-label').textContent = 'Auto-refresh paused — service unreachable';
    return;
  }
  state.refreshFailed = false;
  el('auto-refresh-label').textContent = `Refreshes every ${Math.round(REFRESH_MS / 60000)} min`;
  state.refreshTimer = setTimeout(() => loadWeather(lat, lon, name, activeChip, true), REFRESH_MS);
}

/** Re-render with the new unit without re-fetching. */
function reRenderUnit() {
  const b = state.lastBundle;
  if (!b) return;
  renderCurrent(b.current, todayPoint(b), b.location, b.generatedAt);
  renderHourly(b.hourly);
  renderDaily(b.daily, b.current);
  renderDetails(b.current, b.astronomy);
}

/* ══════════════════════════════════════════════════════════════════════════
   NOTIFICATIONS
   ══════════════════════════════════════════════════════════════════════════ */
function syncNotifyButton() {
  const btn = el('notify-toggle');
  if (!btn) return;
  const granted = notificationsGranted();
  btn.setAttribute('aria-pressed', String(granted));
  btn.setAttribute('aria-label', granted ? 'Weather notifications enabled' : 'Enable weather notifications');
  btn.title = granted ? 'Notifications enabled' : 'Notifications';
}

/**
 * Has the user granted notification permission?
 *
 * `typeof`, not `in`. The `Notification` property can EXIST and still be
 * `undefined` — a browser that exposes the name but not the constructor behind
 * it, a stub, a hardened embedder — and `'Notification' in window` is then
 * `true`, so the `&&` does not short-circuit and the `.permission` read throws.
 *
 * That mattered because this function is the third statement of the
 * `DOMContentLoaded` handler: the throw aborted the rest of the bootstrap, so
 * the featured-city chips never rendered and none of the six control handlers
 * were ever attached. A dead page, from a check that was supposed to be the
 * safe one.
 *
 * Every call site goes through here, including the one inside `requestPermission`
 * that was already wrapped in its own try/catch — the guard existed at one site
 * and not its two siblings, which is how the exception reached the top level in
 * the first place.
 */
function notificationsGranted() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

async function toggleNotifications() {
  if (typeof Notification === 'undefined') {
    showToast('Notifications are not supported in this browser.');
    return;
  }
  if (Notification.permission === 'granted') {
    showToast('Weather notifications are already enabled.');
    return;
  }
  if (Notification.permission === 'denied') {
    showToast('Notifications are blocked — allow them in your browser settings.');
    return;
  }
  const result = await Notification.requestPermission();
  syncNotifyButton();
  showToast(result === 'granted'
    ? 'Weather notifications enabled.'
    : 'Notification permission was not granted.');
}

/* ══════════════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  refreshIcons();
  syncNotifyButton();
  initHourlyScrollSync();
  initJumpBar();
  loadFeatured();
  el('auto-refresh-label').textContent = `Refreshes every ${Math.round(REFRESH_MS / 60000)} min`;

  // The masthead grows a hairline shadow only once the page is scrolled.
  const header = el('site-header');
  const onScroll = () => header.classList.toggle('is-stuck', window.scrollY > 4);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* Classic scrollbar width, published as `--nw-sb` for the full-bleed map band.
   * `100vw` includes the scrollbar, so the band was 15px wider than the visible
   * area and `overflow-x: clip` cropped 7.5px off both edges. No CSS viewport
   * unit excludes it, so it is measured here. Overlay-scrollbar platforms report
   * 0, which is already correct for them. */
  const setScrollbarWidth = () => {
    const px = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--nw-sb', `${Math.max(0, px)}px`);
  };
  setScrollbarWidth();
  window.addEventListener('resize', setScrollbarWidth, { passive: true });
  /* Also observe the document itself. `#forecast` ships `hidden`, so the first
   * paint is short and has NO vertical scrollbar: `--nw-sb` measured 0, then
   * loading a location grows the page ~5000px, the scrollbar appears, and the
   * full-bleed map band painted 15px too wide with no event to correct it until
   * the reader happened to resize. `resize` does not fire for a scrollbar
   * appearing, so observe the box. */
  if (typeof ResizeObserver === 'function') {
    let last = -1;
    new ResizeObserver(() => {
      const px = window.innerWidth - document.documentElement.clientWidth;
      if (px !== last) { last = px; setScrollbarWidth(); }
    }).observe(document.documentElement);
  }

  // Search
  const searchForm = el('search-form');
  const searchInput = el('q');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      doSearch(searchInput.value.trim());
    });
  }
  if (searchInput) {
    searchInput.addEventListener('input', () => onSearchInput(searchInput.value));
    searchInput.addEventListener('keydown', onSearchKeydown);
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) closeSearchResults();
  });

  // Skip link: inert until a location is loaded, so fall back to the empty state.
  el('skip-link').addEventListener('click', (e) => {
    if (el('forecast').classList.contains('hidden')) {
      e.preventDefault();
      el('main').scrollIntoView();
    }
  });

  // Geolocation
  el('geo-btn').addEventListener('click', useMyLocation);

  // Theme toggle
  el('theme-toggle').addEventListener('click', () => {
    applyTheme(state.theme === 'light' ? 'dark' : 'light');
  });

  // Unit toggle
  el('unit-toggle').addEventListener('click', () => {
    state.unit = state.unit === 'C' ? 'F' : 'C';
    writeStored('unit', state.unit);
    /* The visible label and the accessible name are written together, HERE.
     *
     * The name update used to live inside `reRenderUnit()`, which returns on its
     * second line when there is no bundle. So in the empty state — the default
     * first-run view, before any location is chosen — clicking the toggle moved
     * the visible label to "°F" and left the name saying "°C, Celsius. Switch to
     * Fahrenheit": the wrong current unit AND the wrong next action, a 2.5.3
     * Label in Name failure reachable without doing anything unusual. Writing both
     * at the one site that changes `state.unit` also removes the last way the
     * two could drift. */
    el('unit-label').textContent = unitLabel();
    el('unit-toggle').setAttribute('aria-label', unitToggleLabel());
    reRenderUnit();
  });
  el('unit-label').textContent = unitLabel();
  el('unit-toggle').setAttribute('aria-label', unitToggleLabel());

  // Notifications
  el('notify-toggle').addEventListener('click', toggleNotifications);

  // Retry after a failed load
  el('retry-btn').addEventListener('click', () => {
    if (state.currentLat === null) return;
    clearRefreshTimer();
    loadWeather(state.currentLat, state.currentLon, state.currentName);
  });
});
