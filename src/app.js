import * as Astronomy from 'astronomy-engine';
import L from 'leaflet';
import { lunaRange, formatLocal, magneticDeclinationDeg, localMidnight, addDaysYmd, phaseName } from './luna.js';
import { moonSvg } from './moon.js';

const DEFAULT_PLACE = {
  name: 'Obelisco',
  detail: 'San Nicolás, CABA, Argentina',
  lat: -34.60371,
  lon: -58.38163,
  tz: 'America/Argentina/Buenos_Aires',
};
const STORAGE_KEYS = { state: 'lunapp.state', favorites: 'lunapp.favorites' };
const PHOTON_URL = 'https://photon.komoot.io/api/';
const TIMEZONE_URL = 'https://api.open-meteo.com/v1/forecast';
const SEARCH_DEBOUNCE_MS = 350;
const SYNODIC_MONTH_DAYS = 29.530588;
const STAR_COUNT = 140;

const $ = (id) => document.getElementById(id);

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private mode or blocked storage: state just isn't remembered */ }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const saved = readStorage(STORAGE_KEYS.state, {});
const state = {
  place: saved.place ?? DEFAULT_PLACE,
  baseLayer: saved.baseLayer ?? null,
};
let favorites = readStorage(STORAGE_KEYS.favorites, []);
let nextRise = null;
let nextRiseDay = null;

function todayIn(tz) {
  return formatLocal(new Date(), tz).slice(0, 10);
}

function persist() {
  const { place, baseLayer } = state;
  writeStorage(STORAGE_KEYS.state, { place, baseLayer });
}

const fmtDeg = (v) => `${Math.round(v)}°`;
const fmtNum = (v, digits = 0) => v.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function ymdToNoonUtc(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

const formatters = {
  weekday: new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'short' }),
  month: new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', month: 'long', year: 'numeric' }),
};

function timeLabel(event, cardYmd, tz) {
  const local = formatLocal(event.date ?? event, tz);
  const dayShift = Math.round((Date.parse(local.slice(0, 10)) - Date.parse(cardYmd)) / 86400000);
  return local.slice(11) + (dayShift ? ` (${dayShift > 0 ? '+' : ''}${dayShift}d)` : '');
}

function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function renderStars() {
  const random = seededRandom(20261124);
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const size = random() ** 3 * 1.4 + 0.35;
    const twinkle = random() < 0.12;
    const delay = (random() * 4).toFixed(2);
    stars.push(`<circle cx="${(random() * 100).toFixed(2)}%" cy="${(random() * 100).toFixed(2)}%" r="${size.toFixed(2)}"
      fill="#fff" opacity="${(0.25 + random() * 0.7).toFixed(2)}"${twinkle ? ` class="tw" style="animation-delay:-${delay}s"` : ''}/>`);
  }
  $('stars').innerHTML = stars.join('');
}

function renderPlace() {
  const { place } = state;
  $('place-name').textContent = place.name;
  $('place-detail').textContent = place.detail || `${fmtNum(place.lat, 4)}, ${fmtNum(place.lon, 4)}`;
  const declination = magneticDeclinationDeg(place.lat, place.lon, new Date());
  renderFavorites();
  $('declination-note').textContent = `Acá el norte magnético está ${fmtNum(Math.abs(declination), 1)}° al ${declination < 0 ? 'oeste' : 'este'} del verdadero.`;
}

function isSamePlace(a, b) {
  return a.lat === b.lat && a.lon === b.lon;
}

function renderFavorites() {
  const saved = favorites.some((f) => isSamePlace(f, state.place));
  $('save-favorite').classList.toggle('saved', saved);
  $('save-favorite').setAttribute('aria-pressed', String(saved));
  $('save-favorite').title = saved ? 'Quitar de favoritos' : 'Guardar en favoritos';
  $('favorites-block').hidden = favorites.length === 0;
  $('favorites').innerHTML = favorites.map((f, i) => `
    <li><button type="button" data-use="${i}">${escapeHtml(f.name)}<span class="sub">${escapeHtml(f.detail ?? '')}</span></button>
    <button type="button" class="link" data-remove="${i}" aria-label="Quitar ${escapeHtml(f.name)}">Quitar</button></li>`).join('');
}

