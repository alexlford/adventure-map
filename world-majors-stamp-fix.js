(()=>{
  const style=document.createElement('style');
  style.id='worldMajorsCompletedStampFix';
  style.textContent=`
    .passport-earned-stamp{display:grid!important;place-items:center!important;padding:7px 3px!important;line-height:1!important;font-size:.4rem!important;font-weight:900!important;letter-spacing:.075em!important;text-transform:uppercase!important}
    .passport-earned-stamp span,.passport-earned-stamp small{display:none!important}
  `;
  if(!document.getElementById(style.id))document.head.appendChild(style);

  const apply=()=>{
    const stamps=[...document.querySelectorAll('.passport-earned-stamp')];
    if(!stamps.length)return false;
    stamps.forEach(stamp=>{
      if(stamp.textContent.trim()!=='Completed')stamp.textContent='Completed';
      if(stamp.getAttribute('aria-label')!=='Completed Major')stamp.setAttribute('aria-label','Completed Major');
    });
    return true;
  };

  if(apply())return;
  const observer=new MutationObserver(()=>{
    if(!apply())return;
    observer.disconnect();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();