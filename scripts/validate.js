import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Astronomy from 'astronomy-engine';
import { lunaRange, localMidnight, addDaysYmd } from '../src/luna.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, 'validation', 'cache');
const REPORT_PATH = join(ROOT, 'validation', 'report.md');

const START = process.argv[2] ?? '2026-10-27';
const DAYS = Number(process.argv[3] ?? 30);
const TOLERANCE_MIN = 1;
const TOLERANCE_AZ_DEG = 0.5;
const MATCH_WINDOW_MIN = 90;
const RAISED_HORIZON_DEG = 5;
const TOLERANCE_HORIZON_DEG = 0.05;
// USNO omits the upper transit when the Moon stays below the horizon all day.
const MIN_TRANSIT_ALTITUDE_DEG = -0.3;

const CASES = [
  { name: 'Buenos Aires (Rosedal)', lat: -34.5773, lon: -58.4190, tz: 'America/Argentina/Buenos_Aires' },
  { name: 'Quito', lat: -0.1807, lon: -78.4678, tz: 'America/Guayaquil' },
  { name: 'Ushuaia', lat: -54.8019, lon: -68.3030, tz: 'America/Argentina/Ushuaia' },
  { name: 'Tromsø', lat: 69.6492, lon: 18.9553, tz: 'Europe/Oslo' },
  { name: 'Auckland', lat: -36.8485, lon: 174.7633, tz: 'Pacific/Auckland' },
  { name: 'Mumbai', lat: 19.0760, lon: 72.8777, tz: 'Asia/Kolkata' },
];

const PHEN = { rise: 'Rise', set: 'Set', transit: 'Upper Transit' };

async function cachedFetchJson(cacheKey, url) {
  const path = join(CACHE_DIR, `${cacheKey}.json`);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch { /* not cached yet */ }
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(path, JSON.stringify(json));
      return json;
    } catch (error) {
      if (attempt >= 4) throw new Error(`${url}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
}

function slug(text) {
  return text.normalize('NFD').replace(/[^\w]+/g, '_').toLowerCase();
}

async function usnoMoonEvents(c, utcDates) {
  const events = [];
  for (const ymd of utcDates) {
    const url = `https://aa.usno.navy.mil/api/rstt/oneday?date=${ymd}&coords=${c.lat},${c.lon}&tz=0`;
    const json = await cachedFetchJson(`usno_${slug(c.name)}_${ymd}`, url);
    for (const { phen, time } of json.properties.data.moondata ?? []) {
      if (phen === 'Lower Transit') continue;
      events.push({ phen, date: new Date(`${ymd}T${time}:00Z`) });
    }
  }
  return events;
}

function toJulianDayUt(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

async function horizonsSamples(c, dates) {
  const tlist = dates.map((d) => `'${toJulianDayUt(d).toFixed(8)}'`).join(' ');
  const params = new URLSearchParams({
    format: 'json', COMMAND: "'301'", MAKE_EPHEM: 'YES', EPHEM_TYPE: 'OBSERVER',
    CENTER: "'coord@399'", COORD_TYPE: 'GEODETIC', SITE_COORD: `'${c.lon},${c.lat},0'`,
    TLIST_TYPE: 'JD', TIME_TYPE: 'UT', TLIST: tlist, QUANTITIES: "'4,10,20'",
    APPARENT: 'REFRACTED', ANG_FORMAT: 'DEG', CSV_FORMAT: 'YES',
  });
  const key = `horizons_${slug(c.name)}_${dates.length}_${Math.round(toJulianDayUt(dates[0]) * 1000)}`;
  const json = await cachedFetchJson(key, `https://ssd.jpl.nasa.gov/api/horizons.api?${params}`);
  const body = json.result.split('$$SOE')[1]?.split('$$EOE')[0];
  if (!body) throw new Error(`Horizons sin efemérides para ${c.name}:\n${json.result.slice(0, 2000)}`);
  const rows = body.trim().split('\n').map((line) => line.split(',').map((s) => s.trim()));
  if (rows.length !== dates.length) throw new Error(`Horizons devolvió ${rows.length} filas, esperaba ${dates.length}`);
  return rows.map((r) => ({ azimuth: Number(r[3]), altitude: Number(r[4]), illumPct: Number(r[5]), distKm: Number(r[6]) * Astronomy.KM_PER_AU }));
}

function angularDifference(a, b) {
  return ((a - b + 540) % 360) - 180;
}

function ourEvents(days) {
  const events = [];
  for (const day of days) {
    for (const kind of ['rise', 'set', 'transit']) {
      if (kind === 'transit' && day.transit?.altitude < MIN_TRANSIT_ALTITUDE_DEG) continue;
      if (day[kind]) events.push({ phen: PHEN[kind], kind, day: day.date, date: day[kind].date, azimuth: day[kind].azimuthTrue });
    }
  }
  return events;
}

function matchEvents(ours, reference, windowStart, windowEnd) {
  const usedReference = new Set();
  const matched = [];
  const unmatchedOurs = [];
  for (const event of ours) {
    let best = null;
    for (const [i, ref] of reference.entries()) {
      if (ref.phen !== event.phen || usedReference.has(i)) continue;
      const diffMin = (event.date - ref.date) / 60000;
      if (Math.abs(diffMin) <= MATCH_WINDOW_MIN && (!best || Math.abs(diffMin) < Math.abs(best.diffMin))) best = { i, diffMin };
    }
    if (best) {
      usedReference.add(best.i);
      matched.push({ ...event, diffMin: best.diffMin });
    } else {
      unmatchedOurs.push(event);
    }
  }
  const unmatchedReference = reference.filter((ref, i) => !usedReference.has(i) && ref.date >= windowStart && ref.date < windowEnd);
  return { matched, unmatchedOurs, unmatchedReference };
}

function summarize(values) {
  const abs = values.map(Math.abs);
  return {
    n: values.length,
    maxAbs: abs.length ? Math.max(...abs) : NaN,
    meanAbs: abs.length ? abs.reduce((s, v) => s + v, 0) / abs.length : NaN,
  };
}

const fmt = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '—');

