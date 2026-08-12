import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const registry=require('../../site-routes.js');
if(!registry||registry.schemaVersion!==1||!Array.isArray(registry.routes)||!registry.routes.length){
  throw new Error('site-routes.js must export a schemaVersion 1 route registry.');
}

export const SITE_ORIGIN=registry.origin;
export const siteRoutes=Object.freeze(registry.routes.map(route=>Object.freeze({...route})));
export const generatedRoutes=siteRoutes.filter(route=>route.generated);
export const sitemapRoutes=siteRoutes.filter(route=>route.sitemap);
export const browserRewriteRoutes=siteRoutes.filter(route=>route.browserRewrite);
export const cleanRouteMap=new Map(siteRoutes.map(route=>[route.path,route.source]));
export const routeByKey=new Map(siteRoutes.map(route=>[route.key,route]));
export const routeByActiveKey=new Map(siteRoutes.map(route=>[route.activeKey||route.key,route]));
export const navRoutes=group=>siteRoutes.filter(route=>route.navGroup===group);
export const canonicalFor=route=>`${SITE_ORIGIN}${route.path==='/'?'/':route.path}`;