function moonIcon(fraction, elongationDeg, size) {
  return moonSvg({
    fraction,
    waxing: elongationDeg < 180,
    southern: state.place.lat < 0,
    size,
    label: `${phaseName(elongationDeg)}, ${fmtNum(fraction * 100)}% iluminada`,
  });
}

function renderHero(upcoming) {
  const { place } = state;
  const now = new Date();
  const fraction = Astronomy.Illumination(Astronomy.Body.Moon, now).phase_fraction;
  const elongation = Astronomy.MoonPhase(now);
  const previousNew = Astronomy.SearchMoonPhase(0, now, -SYNODIC_MONTH_DAYS - 1);
  const ageDays = (now - previousNew.date) / 86400000;

  $('hero-moon').innerHTML = moonIcon(fraction, elongation, 96);
  $('hero-phase').textContent = phaseName(elongation);
  $('hero-detail').textContent = `${fmtNum(fraction * 100)}% iluminada · ${fmtNum(ageDays, 0)} días desde la luna nueva`;

  const day = upcoming.find((d) => d.visibleRise && d.visibleRise.date > now);
  nextRise = day?.visibleRise ?? null;
  nextRiseDay = day?.date ?? null;
}

function daysUntilEndOfNextMonth(todayYmd) {
  const [y, m] = todayYmd.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return Math.round((Date.parse(lastDay) - Date.parse(todayYmd)) / 86400000) + 1;
}

function phaseEventsByLocalDate(elongationDeg, startYmd, days, tz) {
  const result = new Map();
  const end = localMidnight(addDaysYmd(startYmd, days + 1), tz);
  let t = Astronomy.SearchMoonPhase(elongationDeg, localMidnight(addDaysYmd(startYmd, -2), tz), 40);
  while (t && t.date < end) {
    result.set(formatLocal(t.date, tz).slice(0, 10), t.date);
    t = Astronomy.SearchMoonPhase(elongationDeg, t.AddDays(1), 40);
  }
  return result;
}

// Full Moon days get a moonlit tint, new Moon days a dark one, fading in between.
function phaseBackground(fraction) {
  if (fraction >= 0.5) return `rgba(190, 205, 255, ${(0.13 * ((fraction - 0.5) / 0.5) ** 2).toFixed(3)})`;
  return `rgba(0, 0, 0, ${(0.4 * ((0.5 - fraction) / 0.5) ** 2).toFixed(3)})`;
}

function trajectoryTable(day, tz) {
  const maxAltitude = Math.max(...day.trajectory.map((p) => p.altitude), 1);
  const rows = day.trajectory.map((p) => {
    const barPct = Math.max(0, p.altitude) / maxAltitude * 100;
    return `<tr${p.minutesAfterRise === 0 ? ' class="rise-row"' : ''}>
      <td class="dt">${p.minutesAfterRise === 0 ? 'sale' : `+${p.minutesAfterRise}′`}</td>
      <td class="alt"><span class="v">${fmtNum(p.altitude, 1)}°</span><span class="track-bar"><span style="width:${barPct.toFixed(0)}%"></span></span></td>
      <td>${fmtDeg(p.azimuthTrue)}</td><td class="m">${fmtDeg(p.azimuthMagnetic)}</td>
      <td class="time">${timeLabel(p, day.date, tz)}</td></tr>`;
  }).join('');
  return `<details class="tip"><summary>¿Hay árboles o edificios? Cómo usar la tabla</summary>
      <p>Los horarios son para un horizonte plano. Medí cuántos grados tapa el obstáculo en la dirección de la salida: con el brazo bien estirado, un puño cerrado ≈ 10°, tres dedos juntos ≈ 5°, el meñique ≈ 1° (±30% según tu brazo y tu mano). Con un inclinómetro en el celular es más preciso. Después buscá abajo la primera fila con una altura mayor: esa es la hora y la dirección en que la vas a ver asomar.</p>
    </details>
    <table class="track"><thead><tr><th></th><th class="alt">Altura</th><th>V</th><th class="m">M</th><th>Hora</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function skyPhrase(sky) {
  return sky.startsWith('crepúsculo') ? `Sale en el ${sky}` : `Sale de ${sky}`;
}

function tile(label, value, sub = '') {
  return `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value">${value}</div>${sub ? `<div class="tile-sub">${sub}</div>` : ''}</div>`;
}

