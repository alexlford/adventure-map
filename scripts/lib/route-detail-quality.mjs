export const QUALITY_ORDER = [
  'full-source',
  'reviewed-source',
  'rdp-3m',
  'story-detail',
  'catalog-detail',
  'backfill',
  'activity-overview',
];

export const SOURCE_BACKED_FLOOR_QUALITIES = new Set(['full-source', 'reviewed-source', 'rdp-3m']);

const rankByQuality = new Map(QUALITY_ORDER.map((quality, index) => [quality, index]));

export function qualityRank(quality) {
  return rankByQuality.has(quality) ? rankByQuality.get(quality) : Number.POSITIVE_INFINITY;
}

export function auditQualityFloor({ indexRecords = {}, publicRecordIds = new Set(), floorRecords = {} }) {
  const problems = [];
  const violations = [];

  for (const [recordId, minimumQuality] of Object.entries(floorRecords)) {
    if (!rankByQuality.has(minimumQuality)) {
      problems.push(`${recordId}: quality floor uses unknown quality ${minimumQuality}`);
      violations.push({ recordId, minimumQuality, currentQuality: null, reason: 'unknown-floor-quality' });
      continue;
    }

    if (!publicRecordIds.has(recordId)) {
      problems.push(`${recordId}: quality floor record is no longer public`);
      violations.push({ recordId, minimumQuality, currentQuality: null, reason: 'not-public' });
      continue;
    }

    const current = indexRecords[recordId];
    if (!current) {
      problems.push(`${recordId}: quality floor record is missing from route detail index`);
      violations.push({ recordId, minimumQuality, currentQuality: null, reason: 'unindexed' });
      continue;
    }

    if (!rankByQuality.has(current.quality)) {
      problems.push(`${recordId}: current route detail uses unknown quality ${current.quality}`);
      violations.push({ recordId, minimumQuality, currentQuality: current.quality || null, reason: 'unknown-current-quality' });
      continue;
    }

    if (qualityRank(current.quality) > qualityRank(minimumQuality)) {
      problems.push(`${recordId}: route detail quality regressed from floor ${minimumQuality} to ${current.quality}`);
      violations.push({ recordId, minimumQuality, currentQuality: current.quality, reason: 'quality-regression' });
    }
  }

  return { problems, violations };
}

export function buildMonotonicQualityFloor(indexRecords = {}, existingFloorRecords = {}) {
  const next = { ...existingFloorRecords };

  for (const [recordId, entry] of Object.entries(indexRecords)) {
    const currentQuality = entry?.quality;
    if (!SOURCE_BACKED_FLOOR_QUALITIES.has(currentQuality)) continue;

    const existingQuality = next[recordId];
    if (!existingQuality || qualityRank(currentQuality) < qualityRank(existingQuality)) {
      next[recordId] = currentQuality;
    }
  }

  return Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
}
