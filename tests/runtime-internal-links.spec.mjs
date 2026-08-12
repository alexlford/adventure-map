import { test, expect } from '@playwright/test';

const entryPages = [
  '/',
  '/explore/',
  '/map/',
  '/stories/',
  '/timeline/',
  '/races/',
  '/summits/',
  '/skiing/',
  '/nordic/',
  '/mtb/'
];

const chunks = (items,size) => Array.from({length:Math.ceil(items.length/size)},(_,index)=>items.slice(index*size,(index+1)*size));

test('Rendered Adventures pages do not publish broken same-origin links', async ({ page, request }) => {
  const discovered = new Map();

  for (const entry of entryPages) {
    await page.goto(entry,{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(entry === '/races/' ? 900 : 250);
    const origin = new URL(page.url()).origin;
    const links = await page.locator('a[href]').evaluateAll((anchors,baseOrigin) => anchors.map(anchor => {
      try {
        const raw = anchor.getAttribute('href') || '';
        if (!raw || raw.startsWith('#')) return null;
        const url = new URL(anchor.href);
        if (url.origin !== baseOrigin || !['http:','https:'].includes(url.protocol)) return null;
        url.hash = '';
        return {url:url.href,label:(anchor.textContent || '').trim().replace(/\s+/g,' ').slice(0,120)};
      } catch {
        return null;
      }
    }).filter(Boolean),origin);

    for (const link of links) {
      if (!discovered.has(link.url)) discovered.set(link.url,{...link,foundOn:new Set()});
      discovered.get(link.url).foundOn.add(entry);
    }
  }

  expect(discovered.size).toBeGreaterThan(20);
  const failures = [];
  for (const batch of chunks([...discovered.values()],16)) {
    const results = await Promise.all(batch.map(async link => {
      try {
        const response = await request.get(link.url,{timeout:12000});
        return response.status() >= 400 ? {...link,status:response.status()} : null;
      } catch (error) {
        return {...link,status:'request failed',error:error.message};
      }
    }));
    failures.push(...results.filter(Boolean));
  }

  expect(failures.map(failure => ({
    url:failure.url,
    status:failure.status,
    label:failure.label,
    foundOn:[...failure.foundOn],
    error:failure.error || ''
  }))).toEqual([]);
});
