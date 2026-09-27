import fs from 'node:fs/promises';

const outputPath = 'data/race-history.json';
const checkOnly = process.argv.includes('--check');
const writeOnly = process.argv.includes('--write') || !checkOnly;

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const yearFor = record => Number(record.year || String(record.completionDate || record.date || '').slice(0, 4)) || null;
const dateFor = record => record.completionDate || record.date || (yearFor(record) ? `${yearFor(record)}-12-31` : '');
const distanceMiles = record => {
  if (Number.isFinite(record.officialDistanceMi) && record.officialDistanceMi > 0) return record.officialDistanceMi;
  if (Number.isFinite(record.distanceInfo?.mi) && record.distanceInfo.mi > 0) return record.distanceInfo.mi;
  if (Number.isFinite(record.distanceMi) && record.distanceMi > 0) return record.distanceMi;
  if (Number.isFinite(record.officialDistanceKm) && record.officialDistanceKm > 0) return record.officialDistanceKm / 1.609344;
  if (Number.isFinite(record.distanceKm) && record.distanceKm > 0) return record.distanceKm / 1.609344;
  return null;
};
const isHalf = record => /(?:half marathon|13\.1)/i.test([
  record.name,
  record.officialDistance,
  record.distance,
  record.distanceInfo?.label
].filter(Boolean).join(' '));
const resultTime = record => record.teamFinishTime || record.officialTime || record.officialGunTime || null;
const placeLabel = record => String(record.location || record.region || '').trim();
const recordLink = record => ({ id: record.id, slug: record.slug || null });

const publicPayload = await readJson('data/public-records.json');
const relationshipPayload = await readJson('data/relationships.json');
const records = publicPayload.records || [];
const byId = new Map(records.map(record => [record.id, record]));
const races = records
  .filter(record => record.kind === 'race')
  .sort((a, b) => dateFor(a).localeCompare(dateFor(b)) || a.name.localeCompare(b.name));

const years = new Map();
const disciplines = new Map();
const places = new Map();
let knownDistanceMiles = 0;
let knownDistanceCount = 0;
let officialResultCount = 0;

for (const race of races) {
  const year = yearFor(race);
  const miles = distanceMiles(race);
  const discipline = race.discipline || 'road';
  const place = placeLabel(race);

  disciplines.set(discipline, (disciplines.get(discipline) || 0) + 1);
  if (place) {
    if (!places.has(place)) places.set(place, { count: 0, years: new Set() });
    const entry = places.get(place);
    entry.count += 1;
    if (year) entry.years.add(year);
  }
  if (Number.isFinite(miles)) {
    knownDistanceMiles += miles;
    knownDistanceCount += 1;
  }
  if (resultTime(race) || race.officialPlace || race.divisionPlace || race.genderPlace || race.officialPace) officialResultCount += 1;

  if (!year) continue;
  if (!years.has(year)) years.set(year, { year, count: 0, miles: 0, knownDistanceCount: 0, marathonCount: 0, disciplines: new Map() });
  const entry = years.get(year);
  entry.count += 1;
  if (Number.isFinite(miles)) {
    entry.miles += miles;
    entry.knownDistanceCount += 1;
  }
  if (discipline === 'marathon') entry.marathonCount += 1;
  entry.disciplines.set(discipline, (entry.disciplines.get(discipline) || 0) + 1);
}

const yearly = [...years.values()].sort((a, b) => a.year - b.year).map(entry => ({
  year: entry.year,
  count: entry.count,
  miles: Number(entry.miles.toFixed(2)),
  knownDistanceCount: entry.knownDistanceCount,
  marathonCount: entry.marathonCount,
  disciplines: Object.fromEntries([...entry.disciplines.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}));

let cumulative = 0;
const yearlyCumulative = yearly.map(entry => {
  cumulative += entry.miles;
  return { ...entry, cumulativeMiles: Number(cumulative.toFixed(2)) };
});

const marathonTimeline = races
  .filter(record => record.discipline === 'marathon')
  .map(record => ({
    ...recordLink(record),
    year: yearFor(record),
    date: record.completionDate || record.date || null,
    name: record.name,
    location: record.location || null,
    time: resultTime(record),
    miles: distanceMiles(record)
  }));

const longestKnown = races
  .map(record => ({ record, miles: distanceMiles(record) }))
  .filter(item => Number.isFinite(item.miles))
  .sort((a, b) => b.miles - a.miles || dateFor(a.record).localeCompare(dateFor(b.record)))[0];

const busiestYear = [...yearly].sort((a, b) => b.count - a.count || a.year - b.year)[0] || null;
const firstYear = yearly[0]?.year || null;
const lastYear = yearly.at(-1)?.year || null;

const topPlaces = [...places.entries()]
  .map(([name, entry]) => ({ name, count: entry.count, years: [...entry.years].sort((a, b) => a - b) }))
  .sort((a, b) => b.count - a.count || b.years.length - a.years.length || a.name.localeCompare(b.name))
  .slice(0, 10);

const recurringSeries = (relationshipPayload.relationships || [])
  .filter(rel => rel.type === 'series')
  .map(rel => {
    const members = (rel.memberIds || []).map(id => byId.get(id)).filter(record => record?.kind === 'race');
    if (members.length < 2) return null;
    const memberYears = [...new Set(members.map(yearFor).filter(Boolean))].sort((a, b) => a - b);
    const storyRecord = rel.adventureId ? byId.get(rel.adventureId) : null;
    return {
      id: rel.id,
      name: rel.name,
      appearanceCount: members.length,
      years: memberYears,
      firstYear: memberYears[0] || null,
      lastYear: memberYears.at(-1) || null,
      story: storyRecord ? recordLink(storyRecord) : null
    };
  })
  .filter(Boolean)
  .sort((a, b) => b.appearanceCount - a.appearanceCount || a.name.localeCompare(b.name));

const payload = {
  schemaVersion: 1,
  generatedFromRecordCount: records.length,
  summary: {
    raceCount: races.length,
    firstYear,
    lastYear,
    activeYearCount: yearly.length,
    knownDistanceMiles: Number(knownDistanceMiles.toFixed(2)),
    knownDistanceCount,
    officialResultCount,
    marathonCount: disciplines.get('marathon') || 0,
    halfMarathonCount: races.filter(isHalf).length,
    busiestYear: busiestYear ? { year: busiestYear.year, count: busiestYear.count } : null,
    longestKnown: longestKnown ? {
      ...recordLink(longestKnown.record),
      name: longestKnown.record.name,
      year: yearFor(longestKnown.record),
      miles: Number(longestKnown.miles.toFixed(2))
    } : null
  },
  yearly: yearlyCumulative,
  disciplines: [...disciplines.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  marathonTimeline,
  topPlaces,
  recurringSeries
};

const serialized = `${JSON.stringify(payload, null, 2)}\n`;
if (checkOnly) {
  const current = await fs.readFile(outputPath, 'utf8').catch(() => '');
  if (current !== serialized) {
    console.error(`${outputPath} is stale. Run npm run build:race-history and commit the result.`);
    process.exit(1);
  }
  console.log(`Race history is current: ${races.length} races, ${yearly.length} active years, ${marathonTimeline.length} marathons.`);
} else if (writeOnly) {
  await fs.writeFile(outputPath, serialized);
  console.log(`Wrote ${outputPath}: ${races.length} races, ${yearly.length} active years, ${marathonTimeline.length} marathons.`);
}
