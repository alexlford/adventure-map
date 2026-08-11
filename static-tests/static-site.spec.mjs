import { test, expect } from '@playwright/test';

const SITE = 'https://adventures.alexlford.com';
const sections = ['map','explore','stories','timeline','races','summits','skiing','nordic','mtb'];

test('generated section routes are real static documents', async ({ request }) => {
  const home = await request.get('/');
  expect(home.status()).toBe(200);
  const homeHtml = await home.text();
  expect(homeHtml).toContain('<base href="/">');
  expect(homeHtml).toContain(`rel="canonical" href="${SITE}/"`);
  expect(homeHtml).toContain('window.ADVENTURE_PUBLIC_BUILD=true');

  for (const route of sections) {
    const response = await request.get(`/${route}/`);
    expect(response.status(), `${route} should be a generated static document`).toBe(200);
    const html = await response.text();
    expect(html).toContain('<base href="/">');
    expect(html).toContain(`rel="canonical" href="${SITE}/${route}"`);
    expect(html).toContain('window.ADVENTURE_PUBLIC_BUILD=true');
  }
});

test('generated record route has static metadata before JavaScript runs', async ({ request, page }) => {
  const recordsResponse = await request.get('/data/public-records.json');
  expect(recordsResponse.status()).toBe(200);
  const compiled = await recordsResponse.json();
  const record = compiled.records.find(item => item.id === 'chicago-marathon-2021') || compiled.records[0];
  expect(record).toBeTruthy();

  const slug = record.slug || record.id;
  const response = await request.get(`/record/${slug}/`);
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain(`<link rel="canonical" href="${SITE}/record/${slug}/">`);
  expect(html).toContain('<meta property="og:type" content="article">');
  expect(html).toContain('<meta name="description" content="');
  expect(html).toContain('window.ADVENTURE_PUBLIC_BUILD=true');

  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/record/${slug}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText(record.name);
  await expect(page.locator('.detail-route-section')).toBeVisible();
  expect(errors).toEqual([]);
});

test('deployment sitemap contains every generated record URL', async ({ request }) => {
  const [recordsResponse, sitemapResponse, robotsResponse] = await Promise.all([
    request.get('/data/public-records.json'),
    request.get('/sitemap.xml'),
    request.get('/robots.txt'),
  ]);
  expect(recordsResponse.status()).toBe(200);
  expect(sitemapResponse.status()).toBe(200);
  expect(robotsResponse.status()).toBe(200);

  const compiled = await recordsResponse.json();
  const sitemap = await sitemapResponse.text();
  const robots = await robotsResponse.text();
  const recordUrls = sitemap.match(/<loc>https:\/\/adventures\.alexlford\.com\/record\/[^<]+<\/loc>/g) || [];

  expect(recordUrls).toHaveLength(compiled.recordCount);
  expect(sitemap).not.toContain('.html</loc>');
  for (const route of sections) expect(sitemap).toContain(`<loc>${SITE}/${route}</loc>`);
  expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
});
