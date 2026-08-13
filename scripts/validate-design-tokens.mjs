import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

const tokens = {
  mtb: '#2f7d4a',
  nordic: '#1779a8',
  'road-races': '#d97706',
  'trail-races': '#b45309',
  skiing: '#16a6c9',
  summits: '#16836d',
  adventures: '#8b5cf6',
  mixed: '#59636d'
};

const errors = [];
const theme = await read('adventure-theme.css');

for (const [key, value] of Object.entries(tokens)) {
  if (!theme.includes(`--activity-${key}: ${value};`)) {
    errors.push(`adventure-theme.css: missing canonical --activity-${key}: ${value}`);
  }
}

const styles = await read('styles.css');
const section = await read('section.css');
const leaflet = await read('leaflet-mobile-fix.js');
const app = await read('app.js');
const expansion = await read('expansion.js');
const ski = await read('ski-map.js');
const enhancements = await read('map-enhancements.js');

for (const [path, source] of [['styles.css', styles], ['section.css', section]]) {
  if (!source.startsWith("@import url('adventure-theme.css');")) {
    errors.push(`${path}: must import adventure-theme.css before local declarations`);
  }
}

const sectionContracts = {
  races: '--activity-road-races',
  summits: '--activity-summits',
  skiing: '--activity-skiing',
  nordic: '--activity-nordic',
  'mountain-biking': '--activity-mtb',
  adventures: '--activity-adventures'
};
for (const [page, token] of Object.entries(sectionContracts)) {
  if (!section.includes(`body[data-page="${page}"]{--accent:var(${token})}`)) {
    errors.push(`section.css: ${page} must use ${token}`);
  }
}
if (section.includes('#2563eb')) errors.push('section.css: legacy blue MTB accent #2563eb is forbidden');

if (!leaflet.includes("getPropertyValue(`--activity-${key}`)")) {
  errors.push('leaflet-mobile-fix.js: map theme must read CSS activity tokens');
}
for (const key of Object.keys(tokens)) {
  if (!leaflet.includes(`'${key}'`) && !leaflet.includes(`\"${key}\"`)) {
    errors.push(`leaflet-mobile-fix.js: colorKeys must include ${key}`);
  }
}

if (!app.includes('const THEME_COLORS=window.AdventureMapTheme?.colors||{};')) {
  errors.push('app.js: map core must consume AdventureMapTheme colors');
}
if (!app.includes('const categoryColor=key=>THEME_COLORS[key]')) {
  errors.push('app.js: map core must resolve categories through categoryColor');
}
if (!expansion.includes('const colors = window.AdventureMapTheme?.colors || {};')) {
  errors.push('expansion.js: supplemental categories must consume AdventureMapTheme colors');
}
if (!ski.includes('window.AdventureMapTheme?.colors?.skiing')) {
  errors.push('ski-map.js: ski records must consume AdventureMapTheme colors');
}
if (!enhancements.includes('theme.colors.mixed')) {
  errors.push('map-enhancements.js: mixed cluster legend must consume the shared mixed token');
}

// Activity-specific colors must never be hard-coded in JavaScript. The neutral
// mixed color may remain as a defensive fallback if the token stylesheet fails
// to load, but normal rendering still resolves it from the shared theme first.
const canonicalActivityHexes = Object.entries(tokens)
  .filter(([key]) => key !== 'mixed')
  .map(([, value]) => value.toLowerCase());
for (const [path, source] of [
  ['app.js', app],
  ['expansion.js', expansion],
  ['ski-map.js', ski],
  ['map-enhancements.js', enhancements]
]) {
  const lower = source.toLowerCase();
  for (const value of canonicalActivityHexes) {
    if (lower.includes(value)) errors.push(`${path}: semantic activity color ${value} must come from adventure-theme.css`);
  }
}

for (const legacy of ['#2f6f8f','#b76b26','#8b5a31','#2f8ca6','#357662','#715a8d','#2563eb']) {
  if (leaflet.toLowerCase().includes(legacy)) {
    errors.push(`leaflet-mobile-fix.js: legacy duplicate palette color ${legacy} is forbidden`);
  }
}

if (errors.length) {
  console.error('Design token validation failed:');
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Design token validation passed for ${Object.keys(tokens).length} canonical activity colors.`);
