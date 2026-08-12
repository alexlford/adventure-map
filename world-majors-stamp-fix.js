(()=>{
  const style=document.createElement('style');
  style.id='worldMajorsCompletedStampFix';
  style.textContent=`
    /* Internal provenance states stay in the data model, not in the public race UI. */
    .verification-badge.verified,.verification-badge.confirmed{display:none!important}

    /* Keep every passport card aligned and consistently sized. */
    .majors-passport-grid{
      align-items:stretch!important;
      grid-auto-rows:1fr!important;
    }
    .major-passport{
      width:100%!important;
      height:100%!important;
      min-width:0!important;
      box-sizing:border-box!important;
    }

    /* Completed Major stamp: transparent paper, ink only. */
    .passport-earned-stamp{
      display:grid!important;
      place-items:center!important;
      padding:0!important;
      background:transparent!important;
      box-shadow:none!important;
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
      /* Compact passport-book rhythm: equal cards without the large empty lower halves. */
      .majors-passport-grid{
        gap:8px!important;
        grid-auto-rows:clamp(204px,48vw,218px)!important;
      }
      .major-passport{
        padding:14px 12px 14px 50px!important;
        border-radius:16px!important;
        overflow:hidden!important;
      }
      .major-passport.completed,
      .major-passport.registered{
        background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(255,255,255,.91))!important;
      }
      .passport-number{
        left:13px!important;
        top:14px!important;
        font-size:1.05rem!important;
        color:rgba(33,58,49,.18)!important;
      }
      .major-passport .card-kicker{
        margin:0 0 6px!important;
        font-size:.56rem!important;
        line-height:1.08!important;
        letter-spacing:.12em!important;
      }
      .major-passport h3{
        margin:0!important;
        padding-right:0!important;
        font-size:1.34rem!important;
        line-height:1.01!important;
        letter-spacing:-.025em!important;
        overflow-wrap:normal!important;
        word-break:normal!important;
      }
      .major-passport .card-meta{
        margin-top:10px!important;
        padding-right:0!important;
        font-size:.69rem!important;
        line-height:1.27!important;
        color:#68747a!important;
        overflow-wrap:normal!important;
        word-break:normal!important;
      }

      /* Put the stamp in the quiet lower corner so it reads as a real passport mark, not a title badge. */
      .passport-earned-stamp{
        right:11px!important;
        top:auto!important;
        bottom:11px!important;
        width:49px!important;
        height:49px!important;
        border:2px solid rgba(39,101,78,.58)!important;
        border-radius:50%!important;
        opacity:.78!important;
        transform:rotate(-9deg)!important;
      }
      .passport-earned-stamp::before{font-size:.30rem!important}
      .passport-earned-stamp::after{
        content:''!important;
        position:absolute!important;
        inset:4px!important;
        border:1px solid rgba(39,101,78,.42)!important;
        border-radius:50%!important;
      }
    }

    @media(max-width:390px){
      .majors-passport-grid{grid-auto-rows:212px!important}
      .major-passport{padding-left:47px!important}
      .passport-number{left:12px!important}
      .major-passport h3{font-size:1.27rem!important}
      .major-passport .card-meta{font-size:.67rem!important}
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