async function validateCase(c) {
  const days = lunaRange(c.lat, c.lon, c.tz, START, DAYS, 0);
  const windowStart = localMidnight(START, c.tz);
  const windowEnd = localMidnight(addDaysYmd(START, DAYS), c.tz);
  const utcDates = [];
  for (let ymd = addDaysYmd(windowStart.toISOString().slice(0, 10), -1); ymd <= windowEnd.toISOString().slice(0, 10); ymd = addDaysYmd(ymd, 1)) {
    utcDates.push(ymd);
  }

  const reference = await usnoMoonEvents(c, utcDates);
  const ours = ourEvents(days);
  const { matched, unmatchedOurs, unmatchedReference } = matchEvents(ours, reference, windowStart, windowEnd);

  const riseSetEvents = ours.filter((e) => e.kind !== 'transit').sort((a, b) => a.date - b.date);
  const samples = riseSetEvents.length ? await horizonsSamples(c, riseSetEvents.map((e) => e.date)) : [];
  const azDiffs = riseSetEvents.map((e, i) => angularDifference(e.azimuth, samples[i].azimuth));
  const altAtEvent = samples.map((s) => s.altitude);

  const illumDiffs = [];
  const distDiffs = [];
  const daysWithRise = days.filter((d) => d.rise);
  if (daysWithRise.length) {
    const check = await horizonsSamples(c, daysWithRise.map((d) => d.rise.date).sort((a, b) => a - b));
    daysWithRise.sort((a, b) => a.rise.date - b.rise.date).forEach((d, i) => {
      illumDiffs.push(d.phase.fraction * 100 - check[i].illumPct);
      distDiffs.push(d.rise.topocentricKm - check[i].distKm);
    });
  }

  const raisedDays = lunaRange(c.lat, c.lon, c.tz, START, DAYS, RAISED_HORIZON_DEG).filter((d) => d.visibleRise);
  const raisedSamples = await horizonsSamples(c, raisedDays.map((d) => d.visibleRise.date));
  const raisedHorizonDiffs = raisedDays.map((d, i) => raisedSamples[i].altitude - (RAISED_HORIZON_DEG - d.visibleRise.angularDiameterDeg / 2));

  const byKind = (kind) => summarize(matched.filter((m) => m.kind === kind).map((m) => m.diffMin));
  return {
    c, days, matched, unmatchedOurs, unmatchedReference,
    rise: byKind('rise'), set: byKind('set'), transit: byKind('transit'),
    azimuth: summarize(azDiffs),
    altitudeAtEvent: { min: Math.min(...altAtEvent), max: Math.max(...altAtEvent) },
    illumination: summarize(illumDiffs),
    distance: summarize(distDiffs),
    raisedHorizon: summarize(raisedHorizonDiffs),
    raisedHorizonFailures: raisedDays.map((d, i) => ({ day: d.date, diff: raisedHorizonDiffs[i] })).filter((e) => Math.abs(e.diff) > TOLERANCE_HORIZON_DEG),
    timeFailures: matched.filter((m) => Math.abs(m.diffMin) > TOLERANCE_MIN),
    azFailures: riseSetEvents.map((e, i) => ({ ...e, azDiff: azDiffs[i] })).filter((e) => Math.abs(e.azDiff) > TOLERANCE_AZ_DEG),
    noRiseDays: days.filter((d) => d.noRise).map((d) => d.date),
    noSetDays: days.filter((d) => d.noSet).map((d) => d.date),
  };
}

