import fs from 'node:fs';

const catalogPath = 'data/route-catalog.json';
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const files = [
  'data/strava-route-full-resolution-colderbolder-2025.json',
  'data/strava-route-full-resolution-rocky-mountain-5k-2025.json',
  'data/strava-route-full-resolution-colderbolder-2024.json',
  'data/strava-route-full-resolution-royal-gorge-groove-5k-2024.json',
  'data/strava-route-full-resolution-super-bowl-5k-2022.json',
  'data/strava-route-full-resolution-polar-bear-5k-2022.json'
];
for (const file of files) {
  if (!catalog.polylineFiles.includes(file)) catalog.polylineFiles.push(file);
}
catalog.updatedOn = '2026-08-18';
fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