function dayBody(day, tz, fullMoonAt, newMoonAt, { withTrack = true } = {}) {
  const vr = day.visibleRise;
  const sunset = day.sun.set ? timeLabel(day.sun.set, day.date, tz) : '—';
  const riseTile = vr
    ? `<div class="tile tile-rise">
        <div class="tile-label">Salida</div>
        <div class="rise-main"><span class="rise-time num">${timeLabel(vr, day.date, tz)}</span>
          <span class="rise-dir">${vr.cardinal}<span class="num"> ${fmtDeg(vr.azimuthTrue)} V · ${fmtDeg(vr.azimuthMagnetic)} M</span></span></div>
        <div class="tile-sub">${skyPhrase(day.sun.skyAtVisibleRise)} · atardecer ${sunset}</div>
      </div>`
    : `<div class="tile tile-rise"><div class="tile-label">Salida</div><div class="tile-value muted">No sale este día</div>
        <div class="tile-sub">Sale poco antes de la medianoche anterior y vuelve a salir pasada la siguiente.</div></div>`;
  const phaseEvent = fullMoonAt ? ['Luna llena', fullMoonAt] : newMoonAt ? ['Luna nueva', newMoonAt] : null;
  const tiles = [
    day.set
      ? tile('Puesta', `<span class="num">${timeLabel(day.set, day.date, tz)}</span>`, `${day.set.cardinal} · ${fmtDeg(day.set.azimuthTrue)} V`)
      : tile('Puesta', '<span class="muted">No se pone</span>'),
    day.transit
      ? tile('Más alta', `<span class="num">${timeLabel(day.transit, day.date, tz)}</span>`, `${fmtNum(day.transit.altitude, 0)}° de altura${day.transit.altitude < 0 ? ' (bajo el horizonte)' : ''}`)
      : tile('Más alta', '—'),
    tile('Fase', `<span class="num">${fmtNum(day.phase.fraction * 100)}%</span>`, day.phase.name),
    phaseEvent
      ? tile(phaseEvent[0], `<span class="num">${timeLabel(phaseEvent[1], day.date, tz)}</span>`, 'instante exacto')
      : vr ? tile('Distancia', `<span class="num">${fmtNum(vr.topocentricKm / 1000, 1)}</span> mil km`) : '',
  ].join('');
  return `<div class="day-body">
    ${riseTile}
    <div class="tiles">${tiles}</div>
    ${vr && withTrack ? trajectoryTable(day, tz) : ''}
  </div>`;
}

function dayRow(day, tz, today, fullMoons, newMoons, { idPrefix = 'd', open = false, withTrack = true } = {}) {
  const vr = day.visibleRise;
  const date = ymdToNoonUtc(day.date);
  const fullMoonAt = fullMoons.get(day.date);
  const newMoonAt = newMoons.get(day.date);
  const classes = ['day', day.date === today && 'today', fullMoonAt && 'full'].filter(Boolean).join(' ');
  const rise = vr
    ? `<div class="ev"><div class="t num"><span class="arrow">↑</span>${timeLabel(vr, day.date, tz)}</div><div class="a">${vr.cardinal} ${fmtDeg(vr.azimuthTrue)}</div></div>`
    : '<div class="ev none"><div class="t"><span class="arrow">↑</span>—</div><div class="a">no sale</div></div>';
  const set = day.set
    ? `<div class="ev"><div class="t num"><span class="arrow">↓</span>${timeLabel(day.set, day.date, tz)}</div><div class="a">${day.set.cardinal}</div></div>`
    : '<div class="ev none"><div class="t"><span class="arrow">↓</span>—</div><div class="a">no se pone</div></div>';
  return `<details class="${classes}" id="${idPrefix}-${day.date}" style="background:${phaseBackground(day.phase.fraction)}"${open ? ' open' : ''}>
    <summary>
      <div class="date"><b class="num">${date.getUTCDate()}</b><span>${formatters.weekday.format(date)}</span>${fullMoonAt ? '<span class="phase-tag">llena</span>' : ''}${newMoonAt ? '<span class="phase-tag new">nueva</span>' : ''}</div>
      <div class="phase-icon">${moonIcon(day.phase.fraction, day.phase.elongationDeg, 34)}</div>
      ${rise}${set}
      <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </summary>
    ${dayBody(day, tz, fullMoonAt, newMoonAt, { withTrack })}
  </details>`;
}