function renderReport(results) {
  const lines = [
    '# Validación del núcleo de cálculo',
    '',
    `Generado por \`npm run validate\` el ${new Date().toISOString().slice(0, 16)}Z. Rango: ${DAYS} días desde ${START} (hora local de cada lugar). Horizonte 0°.`,
    '',
    '- **Horarios** (salida, puesta y tránsito de la luna) contra la API de USNO (`rstt/oneday`, en UTC). USNO redondea al minuto, así que ±0,5 min es ruido de redondeo.',
    `- **Acimut, iluminación y distancia topocéntrica** contra JPL Horizons (refractado), en los instantes que calcula el núcleo.`,
    '- Convenciones de USNO que no son errores: no lista el tránsito superior si la luna está bajo el horizonte todo el día, y lista "Lower Transit" (ignorado aquí) cuando es circumpolar.',
    '- La iluminación del núcleo es geocéntrica y la de Horizons topocéntrica: diferencias < 1 pp son esperables. La distancia difiere ~50 km (≈0,014%) por la corrección de tiempo-luz de Horizons.',
    `- Tolerancias: ±${TOLERANCE_MIN} min en horarios, ±${TOLERANCE_AZ_DEG}° en acimut.`,
    '',
    '## Horarios vs USNO (minutos, nuestro − USNO)',
    '',
    '| Lugar | Salidas n | máx | media | Puestas n | máx | media | Tránsitos n | máx | media | Fuera de tolerancia | Sin par (nuestros / USNO) |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of results) {
    lines.push(`| ${r.c.name} | ${r.rise.n} | ${fmt(r.rise.maxAbs)} | ${fmt(r.rise.meanAbs)} | ${r.set.n} | ${fmt(r.set.maxAbs)} | ${fmt(r.set.meanAbs)} | ${r.transit.n} | ${fmt(r.transit.maxAbs)} | ${fmt(r.transit.meanAbs)} | ${r.timeFailures.length} | ${r.unmatchedOurs.length} / ${r.unmatchedReference.length} |`);
  }
  lines.push('', '## Posición vs JPL Horizons', '',
    '| Lugar | Eventos | Acimut máx (°) | Acimut media (°) | Elevación aparente en el evento (°) | Iluminación máx (pp) | Distancia máx (km) |',
    '|---|---|---|---|---|---|---|');
  for (const r of results) {
    lines.push(`| ${r.c.name} | ${r.azimuth.n} | ${fmt(r.azimuth.maxAbs, 3)} | ${fmt(r.azimuth.meanAbs, 3)} | ${fmt(r.altitudeAtEvent.min, 3)} a ${fmt(r.altitudeAtEvent.max, 3)} | ${fmt(r.illumination.maxAbs, 3)} | ${fmt(r.distance.maxAbs, 1)} |`);
  }
  lines.push('', `## Horizonte elevado (${RAISED_HORIZON_DEG}°) vs JPL Horizons`, '',
    `En la "salida visible" calculada para un horizonte de ${RAISED_HORIZON_DEG}°, el borde superior debe estar a ${RAISED_HORIZON_DEG}° de altura aparente: la elevación del centro según Horizons tiene que ser ${RAISED_HORIZON_DEG}° − semidiámetro. Tolerancia ±${TOLERANCE_HORIZON_DEG}°.`, '',
    '| Lugar | n | Diferencia máx (°) | Diferencia media (°) |', '|---|---|---|---|');
  for (const r of results) {
    lines.push(`| ${r.c.name} | ${r.raisedHorizon.n} | ${fmt(r.raisedHorizon.maxAbs, 4)} | ${fmt(r.raisedHorizon.meanAbs, 4)} |`);
  }
  lines.push('', '## Días sin salida o sin puesta', '');
  for (const r of results) {
    if (r.noRiseDays.length || r.noSetDays.length) {
      lines.push(`- **${r.c.name}**: sin salida ${r.noRiseDays.join(', ') || '—'}; sin puesta ${r.noSetDays.join(', ') || '—'}.`);
    }
  }
  const anomalies = results.flatMap((r) => [
    ...r.timeFailures.map((m) => `- ${r.c.name} ${m.day} ${m.phen}: ${fmt(m.diffMin)} min`),
    ...r.unmatchedOurs.map((e) => `- ${r.c.name} ${e.day} ${e.phen} ${e.date.toISOString()}: sin par en USNO`),
    ...r.unmatchedReference.map((e) => `- ${r.c.name} ${e.phen} ${e.date.toISOString()}: USNO lo tiene y nosotros no`),
    ...r.azFailures.map((e) => `- ${r.c.name} ${e.day} ${e.phen}: acimut ${fmt(e.azDiff, 3)}°`),
    ...r.raisedHorizonFailures.map((e) => `- ${r.c.name} ${e.day} horizonte ${RAISED_HORIZON_DEG}°: ${fmt(e.diff, 4)}°`),
  ]);
  lines.push('', '## Anomalías', '', ...(anomalies.length ? anomalies : ['Ninguna.']), '');
  return lines.join('\n');
}

const results = [];
for (const c of CASES) {
  process.stdout.write(`${c.name}... `);
  results.push(await validateCase(c));
  console.log('ok');
}
const report = renderReport(results);
await writeFile(REPORT_PATH, report);
console.log(`\n${report}`);
const failed = results.some((r) => r.timeFailures.length || r.azFailures.length || r.raisedHorizonFailures.length || r.unmatchedOurs.length || r.unmatchedReference.length);
process.exitCode = failed ? 1 : 0;
