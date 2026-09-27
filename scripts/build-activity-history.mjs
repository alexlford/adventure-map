import fs from 'node:fs/promises';

const outputPath = 'data/activity-history.json';
const checkOnly = process.argv.includes('--check');
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const yearOf = value => Number(String(value || '').slice(0, 4)) || null;
const sortedCounts = map => [...map.entries()].map(([name, count]) => ({ name, count })).sort((a,b)=>b.count-a.count||String(a.name).localeCompare(String(b.name)));
const countYears = dates => {
  const map = new Map();
  for (const date of dates) {
    const year = yearOf(date);
    if (year) map.set(year, (map.get(year) || 0) + 1);
  }
  return [...map.entries()].map(([year,count])=>({year,count})).sort((a,b)=>a.year-b.year);
};
const rangeFor = dates => {
  const years = dates.map(yearOf).filter(Boolean).sort((a,b)=>a-b);
  return { firstYear: years[0] || null, lastYear: years.at(-1) || null, activeYearCount: new Set(years).size };
};

const [publicPayload, skiing, nordic, mtb] = await Promise.all([
  readJson('data/public-records.json'),
  readJson('data/skiing.json'),
  readJson('data/nordic.json'),
  readJson('data/mountain-biking.json')
]);
const records = publicPayload.records || [];

const summitRecords = records.filter(record => record.kind === 'summit');
const summitDates = summitRecords.map(record => record.completionDate || record.date || record.startDate).filter(Boolean);
const summitRegions = new Map();
for (const record of summitRecords) {
  const region = record.region || record.locationInfo?.region || 'Unspecified';
  summitRegions.set(region, (summitRegions.get(region) || 0) + 1);
}
const rankedSummits = summitRecords.slice().sort((a,b)=>(b.elevationFt||0)-(a.elevationFt||0)||String(a.name).localeCompare(String(b.name)));
const summits = {
  summary: {
    count: summitRecords.length,
    fourteeners: summitRecords.filter(record => Number(record.elevationFt) >= 14000).length,
    routeCount: summitRecords.filter(record => record.routeInfo?.status === 'gps' || record.routeStatus === 'gps').length,
    regionCount: summitRegions.size,
    ...rangeFor(summitDates),
    highest: rankedSummits[0] ? { id: rankedSummits[0].id, slug: rankedSummits[0].slug || null, name: rankedSummits[0].name, elevationFt: rankedSummits[0].elevationFt || null } : null
  },
  yearly: countYears(summitDates),
  regions: sortedCounts(summitRegions),
  highest: rankedSummits.slice(0, 5).map(record => ({ id: record.id, slug: record.slug || null, name: record.name, elevationFt: record.elevationFt || null, year: yearOf(record.completionDate || record.date || record.startDate) }))
};

const skiDates = (skiing.seasons || []).flatMap(season => Array.from({ length: Number(season.days) || 0 }, () => season.season));
const skiRegions = new Map();
for (const resort of skiing.resorts || []) skiRegions.set(resort.region || 'Unspecified', (skiRegions.get(resort.region || 'Unspecified') || 0) + 1);
const skiingHistory = {
  summary: {
    recordedDays: skiing.summary?.recordedDays || 0,
    recordedRuns: skiing.summary?.recordedRuns || 0,
    verticalFt: skiing.summary?.verticalFt || 0,
    resortCount: skiing.summary?.resortCount || (skiing.resorts || []).length,
    tripCount: (skiing.trips || []).length,
    firstSeason: skiing.summary?.firstSeason || null,
    latestSeason: skiing.summary?.latestSeason || null,
    regionCount: skiRegions.size
  },
  seasons: (skiing.seasons || []).map(season => ({ season: season.season, days: season.days || 0, verticalFt: Number.isFinite(season.verticalFtApprox) ? season.verticalFtApprox : null })),
  regions: sortedCounts(skiRegions),
  resorts: (skiing.resorts || []).slice().sort((a,b)=>(b.days||0)-(a.days||0)||a.name.localeCompare(b.name)).slice(0, 10).map(resort => ({ name: resort.name, days: resort.days || 0, region: resort.region || null })),
  trips: (skiing.trips || []).map(trip => ({ id: trip.id, name: trip.name, season: trip.season, runs: trip.runs || 0, verticalFt: trip.verticalFt || 0, dates: trip.dates || [], location: trip.location || null }))
};

