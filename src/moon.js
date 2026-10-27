// Approximate maria on the near side, unit disk, north up and lunar east to the right
// as seen from the northern hemisphere: [cx, cy, rx, ry, rotationDeg].
const MARIA = [
  [-0.56, -0.02, 0.28, 0.52, 12],   // Oceanus Procellarum
  [-0.26, -0.44, 0.27, 0.21, -10],  // Mare Imbrium
  [0.17, -0.37, 0.16, 0.15, 0],     // Mare Serenitatis
  [0.36, -0.08, 0.21, 0.15, 20],    // Mare Tranquillitatis
  [0.72, -0.30, 0.10, 0.12, 0],     // Mare Crisium
  [0.60, 0.16, 0.11, 0.18, -15],    // Mare Fecunditatis
  [0.38, 0.31, 0.08, 0.09, 0],      // Mare Nectaris
  [-0.18, 0.36, 0.19, 0.14, 10],    // Mare Nubium
  [-0.50, 0.33, 0.09, 0.09, 0],     // Mare Humorum
  [0.02, -0.70, 0.30, 0.05, 0],     // Mare Frigoris
  [0.02, -0.02, 0.08, 0.07, 0],     // Sinus Medii
];
const CRATERS = [
  [-0.12, 0.70, 0.05],  // Tycho
  [-0.30, -0.13, 0.04], // Copernicus
  [-0.62, -0.20, 0.03], // Kepler
  [0.20, 0.62, 0.04],
  [0.45, 0.55, 0.03],
  [-0.40, 0.62, 0.035],
];

let nextId = 0;

function mariaGroup(fill, opacity, blurId) {
  const ellipses = MARIA.map(([cx, cy, rx, ry, rot]) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})"/>`).join('');
  return `<g fill="${fill}" opacity="${opacity}"${blurId ? ` filter="url(#${blurId})"` : ''}>${ellipses}</g>`;
}

function cratersGroup() {
  return CRATERS.map(([cx, cy, r]) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fffaf0" opacity=".55"/><circle cx="${cx + r * 0.25}" cy="${cy + r * 0.25}" r="${r * 0.6}" fill="#b8ad93" opacity=".5"/>`).join('');
}

// The lit limb faces the Sun: on the right for a waxing Moon seen from the northern
// hemisphere. From the southern hemisphere the whole disk appears rotated 180°.
export function moonSvg({ fraction, waxing, southern, size, label }) {
  const id = `moon${nextId++}`;
  const r = size / 2 - 1;
  const c = size / 2;
  const detailed = size >= 60;
  const litOnRight = waxing !== southern;
  const rx = r * Math.abs(1 - 2 * fraction);
  const sweep = fraction > 0.5 ? 1 : 0;
  const litShape = fraction >= 0.995
    ? `<circle cx="${c}" cy="${c}" r="${r}"/>`
    : `<path transform="translate(${c} ${c}) scale(${litOnRight ? 1 : -1} 1)" d="M0 ${-r} A${r} ${r} 0 0 1 0 ${r} A${rx.toFixed(2)} ${r} 0 0 ${sweep} 0 ${-r}Z"/>`;
  const surface = `transform="translate(${c} ${c}) scale(${r}) rotate(${southern ? 180 : 0})"`;
  const blurId = detailed ? `${id}-blur` : null;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label ?? ''}">
    <defs>
      <radialGradient id="${id}-lit" cx="45%" cy="40%" r="65%">
        <stop offset="0" stop-color="#fbf5e4"/><stop offset=".75" stop-color="#ece2c6"/><stop offset="1" stop-color="#cdbf9f"/>
      </radialGradient>
      <radialGradient id="${id}-dark" cx="50%" cy="50%" r="55%">
        <stop offset="0" stop-color="#2c3456"/><stop offset="1" stop-color="#1f2643"/>
      </radialGradient>
      <clipPath id="${id}-clip">${litShape}</clipPath>
      ${blurId ? `<filter id="${blurId}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".04"/></filter>` : ''}
    </defs>
    <circle cx="${c}" cy="${c}" r="${r}" fill="url(#${id}-dark)"/>
    <g ${surface}>${mariaGroup('#151a30', 0.35, blurId)}</g>
    ${fraction > 0.005 ? `<g clip-path="url(#${id}-clip)">
      <circle cx="${c}" cy="${c}" r="${r}" fill="url(#${id}-lit)"/>
      <g ${surface}>${mariaGroup('#b3a98f', detailed ? 0.45 : 0.4, blurId)}${detailed ? cratersGroup() : ''}</g>
    </g>` : ''}
  </svg>`;
}