function renderDays(results) {
  const { place } = state;
  const today = todayIn(place.tz);
  const fullMoons = phaseEventsByLocalDate(180, today, results.length, place.tz);
  const newMoons = phaseEventsByLocalDate(0, today, results.length, place.tz);
  const byMonth = new Map();
  for (const day of results) {
    const key = day.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(day);
  }
  const nextDay = results.find((d) => d.date === nextRiseDay);
  $('next-day').innerHTML = nextDay
    ? `<div class="month">Próxima salida</div>
       <div class="days">${dayRow(nextDay, place.tz, today, fullMoons, newMoons, { idPrefix: 'next', open: true, withTrack: false })}</div>`
    : '';
  $('next-track').innerHTML = nextDay?.visibleRise
    ? `<div class="month">Recorrido tras la salida</div>${trajectoryTable(nextDay, place.tz)}`
    : '';
  $('day-list').innerHTML = [...byMonth.values()].map((monthDays) => `
    <div class="month">${formatters.month.format(ymdToNoonUtc(monthDays[0].date))}</div>
    <div class="days">${monthDays.map((d) => dayRow(d, place.tz, today, fullMoons, newMoons)).join('')}</div>`).join('');
}

function render() {
  const { place } = state;
  const today = todayIn(place.tz);
  const results = lunaRange(place.lat, place.lon, place.tz, today, daysUntilEndOfNextMonth(today));
  renderHero(results);
  renderDays(results);
  updateMap();
}

function setPlace(place) {
  state.place = place;
  persist();
  renderPlace();
  render();
}

function toggleHelp() {
  const open = $('help-panel').hidden;
  $('help-panel').hidden = !open;
  $('toggle-help').setAttribute('aria-expanded', String(open));
}

