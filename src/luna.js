import * as Astronomy from 'astronomy-engine';
import geomagnetism from 'geomagnetism';

const { Body } = Astronomy;

const MOON_RADIUS_KM = 1737.4;
const MS_PER_DAY = 86400000;
const SYNODIC_MONTH_DAYS = 29.530588;
const SUN_UPPER_LIMB_AT_HORIZON_DEG = -0.833;

// Heuristic, to be calibrated in the field. score = fraction × timing, where timing is
// an asymmetric Gaussian on the Sun's altitude at visible moonrise: daylight kills
// contrast fast, darkness only makes it later and less golden.
export const DEFAULT_CRITERIA = {
  timing: { peakSunAltDeg: 0, sigmaDaylightDeg: 8, sigmaDarkDeg: 15 },
  recommendedMinScore: 0.6,
  notObservable: { maxFractionInDaylight: 0.35, minFraction: 0.03 },
};

export const TRAJECTORY = { stepMinutes: 10, durationMinutes: 90 };

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

export function cardinal(azimuthDeg) {
  return CARDINALS[Math.round(normalizeDeg(azimuthDeg) / 45) % 8];
}

function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

export function tzOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const wallClockAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'),
    get('hour'), get('minute'), get('second'));
  return Math.round((wallClockAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

export function localMidnight(ymd, timeZone) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const firstTry = guess - tzOffsetMinutes(new Date(guess), timeZone) * 60000;
  return new Date(guess - tzOffsetMinutes(new Date(firstTry), timeZone) * 60000);
}

export function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function formatLocal(date, timeZone) {
  if (!date) return null;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function magneticDeclinationDeg(lat, lon, date) {
  return geomagnetism.model(date, { allowOutOfBoundsModel: true }).point([lat, lon]).decl;
}

function apparentHorizontal(body, date, observer) {
  const eq = Astronomy.Equator(body, date, observer, true, true);
  const hor = Astronomy.Horizon(date, observer, eq.ra, eq.dec, 'normal');
  return { azimuth: hor.azimuth, altitude: hor.altitude, distAu: eq.dist };
}

function moonPosition(date, observer, declinationDeg) {
  const { azimuth, altitude, distAu } = apparentHorizontal(Body.Moon, date, observer);
  const topocentricKm = distAu * Astronomy.KM_PER_AU;
  return {
    azimuthTrue: azimuth,
    azimuthMagnetic: normalizeDeg(azimuth - declinationDeg),
    cardinal: cardinal(azimuth),
    altitude,
    topocentricKm,
    angularDiameterDeg: 2 * Math.asin(MOON_RADIUS_KM / topocentricKm) * 180 / Math.PI,
  };
}

function firstBefore(searchResult, end) {
  if (!searchResult || searchResult.date >= end) return null;
  return searchResult.date;
}

// Visible rise over a raised horizon h: upper limb's apparent altitude = h.
// SearchAltitude works on the unrefracted center, so h is converted:
// apparent center = h - semidiameter; geometric = apparent + InverseRefraction.
function searchRiseOverHorizon(observer, start, end, horizonDeg) {
  const startPos = apparentHorizontal(Body.Moon, start, observer);
  const semidiameterDeg = Math.asin(MOON_RADIUS_KM / (startPos.distAu * Astronomy.KM_PER_AU)) * 180 / Math.PI;
  const apparentCenter = horizonDeg - semidiameterDeg;
  const geometricCenter = apparentCenter + Astronomy.InverseRefraction('normal', apparentCenter);
  const limitDays = (end - start) / MS_PER_DAY;
  return Astronomy.SearchAltitude(Body.Moon, observer, +1, start, limitDays, geometricCenter);
}

export function phaseName(elongationDeg) {
  const halfWindow = 360 / SYNODIC_MONTH_DAYS;
  const named = [[0, 'Luna nueva'], [90, 'Cuarto creciente'], [180, 'Luna llena'], [270, 'Cuarto menguante'], [360, 'Luna nueva']];
  for (const [center, name] of named) {
    if (Math.abs(elongationDeg - center) <= halfWindow) return name;
  }
  if (elongationDeg < 90) return 'Creciente';
  if (elongationDeg < 180) return 'Gibosa creciente';
  if (elongationDeg < 270) return 'Gibosa menguante';
  return 'Menguante';
}

export function skyCondition(sunAltitudeDeg) {
  if (sunAltitudeDeg > SUN_UPPER_LIMB_AT_HORIZON_DEG) return 'día';
  if (sunAltitudeDeg > -6) return 'crepúsculo civil';
  if (sunAltitudeDeg > -12) return 'crepúsculo náutico';
  if (sunAltitudeDeg > -18) return 'crepúsculo astronómico';
  return 'noche';
}

function sunGeometricAltitude(date, observer) {
  const eq = Astronomy.Equator(Body.Sun, date, observer, true, true);
  return Astronomy.Horizon(date, observer, eq.ra, eq.dec).altitude;
}

export function score(fraction, sunAltitudeDeg, criteria = DEFAULT_CRITERIA) {
  const { peakSunAltDeg, sigmaDaylightDeg, sigmaDarkDeg } = criteria.timing;
  const offset = sunAltitudeDeg - peakSunAltDeg;
  const sigma = offset > 0 ? sigmaDaylightDeg : sigmaDarkDeg;
  return fraction * Math.exp(-(offset ** 2) / (2 * sigma ** 2));
}

export function rating(fraction, sunAltitudeDeg, criteria = DEFAULT_CRITERIA) {
  const { notObservable: no } = criteria;
  if (fraction < no.minFraction) return 'no observable';
  if (sunAltitudeDeg > SUN_UPPER_LIMB_AT_HORIZON_DEG && fraction < no.maxFractionInDaylight) return 'no observable';
  if (score(fraction, sunAltitudeDeg, criteria) >= criteria.recommendedMinScore) return 'recomendado';
  return 'normal';
}

function trajectory(from, observer, declinationDeg, { stepMinutes, durationMinutes } = TRAJECTORY) {
  const points = [];
  for (let minutes = 0; minutes <= durationMinutes; minutes += stepMinutes) {
    const date = new Date(from.getTime() + minutes * 60000);
    const pos = moonPosition(date, observer, declinationDeg);
    points.push({ minutesAfterRise: minutes, date, ...pos });
  }
  return points;
}

export function luna(lat, lon, timeZone, ymd, horizonDeg = 0, options = {}) {
  const criteria = options.criteria ?? DEFAULT_CRITERIA;
  const elevationM = options.elevationM ?? 0;
  const observer = new Astronomy.Observer(lat, lon, elevationM);
  const start = localMidnight(ymd, timeZone);
  const end = localMidnight(addDaysYmd(ymd, 1), timeZone);
  const limitDays = (end - start) / MS_PER_DAY;
  const declinationDeg = options.declinationDeg ?? magneticDeclinationDeg(lat, lon, start);

  const rise = firstBefore(Astronomy.SearchRiseSet(Body.Moon, observer, +1, start, limitDays), end);
  const set = firstBefore(Astronomy.SearchRiseSet(Body.Moon, observer, -1, start, limitDays), end);
  const transitEvent = Astronomy.SearchHourAngle(Body.Moon, observer, 0, start, +1);
  const transit = transitEvent.time.date < end ? transitEvent.time.date : null;

  const visibleRise = !rise ? null
    : horizonDeg === 0 ? rise
    : searchRiseOverHorizon(observer, rise, new Date(rise.getTime() + MS_PER_DAY / 2), horizonDeg)?.date ?? null;

  const reference = visibleRise ?? rise ?? new Date((start.getTime() + end.getTime()) / 2);
  const illumination = Astronomy.Illumination(Body.Moon, reference);
  const elongationDeg = Astronomy.MoonPhase(reference);
  const previousNewMoon = Astronomy.SearchMoonPhase(0, reference, -SYNODIC_MONTH_DAYS - 1);
  const sunset = firstBefore(Astronomy.SearchRiseSet(Body.Sun, observer, -1, start, limitDays), end);
  const sunAltitudeAtRise = visibleRise ? sunGeometricAltitude(visibleRise, observer) : null;

  return {
    date: ymd,
    timeZone,
    location: { lat, lon, elevationM },
    horizonDeg,
    magneticDeclinationDeg: declinationDeg,
    noRise: !rise,
    noSet: !set,
    rise: rise && { date: rise, local: formatLocal(rise, timeZone), ...moonPosition(rise, observer, declinationDeg) },
    visibleRise: visibleRise && { date: visibleRise, local: formatLocal(visibleRise, timeZone), ...moonPosition(visibleRise, observer, declinationDeg) },
    set: set && { date: set, local: formatLocal(set, timeZone), ...moonPosition(set, observer, declinationDeg) },
    transit: transit && { date: transit, local: formatLocal(transit, timeZone), ...moonPosition(transit, observer, declinationDeg) },
    trajectory: visibleRise ? trajectory(visibleRise, observer, declinationDeg) : [],
    phase: {
      referenceDate: reference,
      fraction: illumination.phase_fraction,
      elongationDeg,
      name: phaseName(elongationDeg),
      ageDays: previousNewMoon ? (reference - previousNewMoon.date) / MS_PER_DAY : null,
      geocentricKm: illumination.geo_dist * Astronomy.KM_PER_AU,
    },
    sun: {
      set: sunset,
      setLocal: formatLocal(sunset, timeZone),
      altitudeAtVisibleRiseDeg: sunAltitudeAtRise,
      skyAtVisibleRise: sunAltitudeAtRise === null ? null : skyCondition(sunAltitudeAtRise),
    },
    score: visibleRise ? score(illumination.phase_fraction, sunAltitudeAtRise, criteria) : null,
    rating: visibleRise ? rating(illumination.phase_fraction, sunAltitudeAtRise, criteria) : null,
  };
}

export function lunaRange(lat, lon, timeZone, startYmd, days, horizonDeg = 0, options = {}) {
  return Array.from({ length: days }, (_, i) => luna(lat, lon, timeZone, addDaysYmd(startYmd, i), horizonDeg, options));
}
