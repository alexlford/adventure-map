import fs from 'node:fs/promises';

const DEFAULT_BASE='https://adventures.alexlford.com';
const base=(process.env.SITE_URL||DEFAULT_BASE).replace(/\/$/,'');
const pages=['','map','explore','timeline','stories','races','summits','skiing','nordic','mtb'];
const url=page=>page?`${base}/${page}`:`${base}/`;
const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p=>`  <url><loc>${url(p)}</loc></url>`).join('\n')}\n</urlset>\n`;
const robots=`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
await fs.writeFile('sitemap.xml',xml);
await fs.writeFile('robots.txt',robots);
console.log(`Public index generated for ${base}`);
