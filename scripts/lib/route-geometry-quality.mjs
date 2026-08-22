export const GEOMETRY_CLASSES = Object.freeze([
  'recorded-clean',
  'recorded-filtered',
  'recorded-corrected',
  'mixed',
  'reconstructed',
]);

export const EVIDENCE_TYPES = Object.freeze(['recorded', 'inferred']);

export const GEOMETRY_CLASS_SET = new Set(GEOMETRY_CLASSES);
export const EVIDENCE_TYPE_SET = new Set(EVIDENCE_TYPES);

const sourceRdpTolerance = value => {
  const match = String(value || '').toLowerCase().match(/(?:source-)?rdp[-_]?([0-9]+(?:\.[0-9]+)?)m/);
  return match ? Number(match[1]) : null;
};

export function routeSampling(route = {}, payload = {}, filePath = '') {
  return String(route.sampling || route.density || payload.sampling || filePath || '').toLowerCase();
}

export function routeGeometryClass(route = {}, payload = {}) {
  return route.geometryClass || payload.geometryClass || null;
}

export function technicalDetailQuality({ route = {}, payload = {}, filePath = '' } = {}) {
  const sampling = routeSampling(route, payload, filePath);
  if (sampling.includes('full-source') || sampling.includes('dense-source') || String(filePath).includes('full-resolution')) {
    return 'full-source';
  }

  const tolerance = sourceRdpTolerance(sampling);
  if ((Number.isFinite(tolerance) && tolerance <= 3) || sampling.includes('rdp3') || sampling.includes('rdp-3m')) {
    return 'rdp-3m';
  }

  if (String(filePath).includes('story-route-details')) return 'story-detail';
  if (String(filePath).includes('strava-route-backfill')) return 'backfill';
  if (String(filePath).includes('activity-route-polylines')) return 'activity-overview';
  return 'catalog-detail';
}

const fallbackScore = quality => ({
  'full-source': 500,
  'rdp-3m': 400,
  'story-detail': 350,
  'catalog-detail': 200,
  backfill: 250,
  'activity-overview': 150,
}[quality] ?? 0);

export function publicationSelectionScore({ route = {}, payload = {}, filePath = '' } = {}) {
  // A reviewed publication selection is deliberately stronger than point density.
  // This is the key separation between fidelity and processing: a reviewed,
  // filtered route can beat a denser but demonstrably noisy raw source.
  if (route.publicationSelected === true) return 1000;
  return fallbackScore(technicalDetailQuality({ route, payload, filePath }));
}

export function routeSegments(route = {}) {
  if (!Array.isArray(route.segments) || !route.segments.length) return null;
  return route.segments.map((segment, index) => ({
    ...segment,
    evidence: segment.evidence || 'recorded',
    featureId: index === 0 ? route.id : `${route.id}::segment-${index + 1}`,
    routeFeatureId: route.id,
  }));
}

export function validateReviewedRoute(route = {}, payload = {}) {
  const errors = [];
  const geometryClass = routeGeometryClass(route, payload);
  const segments = routeSegments(route);

  if (route.publicationSelected === true && !geometryClass) {
    errors.push(`${route.id || '(missing id)'}: publicationSelected requires geometryClass`);
  }
  if (geometryClass && !GEOMETRY_CLASS_SET.has(geometryClass)) {
    errors.push(`${route.id || '(missing id)'}: unknown geometryClass ${geometryClass}`);
  }

  if (segments) {
    if (Array.isArray(route.lines) && route.lines.length) {
      errors.push(`${route.id}: reviewed segmented route must not also define lines`);
    }
    for (const [index, segment] of segments.entries()) {
      if (typeof segment.line !== 'string' || !segment.line.length) {
        errors.push(`${route.id}: segment ${index + 1} is missing encoded line geometry`);
      }
      if (!EVIDENCE_TYPE_SET.has(segment.evidence)) {
        errors.push(`${route.id}: segment ${index + 1} uses unknown evidence ${segment.evidence}`);
      }
      if (segment.evidence === 'inferred' && !segment.confidence) {
        errors.push(`${route.id}: inferred segment ${index + 1} requires confidence`);
      }
    }

    const hasInferred = segments.some(segment => segment.evidence === 'inferred');
    const hasRecorded = segments.some(segment => segment.evidence === 'recorded');
    if (hasInferred && hasRecorded && geometryClass !== 'mixed') {
      errors.push(`${route.id}: recorded + inferred segments require geometryClass mixed`);
    }
    if (hasInferred && !hasRecorded && geometryClass !== 'reconstructed') {
      errors.push(`${route.id}: all-inferred segments require geometryClass reconstructed`);
    }
  }

  return errors;
}
