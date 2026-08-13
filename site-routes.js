(function(root,factory){
  const registry=factory();
  if(typeof module==='object'&&module.exports)module.exports=registry;
  else root.AdventureSiteRoutes=registry;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const routes=[
    {key:'home',activeKey:'home',label:'Home',navLabel:'Home',navGroup:'primary',path:'/',source:'index.html',publication:'root',generated:false,sitemap:true,browserRewrite:true},
    {key:'explore',activeKey:'activities',label:'Explore',navLabel:'Explore',navGroup:'primary',path:'/explore',source:'activities.html',publication:'generated-clean',generated:true,dir:'explore',sitemap:true,browserRewrite:true},
    {key:'map',activeKey:'map',label:'Map',navLabel:'Map',navGroup:'primary',path:'/map',source:'map.html',publication:'generated-clean',generated:true,dir:'map',sitemap:true,browserRewrite:true},
    {key:'stories',activeKey:'adventures',label:'Stories',navLabel:'Stories',navGroup:'primary',path:'/stories',source:'adventures.html',publication:'generated-clean',generated:true,dir:'stories',sitemap:true,browserRewrite:true},
    {key:'timeline',activeKey:'timeline',label:'Timeline',navLabel:'Timeline',navGroup:'aux',path:'/timeline',source:'timeline.html',publication:'generated-clean',generated:true,dir:'timeline',sitemap:true,browserRewrite:true},
    {key:'races',activeKey:'races',label:'Races',navLabel:'Races',navGroup:'activity',path:'/races',source:'races.html',publication:'generated-clean',generated:true,dir:'races',sitemap:true,browserRewrite:true},
    {key:'summits',activeKey:'summits',label:'Summits',navLabel:'Summits',navGroup:'activity',path:'/summits',source:'summits.html',publication:'generated-clean',generated:true,dir:'summits',sitemap:true,browserRewrite:true},
    {key:'skiing',activeKey:'skiing',label:'Skiing',navLabel:'Alpine Skiing',navGroup:'activity',path:'/skiing',source:'skiing.html',publication:'generated-clean',generated:true,dir:'skiing',sitemap:true,browserRewrite:true},
    {key:'nordic',activeKey:'nordic',label:'Nordic',navLabel:'Nordic Skiing',navGroup:'activity',path:'/nordic',source:'nordic.html',publication:'generated-clean',generated:true,dir:'nordic',sitemap:true,browserRewrite:true},
    {key:'mtb',activeKey:'mountain-biking',label:'Mountain Biking',navLabel:'MTB',navGroup:'activity',path:'/mtb',source:'mountain-biking.html',publication:'generated-clean',generated:true,dir:'mtb',sitemap:true,browserRewrite:true},
    {key:'world-majors',activeKey:'world-majors',parentActiveKey:'races',label:'World Marathon Majors',navLabel:'World Marathon Majors',navGroup:null,path:'/world-majors',source:'world-majors/index.html',publication:'direct-clean',generated:false,dir:'world-majors',sitemap:true,browserRewrite:false}
  ];
  return Object.freeze({schemaVersion:1,origin:'https://adventures.alexlford.com',routes:Object.freeze(routes.map(route=>Object.freeze(route)))});
});