async function timeZoneFor(lat, lon) {
  try {
    const params = new URLSearchParams({ latitude: lat, longitude: lon, timezone: 'auto' });
    const response = await fetch(`${TIMEZONE_URL}?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { timezone } = await response.json();
    return timezone || null;
  } catch {
    return null;
  }
}

// Map

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_ATTRIBUTION = '© Esri';
const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const esri = (service, extra = {}) => L.tileLayer(`${ESRI}/${service}/MapServer/tile/{z}/{y}/{x}`, {
  maxNativeZoom: 18, maxZoom: 20, attribution: ESRI_ATTRIBUTION, ...extra,
});
const BASE_LAYERS = {
  'Calles': () => esri('World_Street_Map'),
  'Satélite': () => L.layerGroup([
    esri('World_Imagery', { attribution: `${ESRI_ATTRIBUTION}, Maxar` }),
    esri('Reference/World_Transportation', { opacity: 0.8, attribution: '' }),
  ]),
  'Oscuro': () => L.layerGroup([
    esri('Canvas/World_Dark_Gray_Base', { maxNativeZoom: 16 }),
    esri('Canvas/World_Dark_Gray_Reference', { maxNativeZoom: 16, attribution: '' }),
  ]),
  'OpenStreetMap': () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: OSM_ATTRIBUTION }),
};
const DEFAULT_BASE_LAYER = 'Satélite';
const ARROW = {
  maxMeters: 1000,
  screenFraction: 0.38,
  shaftHalfWidthPx: 4,
  headHalfWidthPx: 13,
  headLengthPx: 22,
  startGapPx: 14,
};

let map = null;
let marker = null;
let riseArrow = null;
let riseLabel = null;

function metersPerPixel(lat, zoom) {
  return (40075016.686 * Math.cos(lat * Math.PI / 180)) / 2 ** (zoom + 8);
}

// Built in screen pixels so its size follows the zoom, then converted to lat/lon.
// On a Mercator map a short segment's screen bearing equals its true azimuth.
function arrowLatLngs(lat, lon, azimuthDeg) {
  const size = map.getSize();
  const lengthPx = Math.min(
    ARROW.screenFraction * Math.min(size.x, size.y),
    ARROW.maxMeters / metersPerPixel(lat, map.getZoom()),
  );
  const origin = map.latLngToLayerPoint([lat, lon]);
  const az = azimuthDeg * Math.PI / 180;
  const along = L.point(Math.sin(az), -Math.cos(az));
  const across = L.point(Math.cos(az), Math.sin(az));
  const at = (distance, offset) => origin.add(along.multiplyBy(distance)).add(across.multiplyBy(offset));
  const start = Math.min(ARROW.startGapPx, lengthPx / 3);
  const neck = Math.max(start, lengthPx - ARROW.headLengthPx);
  return [
    at(start, -ARROW.shaftHalfWidthPx), at(neck, -ARROW.shaftHalfWidthPx), at(neck, -ARROW.headHalfWidthPx),
    at(lengthPx, 0),
    at(neck, ARROW.headHalfWidthPx), at(neck, ARROW.shaftHalfWidthPx), at(start, ARROW.shaftHalfWidthPx),
  ].map((p) => map.layerPointToLatLng(p));
}

const RiseLabel = L.Control.extend({
  options: { position: 'topright' },
  onAdd() {
    this.el = L.DomUtil.create('div', 'map-label');
    return this.el;
  },
  setText(text) {
    this.el.textContent = text;
    this.el.hidden = !text;
  },
});

function drawArrow() {
  if (!map) return;
  const { lat, lon } = state.place;
  if (!nextRise) {
    riseArrow?.remove();
    riseArrow = null;
    return;
  }
  const latlngs = arrowLatLngs(lat, lon, nextRise.azimuthTrue);
  if (riseArrow) {
    riseArrow.setLatLngs(latlngs);
  } else {
    riseArrow = L.polygon(latlngs, {
      className: 'rise-arrow', color: '#0b1020', weight: 2, opacity: 0.9,
      fillColor: '#f2c96d', fillOpacity: 1, lineJoin: 'round', interactive: false,
    }).addTo(map);
  }
}

function updateMap({ recenter = false } = {}) {
  if (!map) return;
  const { lat, lon } = state.place;
  marker.setLatLng([lat, lon]);
  if (recenter) map.setView([lat, lon], Math.max(map.getZoom(), 16));
  drawArrow();
  riseLabel.setText(nextRise ? `Próxima salida · ${nextRise.cardinal} ${fmtDeg(nextRise.azimuthTrue)}` : '');
}

async function moveTo(latlng) {
  const { lat, lng } = latlng;
  const tz = (await timeZoneFor(lat, lng)) ?? state.place.tz;
  setPlace({
    ...state.place,
    detail: `Punto ajustado · ${fmtNum(lat, 5)}, ${fmtNum(lng, 5)}`,
    lat, lon: lng, tz,
  });
}

function initMap() {
  const { lat, lon } = state.place;
  map = L.map('map', { zoomControl: true }).setView([lat, lon], 16);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  const layers = Object.fromEntries(Object.entries(BASE_LAYERS).map(([name, create]) => [name, create()]));
  const chosen = layers[state.baseLayer] ? state.baseLayer : DEFAULT_BASE_LAYER;
  layers[chosen].addTo(map);
  riseLabel = new RiseLabel().addTo(map);
  L.control.layers(layers, null, { position: 'topright' }).addTo(map);
  map.on('baselayerchange', (event) => {
    state.baseLayer = event.name;
    persist();
  });
  marker = L.marker([lat, lon], {
    draggable: true,
    zIndexOffset: 1000,
    icon: L.divIcon({ className: '', html: '<div class="map-pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
  }).addTo(map);
  marker.on('dragend', () => moveTo(marker.getLatLng()));
  map.on('click', (event) => moveTo(event.latlng));
  map.on('zoomend resize', drawArrow);
}

// Search

let searchResults = [];
let searchTimer = null;
let searchController = null;

function describeFeature(p) {
  const locality = p.district ?? p.locality ?? p.city ?? p.county;
  return [p.street && p.name !== p.street ? p.street : null, locality, p.state, p.country]
    .filter((v, i, all) => v && all.indexOf(v) === i).join(', ');
}

async function searchPlaces(query) {
  searchController?.abort();
  searchController = new AbortController();
  const params = new URLSearchParams({ q: query, limit: '8', lat: state.place.lat, lon: state.place.lon });
  const response = await fetch(`${PHOTON_URL}?${params}`, { signal: searchController.signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  return json.features.map((f) => ({
    name: f.properties.name ?? f.properties.street ?? query,
    detail: describeFeature(f.properties),
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
  }));
}

async function runSearch() {
  const query = $('search-input').value.trim();
  if (query.length < 3) {
    $('search-results').innerHTML = '';
    return;
  }
  $('search-error').hidden = true;
  try {
    searchResults = await searchPlaces(query);
    $('search-results').innerHTML = searchResults.length
      ? searchResults.map((r, i) => `<li><button type="button" data-result="${i}">${escapeHtml(r.name)}<span class="sub">${escapeHtml(r.detail)}</span></button></li>`).join('')
      : '<li class="muted small">Sin resultados.</li>';
  } catch (error) {
    if (error.name === 'AbortError') return;
    $('search-results').innerHTML = '';
    $('search-error').textContent = `No se pudo buscar: ${error.message}.`;
    $('search-error').hidden = false;
  }
}

$('search-input').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
});
$('search-input').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  clearTimeout(searchTimer);
  runSearch();
});

$('search-results').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-result]');
  if (!button) return;
  const result = searchResults[Number(button.dataset.result)];
  const tz = (await timeZoneFor(result.lat, result.lon)) ?? deviceTimeZone;
  $('search-results').innerHTML = '';
  $('search-input').value = '';
  setPlace({ ...result, tz });
  updateMap({ recenter: true });
});


$('toggle-help').addEventListener('click', toggleHelp);

$('gps-button').addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Este navegador no da acceso al GPS.');
    return;
  }
  $('gps-button').disabled = true;
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      $('gps-button').disabled = false;
      const tz = (await timeZoneFor(coords.latitude, coords.longitude)) ?? deviceTimeZone;
      setPlace({ name: 'Mi ubicación', detail: `GPS ±${Math.round(coords.accuracy)} m`, lat: coords.latitude, lon: coords.longitude, tz });
      updateMap({ recenter: true });
    },
    (error) => {
      $('gps-button').disabled = false;
      alert(`No se pudo obtener la ubicación: ${error.message}`);
    },
    { enableHighAccuracy: true, timeout: 20000 },
  );
});

$('save-favorite').addEventListener('click', () => {
  const { place } = state;
  const others = favorites.filter((f) => !isSamePlace(f, place));
  favorites = others.length === favorites.length ? [...favorites, place] : others;
  writeStorage(STORAGE_KEYS.favorites, favorites);
  renderFavorites();
});

$('favorites').addEventListener('click', (event) => {
  const use = event.target.closest('[data-use]');
  const remove = event.target.closest('[data-remove]');
  if (use) setPlace(favorites[Number(use.dataset.use)]);
  if (remove) {
    favorites = favorites.filter((_, i) => i !== Number(remove.dataset.remove));
    writeStorage(STORAGE_KEYS.favorites, favorites);
    renderFavorites();
  }
});

renderStars();
renderPlace();
renderFavorites();
render();
initMap();
updateMap();
