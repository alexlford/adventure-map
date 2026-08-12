import { test, expect } from '@playwright/test';

const cleanSections=['map','explore','timeline','stories','races','summits','skiing','nordic','mtb'];

for(const route of cleanSections){
  test(`/${route} is a real static document`,async({page})=>{
    const response=await page.goto(`/${route}`,{waitUntil:'domcontentloaded'});
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Resolving this route');
  });
}

test('representative record clean URL is a real document with static metadata',async({page,request})=>{
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  const record=await page.evaluate(async()=>{
    const all=await window.AdventureSite.load();
    const item=all.find(record=>record.kind==='race'&&record.officialTime)||all[0];
    return {slug:item.slug,name:item.name};
  });
  const cleanPath=`/record/${encodeURIComponent(record.slug)}/`;
  const raw=await request.get(cleanPath);
  expect(raw.status()).toBe(200);
  const html=await raw.text();
  expect(html).toContain(`<link rel="canonical" href="https://adventures.alexlford.com${cleanPath}">`);
  expect(html).toContain(`${record.name.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')} | Alex Ford Adventures`);
  expect(html).toContain('<base href="/">');

  const response=await page.goto(cleanPath,{waitUntil:'domcontentloaded'});
  expect(response?.status()).toBe(200);
  await expect(page.locator('h1')).toContainText(record.name);
  await expect(page.locator('.detail-route-section')).toHaveCount(1);
});

test('404 is no longer a client-side clean-route router',async({request})=>{
  const response=await request.get('/404.html');
  expect(response.status()).toBe(200);
  const html=await response.text();
  expect(html).toContain('That page is not in the archive');
  expect(html).not.toContain('location.replace');
  expect(html).not.toContain('detail.html?record=');
});
