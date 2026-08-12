(()=>{
  const style=document.createElement('style');
  style.id='worldMajorsCompletedStampFix';
  style.textContent=`
    .passport-earned-stamp{display:grid!important;place-items:center!important;padding:7px 3px!important;line-height:1!important;font-size:.4rem!important;font-weight:900!important;letter-spacing:.075em!important;text-transform:uppercase!important}
    .passport-earned-stamp span,.passport-earned-stamp small{display:none!important}
  `;
  if(!document.getElementById(style.id))document.head.appendChild(style);
  const apply=()=>document.querySelectorAll('.passport-earned-stamp').forEach(stamp=>{stamp.textContent='Completed';stamp.setAttribute('aria-label','Completed Major')});
  apply();
  const observer=new MutationObserver(apply);
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();