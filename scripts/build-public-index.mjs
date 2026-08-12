import fs from 'node:fs/promises';
import { SITE_ORIGIN, sitemapRoutes } from './lib/site-routes.mjs';

const base=(process.env.SITE_URL||SITE_ORIGIN).replace(/\/$/,'');
const publicPayload=JSON.parse(await fs.readFile('data/public-records.json','utf8'));
const records=(publicPayload.records||[]).slice().sort((a,b)=>a.slug.localeCompare(b.slug));
const urls=[
  ...sitemapRoutes.map(route=>route.path==='/'?`${base}/`:`${base}${route.path}`),
  ...records.map(record=>`${base}/record/${encodeURIComponent(record.slug)}/`)
];
const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(value=>`  <url><loc>${value}</loc></url>`).join('\n')}\n</urlset>\n`;
const robots=`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
await fs.writeFile('sitemap.xml',xml);
await fs.writeFile('robots.txt',robots);
console.log(`Public index generated for ${base}: ${sitemapRoutes.length} sections + ${records.length} records.`);
