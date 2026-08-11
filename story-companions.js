(()=>{
  const A=window.AdventureSite;if(!A)return;
  const query=new URLSearchParams(location.search);
  const cleanMatch=location.pathname.match(/\/record\/([^/]+)\/?$/);
  const key=query.get('record')||query.get('id')||(cleanMatch?decodeURIComponent(cleanMatch[1]):'');
  if(!key)return;
  const label=c=>[c?.name,c?.relationship].filter(Boolean).join(' · ');
  A.load().then(all=>{
    const record=all.find(x=>x.id===key||x.slug===key);
    const companions=(record?.companions||[]).filter(c=>c&&c.name);
    if(!record||record.kind!=='adventure'||!companions.length)return;
    const html=`<article class="story-companion-fact"><small>With</small><strong>${companions.map(c=>A.esc(c.name)).join(' · ')}</strong><span>${companions.map(c=>A.esc(c.relationship||'Companion')).join(' · ')}</span></article>`;
    const place=()=>{
      const glance=document.querySelector('.story-record-at-a-glance');
      if(!glance)return false;
      if(glance.querySelector('.story-companion-fact'))return true;
      glance.classList.add('has-companions');
      glance.insertAdjacentHTML('beforeend',html);
      return true;
    };
    if(place())return;
    const root=document.getElementById('page');if(!root)return;
    const obs=new MutationObserver(()=>{if(place())obs.disconnect()});
    obs.observe(root,{childList:true,subtree:true});
  }).catch(e=>console.error('Story companions',e));
})();