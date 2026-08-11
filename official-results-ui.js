(()=>{
  if(typeof popupCard!=='function'||typeof itemValue!=='function')return;
  const officialDistanceLabel=a=>a.officialDistance||(Number.isFinite(a.officialDistanceMi)?`${a.officialDistanceMi} mi`:a.distance||'');
  const gpsLine=a=>{
    if(!a.stravaActivityId&&!Number.isFinite(a.stravaDistanceMi)&&!Number.isFinite(a.elapsedSeconds))return'';
    const mi=Number.isFinite(a.stravaDistanceMi)?a.stravaDistanceMi:a.distanceMi;
    const sec=Number.isFinite(a.stravaElapsedSeconds)?a.stravaElapsedSeconds:a.elapsedSeconds;
    const parts=[];
    if(Number.isFinite(mi))parts.push(`${mi} mi GPS`);
    if(Number.isFinite(sec))parts.push(`${formatDuration(sec)} recorded`);
    return parts.length?`<p class="popup-meta">Strava: ${escapeHtml(parts.join(' · '))}</p>`:'';
  };
  popupCard=function(a){
    const category=CATEGORY[categoryFor(a)]||{label:'Adventure'};
    if(a.kind!=='race'){
      const primary=a.kind==='summit'?`${formatNumber(a.elevationFt)} ft`:a.kind==='adventure'?(a.distance||''):[a.year,a.distance].filter(Boolean).join(' · ');
      const alias=a.currentName?`<p class="popup-alias">Now known as ${escapeHtml(a.currentName)}</p>`:'';
      const date=a.date?`<p class="popup-meta">${escapeHtml(formatDate(a.date))}${a.endDate?` – ${escapeHtml(formatDate(a.endDate))}`:''}</p>`:'';
      const metrics=a.distanceMi?`<p class="popup-meta">${escapeHtml(a.distanceMi)} mi${a.elevationGainM?` · ${escapeHtml(Math.round(a.elevationGainM))} m gain`:''}${a.elapsedSeconds?` · ${escapeHtml(formatDuration(a.elapsedSeconds))} elapsed`:''}</p>`:'';
      return `<article class="popup-card"><p class="popup-kicker">${escapeHtml(category.label)}</p><h3 class="popup-title">${escapeHtml(a.name)}</h3>${alias}<p class="popup-meta">${escapeHtml(primary)}${primary?' · ':''}${escapeHtml(a.location)}</p>${date}${metrics}<p class="popup-detail"><a href="${recordHref(a)}">Open almanac entry →</a></p></article>`;
    }
    const officialDistance=officialDistanceLabel(a);
    const officialResult=a.officialTime?`<p class="popup-meta"><strong>Official: ${escapeHtml(a.officialTime)}</strong>${officialDistance?` · ${escapeHtml(officialDistance)}`:''}${a.officialPlace?` · place ${escapeHtml(a.officialPlace)}`:''}${a.ageGroupPlace?` · age group ${escapeHtml(a.ageGroupPlace)}`:''}</p>`:`<p class="popup-meta"><strong>Official distance: ${escapeHtml(officialDistance||a.distance||'race distance')}</strong></p>`;
    const award=a.award?`<p class="popup-meta">🏅 ${escapeHtml(a.award)}</p>`:'';
    const date=a.date?`<p class="popup-meta">${escapeHtml(formatDate(a.date))}</p>`:'';
    return `<article class="popup-card"><p class="popup-kicker">${escapeHtml(subtypeFor(a))}</p><h3 class="popup-title">${escapeHtml(a.name)}</h3><p class="popup-meta">${escapeHtml(a.location)}</p>${date}${officialResult}${award}${gpsLine(a)}<p class="popup-detail"><a href="${recordHref(a)}">Open almanac entry →</a></p></article>`;
  };
  itemValue=function(a){
    if(a.kind==='summit')return`${formatNumber(a.elevationFt)}′`;
    if(a.kind==='race')return a.officialTime||officialDistanceLabel(a)||a.distance||'';
    if(a.kind==='adventure')return a.distance||a.distanceMi?`${a.distanceMi||''}${a.distanceMi?' mi':''}`.trim():'';
    if(a.distanceMi)return`${a.distanceMi} mi`;
    return[a.year,a.distance].filter(Boolean).join(' · ');
  };
})();
