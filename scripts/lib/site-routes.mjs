export const SITE_ORIGIN = 'https://adventures.alexlford.com';

export const siteRoutes = Object.freeze([
  { key: 'home', label: 'Home', path: '/', source: 'index.html', generated: false, sitemap: true, browserRewrite: true },
  { key: 'map', label: 'Map', path: '/map', source: 'map.html', generated: true, dir: 'map', sitemap: true, browserRewrite: true },
  { key: 'explore', label: 'Explore', path: '/explore', source: 'activities.html', generated: true, dir: 'explore', sitemap: true, browserRewrite: true },
  { key: 'timeline', label: 'Timeline', path: '/timeline', source: 'timeline.html', generated: true, dir: 'timeline', sitemap: true, browserRewrite: true },
  { key: 'stories', label: 'Stories', path: '/stories', source: 'adventures.html', generated: true, dir: 'stories', sitemap: true, browserRewrite: true },
  { key: 'races', label: 'Races', path: '/races', source: 'races.html', generated: true, dir: 'races', sitemap: true, browserRewrite: true },
  { key: 'summits', label: 'Summits', path: '/summits', source: 'summits.html', generated: true, dir: 'summits', sitemap: true, browserRewrite: true },
  { key: 'skiing', label: 'Skiing', path: '/skiing', source: 'skiing.html', generated: true, dir: 'skiing', sitemap: true, browserRewrite: true },
  { key: 'nordic', label: 'Nordic', path: '/nordic', source: 'nordic.html', generated: true, dir: 'nordic', sitemap: true, browserRewrite: true },
  { key: 'mtb', label: 'Mountain Biking', path: '/mtb', source: 'mountain-biking.html', generated: true, dir: 'mtb', sitemap: true, browserRewrite: true },
  { key: 'world-majors', label: 'World Marathon Majors', path: '/world-majors', source: 'world-majors/index.html', generated: false, dir: 'world-majors', sitemap: true, browserRewrite: false }
]);

export const generatedRoutes = siteRoutes.filter(route => route.generated);
export const sitemapRoutes = siteRoutes.filter(route => route.sitemap);
export const browserRewriteRoutes = siteRoutes.filter(route => route.browserRewrite);
export const cleanRouteMap = new Map(siteRoutes.map(route => [route.path, route.source]));
export const routeByKey = new Map(siteRoutes.map(route => [route.key, route]));

export const canonicalFor = route => `${SITE_ORIGIN}${route.path === '/' ? '/' : route.path}`;
