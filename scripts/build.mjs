import { mkdir, readFile, writeFile } from 'node:fs/promises';

const assetFiles = {
  '/': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/style.css': ['style.css', 'text/css']
};
const assets = Object.fromEntries(await Promise.all(Object.entries(assetFiles).map(async ([path, [file, type]]) => [
  path, { type: type + '; charset=utf-8', body: (await readFile('public/' + file, 'utf8')).replace(/^\uFEFF/, '') }
])));
const url = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';
const csv = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await fetch(url).then(response => {
  if (!response.ok) throw new Error('Airport directory download failed: ' + response.status);
  return response.text();
});
const fields = line => [...line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)]
  .map(match => match[1]?.replaceAll('""', '"') ?? match[2]);
const codes = Object.create(null);
const aliases = [];
for (const line of csv.split(/\r?\n/).slice(1)) {
  const [, ident, type, name, lat, lon, , , , , , , icao, iata, gps] = fields(line);
  if (!name || !lat || !lon || !['large_airport', 'medium_airport', 'small_airport'].includes(type)) continue;
  const code = [icao, gps, ident, iata].find(value => /^[A-Z0-9]{3,4}$/.test(value ?? ''));
  if (!code) continue;
  const entry = [code, name, +Number(lat).toFixed(6), +Number(lon).toFixed(6)];
  codes[code] = entry;
  if (/^[A-Z]{3}$/.test(iata ?? '')) aliases.push([iata, entry]);
}
for (const [alias, entry] of aliases) codes[alias] ??= entry;
if (!codes.LFPB || !codes.EGKB || Object.keys(codes).length < 10000) throw new Error('The airport directory is incomplete.');
const worker = await readFile('worker/index.js', 'utf8');
await mkdir('dist/server', { recursive: true });
await writeFile('dist/server/index.js', worker
  .replace('__ASSETS__', () => JSON.stringify(assets))
  .replace('__AIRPORTS__', () => JSON.stringify(codes)));
