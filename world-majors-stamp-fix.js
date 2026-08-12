(()=>{
  const style=document.createElement('style');
  style.id='worldMajorsCompletedStampFix';
  style.textContent=`
    /* Internal provenance states stay in the data model, not in the public race UI. */
    .verification-badge.verified,.verification-badge.confirmed{display:none!important}

    /* Completed Major stamp: one clear word, with no checkmark/Major overlap. */
    .passport-earned-stamp{
      display:grid!important;
      place-items:center!important;
      padding:0!important;
      line-height:1!important;
      font-size:0!important;
      letter-spacing:0!important;
      text-transform:none!important;
    }
    .passport-earned-stamp span,.passport-earned-stamp small{display:none!important}
    .passport-earned-stamp::before{
      content:'Completed'!important;
      display:block;
      color:#27654e;
      font-size:.34rem;
      font-weight:900;
      letter-spacing:.075em;
      line-height:1;
      text-transform:uppercase;
      white-space:nowrap;
    }

    @media(max-width:650px){
      /* Keep the stamp in the header corner without squeezing the whole card. */
      .major-passport{padding:15px 14px 15px 52px!important}
      .major-passport.completed{padding-right:14px!important}
      .major-passport.completed .card-kicker,
      .major-passport.completed h3{padding-right:54px!important}
      .major-passport h3{
        font-size:clamp(1.32rem,6.2vw,1.72rem)!important;
        line-height:1.03!important;
        overflow-wrap:normal!important;
        word-break:normal!important;
      }
      .major-passport .card-meta{
        margin-top:8px!important;
        padding-right:0!important;
        font-size:.78rem!important;
        line-height:1.25!important;
        overflow-wrap:normal!important;
        word-break:normal!important;
      }
      .passport-earned-stamp{
        right:10px!important;
        top:10px!important;
        width:46px!important;
        height:46px!important;
      }
      .passport-earned-stamp::before{font-size:.31rem}
    }
  `;
  if(!document.getElementById(style.id))document.head.appendChild(style);

  const apply=()=>{
    document.querySelectorAll('.passport-earned-stamp').forEach(stamp=>{
      stamp.setAttribute('aria-label','Completed');
      stamp.title='Completed';
    });
  };

  apply();
  const observer=new MutationObserver(apply);
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();