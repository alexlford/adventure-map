#!/usr/bin/env node
// Reproducible route-gap audit. Does not synthesize GPS positions.
import fs from 'node:fs';
const file = process.argv[2] || 'data/strava-route-full-resolution-flying-pig-2025.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
function decode(s) {
  let i=0,lat=0,lon=0; const pts=[];
  while(i<s.length) {
    const delta=[];
    for(let k=0;k<2;k++) {
      let result=0,shift=0,b;
      do { b=s.charCodeAt(i++)-63; result|=(b&31)<<shift; shift+=5; } while(b>=32);
      delta.push((result&1)?~(result>>1):(result>>1));
    }
    lat+=delta[0]; lon+=delta[1]; pts.push([lat/1e5,lon/1e5]);
  }
  return pts;
}
function meters(a,b) {
  const rad=Math.PI/180,dl=(b[0]-a[0])*rad,do_=(b[1]-a[1])*rad;
  const h=Math.sin(dl/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(do_/2)**2;
  return 12742000*Math.asin(Math.sqrt(h));
}
for(const route of data.routes) {
  const lines=route.lines.map(decode);
  const lengths=lines.map(line=>line.slice(1).reduce((sum,p,i)=>sum+meters(line[i],p),0));
  const gaps=lines.slice(1).map((line,i)=>meters(lines[i].at(-1),line[0]));
  const recordedMeters=lengths.reduce((a,b)=>a+b,0);
  const minimumMeters=recordedMeters+gaps.reduce((a,b)=>a+b,0);
  console.log(JSON.stringify({id:route.id,points:lines.map(l=>l.length),recordedMeters:+recordedMeters.toFixed(1),gapsMeters:gaps.map(x=>+x.toFixed(1)),minimumConnectedMeters:+minimumMeters.toFixed(1),nominalFiveKDeltaMeters:+(minimumMeters-5000).toFixed(1)},null,2));
  if(gaps.some(g=>g>180)) console.error('REVIEW REQUIRED: >180 m discontinuity. Do not silently join segments.');
}
