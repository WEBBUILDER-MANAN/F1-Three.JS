// Convert F1 circuit GeoJSON (lon/lat centerlines) into local-meter coordinates
// for the game. World frame: x = east, z = south (so north = -z), y = up.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SRC = [
  { file: 'raw/monaco.geojson', id: 'monaco' },
  { file: 'raw/silverstone.geojson', id: 'silverstone' },
  { file: 'raw/suzuka.geojson', id: 'suzuka' },
  { file: 'raw/spa.geojson', id: 'spa' },
  { file: 'raw/monza.geojson', id: 'monza' },
  { file: 'raw/singapore.geojson', id: 'singapore' },
];

function extractLine(geo) {
  const g = geo.features[0].geometry;
  if (g.type === 'LineString') return g.coordinates;
  if (g.type === 'MultiLineString') return g.coordinates.flat();
  throw new Error('unsupported geometry ' + g.type);
}

const out = {};
for (const { file, id } of SRC) {
  const geo = JSON.parse(readFileSync(file, 'utf8'));
  let coords = extractLine(geo);
  // drop explicit closing vertex
  const a = coords[0], b = coords[coords.length - 1];
  if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) coords = coords.slice(0, -1);

  const lon0 = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const mLat = 111132, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);

  const pts = coords.map(([lon, lat]) => [
    Math.round((lon - lon0) * mLon * 100) / 100,
    Math.round(-(lat - lat0) * mLat * 100) / 100,
  ]);

  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    len += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  out[id] = { name: geo.features[0].properties.Name, length: Math.round(len), n: pts.length, pts };
  console.log(`${id}: ${pts.length} pts, length ${Math.round(len)} m`);
}

mkdirSync('src/data', { recursive: true });
writeFileSync(
  'src/data/circuits.js',
  '// Auto-generated from real F1 circuit GeoJSON (bacinger/f1-circuits). Units: meters. x=east, z=south.\n' +
  'export const CIRCUITS = ' + JSON.stringify(out) + ';\n'
);
console.log('wrote src/data/circuits.js');
