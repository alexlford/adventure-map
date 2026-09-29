import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const errors = [];
const fail = message => errors.push(message);

const packageJson = JSON.parse(await read('package.json'));
const accessibilitySpec = await read('tests/accessibility.spec.mjs');
const interactionSpec = await read('tests/accessibility-interactions.spec.mjs');
const browserRunner = await read('scripts/run-browser-tests.mjs');
const workflow = await read('.github/workflows/validate-accessibility.yml');

const expectedScript = 'node scripts/run-browser-tests.mjs tests/accessibility.spec.mjs tests/accessibility-interactions.spec.mjs';
if (packageJson.scripts?.['test:accessibility'] !== expectedScript) {
  fail(`package.json: test:accessibility must be exactly "${expectedScript}"`);
}
if (packageJson.scripts?.['validate:accessibility-contract'] !== 'node scripts/validate-accessibility-contract.mjs') {
  fail('package.json: validate:accessibility-contract script is missing');
}
if (!packageJson.scripts?.['validate:all']?.includes('npm run validate:accessibility-contract')) {
  fail('package.json: validate:all must enforce validate:accessibility-contract');
}
if (packageJson.devDependencies?.['@axe-core/playwright'] !== '4.13.0') {
  fail('package.json: @axe-core/playwright must remain pinned at 4.13.0');
}

const representativePaths = [
  '/', '/timeline/', '/map/', '/stories/', '/races/', '/summits/',
  '/skiing/', '/nordic/', '/mtb/', '/detail.html?record=chicago-marathon-2021'
];
for (const path of representativePaths) {
  if (!accessibilitySpec.includes(`'${path}'`)) {
    fail(`tests/accessibility.spec.mjs: representative page ${path} is not covered`);
  }
}
for (const tag of ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']) {
  if (!accessibilitySpec.includes(`'${tag}'`)) {
    fail(`tests/accessibility.spec.mjs: axe tag ${tag} is missing`);
  }
}
if (!accessibilitySpec.includes("from '@axe-core/playwright'")) {
  fail('tests/accessibility.spec.mjs: axe Playwright integration is missing');
}
if (!interactionSpec.includes('primary navigation follows keyboard order and exposes visible focus')) {
  fail('tests/accessibility-interactions.spec.mjs: keyboard/focus contract is missing');
}
if (!interactionSpec.includes("getByRole('searchbox', { name: 'Search' })")) {
  fail('tests/accessibility-interactions.spec.mjs: labelled timeline-search contract is missing');
}
if (!browserRunner.includes('const requestedTests = process.argv.slice(2);')) {
  fail('scripts/run-browser-tests.mjs: focused test selection support is missing');
}

for (const required of [
  'name: Accessibility gate',
  'npm ci',
  'npm run build:publish',
  'npx playwright install --with-deps chromium',
  'npm run test:accessibility'
]) {
  if (!workflow.includes(required)) {
    fail(`.github/workflows/validate-accessibility.yml: missing "${required}"`);
  }
}

if (errors.length) {
  console.error('Accessibility contract validation failed:');
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Accessibility contract passed for ${representativePaths.length} representative page targets plus keyboard/focus coverage.`);
