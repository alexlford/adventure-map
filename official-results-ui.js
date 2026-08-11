(()=>{
  if(typeof popupCard!=='function'||typeof itemValue!=='function'||typeof publicLayerFor!=='function')return;
  const basePopupCard=popupCard,baseItemValue=itemValue;
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
    if(a.kind!=='race')return basePopupCard(a);
    const officialDistance=officialDistanceLabel(a);
    const placement=a.officialPlace?` · overall ${escapeHtml(a.officialPlace)}`:a.racePlace?` · race place ${escapeHtml(a.racePlace)}`:a.ageGroupPlace?` · age group ${escapeHtml(a.ageGroupPlace)}`:'';
    const officialResult=a.officialTime?`<p class="popup-meta"><strong>Official: ${escapeHtml(a.officialTime)}</strong>${officialDistance?` · ${escapeHtml(officialDistance)}`:''}${placement}</p>`:`<p class="popup-meta"><strong>Official distance: ${escapeHtml(officialDistance||a.distance||'race distance')}</strong></p>`;
    const award=a.award?`<p class="popup-meta">🏅 ${escapeHtml(a.award)}</p>`:'';
    const date=a.date?`<p class="popup-meta">${escapeHtml(formatDate(a.date))}</p>`:'';
    return `<article class="popup-card"><p class="popup-kicker">${escapeHtml(subtypeFor(a))}</p><h3 class="popup-title">${escapeHtml(a.name)}</h3><p class="popup-meta">${escapeHtml(a.location)}</p>${date}${officialResult}${award}${gpsLine(a)}<p class="popup-detail"><a href="${recordHref(a)}">Open record →</a></p></article>`;
  };
  itemValue=function(a){
    if(a.kind==='race')return a.officialTime||officialDistanceLabel(a)||a.distance||'';
    return baseItemValue(a);
  };
})();
