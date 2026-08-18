import fs from 'node:fs';

const catalogPath = 'data/route-catalog.json';
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const files = [
  'data/strava-route-full-resolution-abbott-chicago-5k-2021.json',
  'data/strava-route-full-resolution-baltimore-5k-2018.json',
  'data/strava-route-full-resolution-baltimore-shamrock-5k-2020-deferred-virtual.json',
  'data/strava-route-full-resolution-beerfit-kansas-city-5k-2016.json',
  'data/strava-route-full-resolution-colderbolder-2022.json',
  'data/strava-route-full-resolution-colfax-5k-2026.json'
];
for (const file of files) {
  if (!catalog.polylineFiles.includes(file)) catalog.polylineFiles.push(file);
}
catalog.updatedOn = '2026-08-18';
fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