const nordicDates = (nordic.locations || []).flatMap(location => location.dates || []);
const nordicRecords = records.filter(record => record.discipline === 'nordic' && (record.kind === 'race' || record.kind === 'event'));
const nordicRegions = new Map();
for (const location of nordic.locations || []) {
  const region = String(location.location || '').split(',').at(-1)?.trim() || 'Unspecified';
  nordicRegions.set(region, (nordicRegions.get(region) || 0) + 1);
}
const nordicHistory = {
  summary: {
    locationCount: (nordic.locations || []).length,
    recordedDays: new Set(nordicDates).size,
    raceCount: nordicRecords.filter(record => record.kind === 'race').length,
    eventCount: nordicRecords.filter(record => record.kind === 'event').length,
    memorableCount: (nordic.epicDays || []).length,
    ...rangeFor(nordicDates)
  },
  yearly: countYears(nordicDates),
  regions: sortedCounts(nordicRegions),
  recurringLocations: (nordic.locations || []).slice().sort((a,b)=>(b.recordedDays||0)-(a.recordedDays||0)||a.name.localeCompare(b.name)).slice(0, 8).map(location => ({ name: location.name, recordedDays: location.recordedDays || 0, dates: location.dates || [] })),
  memorable: (nordic.epicDays || []).map(day => ({ id: day.id, name: day.name, date: day.date, endDate: day.endDate || null, distanceMi: day.distanceMi || null, location: day.location || null }))
};

const mtbDates = (mtb.activities || []).map(activity => activity.date).filter(Boolean);
const mtbRaces = records.filter(record => record.kind === 'race' && record.discipline === 'mountain-bike');
const styles = new Map();
for (const activity of mtb.activities || []) styles.set(activity.ridingStyle || 'unspecified', (styles.get(activity.ridingStyle || 'unspecified') || 0) + 1);
const mtbRegions = new Map();
for (const location of mtb.locations || []) {
  const region = String(location.location || '').split(',').at(-1)?.trim() || 'Unspecified';
  mtbRegions.set(region, (mtbRegions.get(region) || 0) + 1);
}
const mountainBiking = {
  summary: {
    locationCount: (mtb.locations || []).length,
    recordedDays: (mtb.activities || []).length,
    pedalDays: (mtb.activities || []).filter(activity => ['pedal','mixed'].includes(activity.ridingStyle)).length,
    downhillDays: (mtb.activities || []).filter(activity => ['lift-served','mixed'].includes(activity.ridingStyle)).length,
    raceCount: mtbRaces.length,
    memorableCount: (mtb.epicRides || []).length,
    ...rangeFor(mtbDates)
  },
  yearly: countYears(mtbDates),
  ridingStyles: sortedCounts(styles),
  regions: sortedCounts(mtbRegions),
  recurringLocations: (mtb.locations || []).slice().sort((a,b)=>(b.recordedDays||0)-(a.recordedDays||0)||a.name.localeCompare(b.name)).slice(0, 8).map(location => ({ name: location.name, recordedDays: location.recordedDays || 0, dates: location.dates || [] })),
  memorable: (mtb.epicRides || []).map(ride => ({ id: ride.id, name: ride.name, date: ride.date, endDate: ride.endDate || null, distanceMi: ride.distanceMi || null, ridingStyle: ride.ridingStyle || null, location: ride.location || null }))
};

const payload = {
  schemaVersion: 1,
  generatedFromRecordCount: records.length,
  chapters: { summits, skiing: skiingHistory, nordic: nordicHistory, mountainBiking }
};
const serialized = `${JSON.stringify(payload, null, 2)}\n`;
if (checkOnly) {
  const current = await fs.readFile(outputPath, 'utf8').catch(() => '');
  if (current !== serialized) {
    console.error(`${outputPath} is stale. Run npm run build:activity-history and commit the result.`);
    process.exit(1);
  }
  console.log(`Activity history is current for summits, alpine skiing, Nordic skiing, and mountain biking.`);
} else {
  await fs.writeFile(outputPath, serialized);
  console.log(`Wrote ${outputPath}.`);
}
