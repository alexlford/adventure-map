import { test, expect } from '@playwright/test';

const chunks = (items,size) => Array.from({length:Math.ceil(items.length/size)},(_,index)=>items.slice(index*size,(index+1)*size));

test('Compiled record media has accessible text and reachable local assets', async ({ request }) => {
  const response = await request.get('/data/public-records.json');
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  const records = Array.isArray(payload.records) ? payload.records : [];
  expect(records.length).toBeGreaterThan(0);

  const missingAlt = [];
  const localAssets = new Map();
  for (const record of records) {
    for (const item of Array.isArray(record.media) ? record.media : []) {
      if (!item || (item.type && item.type !== 'image') || !item.src) continue;
      if (!String(item.alt || '').trim()) missingAlt.push({record:record.slug || record.id,src:item.src});
      try {
        const url = new URL(item.src,'https://adventures.alexlford.com/');
        if (url.origin !== 'https://adventures.alexlford.com') continue;
        const target = `${url.pathname}${url.search}`;
        if (!localAssets.has(target)) localAssets.set(target,new Set());
        localAssets.get(target).add(record.slug || record.id || record.name);
      } catch {
        missingAlt.push({record:record.slug || record.id,src:item.src,problem:'invalid media URL'});
      }
    }
  }

  expect(missingAlt).toEqual([]);

  const failures = [];
  for (const batch of chunks([...localAssets.entries()],12)) {
    const results = await Promise.all(batch.map(async ([target,recordsForAsset]) => {
      try {
        const asset = await request.get(target,{timeout:12000});
        if (asset.status() < 400) return null;
        return {target,status:asset.status(),records:[...recordsForAsset]};
      } catch (error) {
        return {target,status:'request failed',records:[...recordsForAsset],error:error.message};
      }
    }));
    failures.push(...results.filter(Boolean));
  }

  expect(failures).toEqual([]);
});
