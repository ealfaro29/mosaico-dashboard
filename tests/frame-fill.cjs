/* NODE_PATH=/tmp/mosaico-qa/node_modules node tests/frame-fill.cjs */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'.qa');
const ORIGINAL='mosaico:space:v1',OWN='mosaico:frame:note:v1';
const previous=JSON.stringify({version:1,widgets:[{id:'old-note',type:'note',title:'Anterior',config:{text:'Conservar el espacio anterior. '.repeat(10000)}},{id:'old-clock',type:'clock',config:{}}]});
const fixtures={
 weather:{current:{temperature_2m:24,weather_code:2}},
 exchange:{compra:{valor:498.5,fecha:'2026-11-05'},venta:{valor:505.2,fecha:'2026-11-05'}},
 news:{hits:[1,2,3].map(i=>({title:'Titular de tecnología '+i,url:'https://example.org/'+i,objectID:String(i)}))}
};
const tests=[],snapshots=[];let browser,base;
const server=http.createServer(async(req,res)=>{
 if(new URL(req.url,'http://localhost').pathname!='/frame.html'){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
 res.end(await fs.readFile(path.join(root,'frame.html')));
});
async function setup(options={}){
 const context=await browser.newContext({viewport:options.viewport||{width:1024,height:640},javaScriptEnabled:options.js!==false,userAgent:'Mozilla/5.0 (Android 8.1.0; Tablet; rv:159.0) Gecko/159.0 Firefox/159.0'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 if(options.js!==false)await context.addInitScript(({previous})=>{
  if(!sessionStorage.getItem('frame-fill-seeded')){
   localStorage.setItem('mosaico:space:v1',previous);localStorage.setItem('mosaico:frame:note:v1','Nota del marco anterior ✓');sessionStorage.setItem('frame-fill-seeded','1');
  }
 },{previous});
 await context.route('**/*',async route=>{
  const url=route.request().url();if(url.startsWith(base))return route.continue();
  if(options.abort)return route.abort();
  let body=url.includes('open-meteo')?fixtures.weather:url.includes('hacienda')?fixtures.exchange:fixtures.news;
  if(options.bad&&url.includes('open-meteo'))return route.fulfill({contentType:'application/json',body:'{invalid'});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(base+'/frame.html?offline=1');
 if(options.js!==false){
  await page.waitForFunction(()=>!!document.documentElement.getAttribute('data-frame-ready'));
  assert.equal(await page.locator('#frame-primary').count(),1,'The new row-based layout must be present before running this suite.');
  assert.equal(await page.locator('#frame-secondary').count(),1);
 }
 return {context,page,errors};
}
async function measure(t,label){
 await t.page.waitForTimeout(180);
 const value=await t.page.evaluate(()=>{
  const rect=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
  const card=n=>{
   const b=rect(n),style=getComputedStyle(n);
   const children=Array.from(n.children).filter(c=>getComputedStyle(c).display!=='none').map(c=>({tag:c.tagName,id:c.id,rect:rect(c)}));
   return {rect:b,paddingTop:parseFloat(style.paddingTop),paddingBottom:parseFloat(style.paddingBottom),overflowY:style.overflowY,children};
  };
  return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,paddingBottom:parseFloat(getComputedStyle(document.body).paddingBottom),footer:rect(document.querySelector('footer')),textarea:rect(document.getElementById('frame-note')),rows:['frame-primary','frame-secondary'].map(id=>({id,cards:Array.from(document.getElementById(id).querySelectorAll('.card')).map(card)})),buttons:['frame-refresh','frame-fullscreen','frame-save-note'].map(id=>({id,rect:rect(document.getElementById(id)),font:parseFloat(getComputedStyle(document.getElementById(id)).fontSize)})),font:parseFloat(getComputedStyle(document.documentElement).fontSize)};
 });
 snapshots.push({label,...value});return value;
}
function noHorizontal(m){assert.ok(m.scrollWidth<=m.width+1,'Horizontal overflow at '+m.width+'x'+m.height);}
function noClipping(m){
 const cards=m.rows.flatMap(r=>r.cards);
 for(const card of cards){
  assert.notEqual(card.overflowY,'hidden','Widget contents must not be clipped');
  for(const child of card.children){
   assert.ok(child.rect.top>=card.rect.top-1,'Child extends above its card: '+child.id);
   assert.ok(child.rect.bottom<=card.rect.bottom+1,'Child extends below its card: '+child.id);
  }
 }
 assert.ok(m.footer.top>=Math.max(...cards.map(c=>c.rect.bottom))-1,'Footer overlaps widgets');
}
function filled(m){
 noHorizontal(m);noClipping(m);
 assert.ok(m.scrollHeight<=m.height+2,'Unexpected vertical overflow at '+m.width+'x'+m.height);
 const target=m.height-m.paddingBottom;
 assert.ok(Math.abs(m.footer.bottom-target)<=3,'Unused or overflowing bottom area: footer='+m.footer.bottom+', target='+target);
 for(const row of m.rows){
  const heights=row.cards.map(c=>c.rect.height);
  assert.ok(Math.max(...heights)-Math.min(...heights)<=2,'Cards in the same row differ in height');
 }
}
async function refresh(t){
 await t.page.locator('#frame-refresh').click();
 await t.page.waitForFunction(()=>!document.getElementById('frame-refresh').disabled,{},{timeout:12000});
 await t.page.waitForTimeout(150);
}
async function test(name,fn){const start=Date.now();await fn();tests.push({name,pass:true,ms:Date.now()-start});console.log('PASS '+name);}
(async()=>{
 await fs.mkdir(qa,{recursive:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 await test('Desktop rows fill available height and notes grow with viewport',async()=>{
  const t=await setup();await refresh(t);
  const data=[];
  for(const viewport of [{width:1024,height:640},{width:1024,height:800},{width:1024,height:1024},{width:1280,height:800}]){
   await t.page.setViewportSize(viewport);
   const m=await measure(t,'desktop-'+viewport.width+'x'+viewport.height);filled(m);data.push(m);
   if(viewport.height===800)await t.page.screenshot({path:path.join(qa,'frame-fill-'+viewport.width+'x'+viewport.height+'.png')});
  }
  assert.ok(data[2].textarea.height>data[0].textarea.height+50,'Note editor does not use the additional height');
  assert.deepEqual(t.errors,[]);await t.context.close();
 });
 await test('Refresh and fullscreen are icon-only with accessible labels and44px targets',async()=>{
  const t=await setup();const m=await measure(t,'icon-controls');
  for(const id of ['frame-refresh','frame-fullscreen']){
   const node=t.page.locator('#'+id);
   const label=await node.getAttribute('aria-label'),title=await node.getAttribute('title'),text=(await node.textContent()).trim();
   assert.ok(label&&label.length>4);assert.equal(title,label);
   assert.doesNotMatch(text,/Actualizar|Pantalla|Salir/i,'Visible text label is still present');
   const b=m.buttons.find(b=>b.id===id);assert.ok(b.rect.width>=44&&b.rect.height>=44);
  }
  assert.equal(await t.page.locator('#frame-refresh').getAttribute('aria-label'),'Actualizar datos');
  assert.equal(await t.page.locator('#frame-fullscreen').getAttribute('aria-label'),'Pantalla completa');
  assert.deepEqual(t.errors,[]);await t.context.close();
 });
 await test('Native fullscreen entry, resize, orientation and exit preserve fill and icon state',async()=>{
  const t=await setup();await refresh(t);
  await t.page.locator('#frame-fullscreen').click();await t.page.waitForFunction(()=>!!document.fullscreenElement);
  assert.equal(await t.page.locator('#frame-fullscreen').getAttribute('aria-label'),'Salir de pantalla completa');
  assert.equal(await t.page.locator('#frame-fullscreen').getAttribute('aria-pressed'),'true');
  await t.page.setViewportSize({width:1024,height:800});filled(await measure(t,'native-fullscreen-800'));
  await t.page.evaluate(()=>window.dispatchEvent(new Event('orientationchange')));filled(await measure(t,'orientation-change'));
  await t.page.locator('#frame-fullscreen').click();await t.page.waitForFunction(()=>!document.fullscreenElement);
  assert.equal(await t.page.locator('#frame-fullscreen').getAttribute('aria-label'),'Pantalla completa');
  assert.equal(await t.page.locator('#frame-fullscreen').getAttribute('aria-pressed'),'false');
  filled(await measure(t,'after-fullscreen-exit'));
  assert.deepEqual(t.errors,[]);await t.context.close();
 });
 await test('Long content expands naturally and small/tiny views scroll without clipping',async()=>{
  const t=await setup();
  await t.page.evaluate(()=>{
   document.getElementById('frame-weather-status').textContent='La fuente no está disponible. Puedes reintentar sin perder tus notas. '.repeat(10);
   document.getElementById('frame-news-list').textContent='Un titular largo que debe seguir siendo legible y completo. '.repeat(20);
   document.getElementById('frame-note-status').textContent='No se pudo guardar; el texto sigue aquí. Conserva una copia. '.repeat(8);
   document.dispatchEvent(new Event('mosaico:frame-layout'));
  });
  const long=await measure(t,'long-content');noHorizontal(long);noClipping(long);assert.ok(long.scrollHeight>long.height);
  for(const viewport of [{width:1024,height:360},{width:375,height:800},{width:375,height:360}]){
   await t.page.setViewportSize(viewport);const m=await measure(t,'small-'+viewport.width+'x'+viewport.height);
   noHorizontal(m);noClipping(m);assert.ok(m.scrollHeight>m.height);assert.ok(m.font>=16);
   assert.ok(m.buttons.every(b=>b.rect.height>=44));
   if(viewport.width===375){
    const cards=m.rows.flatMap(r=>r.cards);
    for(let i=1;i<cards.length;i++)assert.ok(cards[i].rect.top>=cards[i-1].rect.bottom-1,'Narrow cards overlap');
   }
  }
  await t.page.screenshot({path:path.join(qa,'frame-fill-narrow-long.png')});
  assert.deepEqual(t.errors,[]);await t.context.close();
 });
 await test('Malformed source response and layout status updates leave every widget usable',async()=>{
  const t=await setup({bad:true,viewport:{width:1024,height:800}});await refresh(t);
  assert.match(await t.page.locator('#frame-weather-status').textContent(),/No se pudo/);
  assert.match(await t.page.locator('#frame-exchange-value').textContent(),/505.20/);
  assert.equal(await t.page.locator('#frame-news-list li').count(),3);
  assert.equal(await t.page.locator('#frame-note').isEnabled(),true);
  filled(await measure(t,'malformed-source'));
  assert.deepEqual(t.errors,[]);await t.context.close();
 });
 await test('Saved frame notes reload exactly and original dashboard data stay untouched',async()=>{
  const t=await setup();const note='Nota conservada al ajustar la pantalla completa ✓\nMañana: café y reunión.';
  assert.equal(await t.page.locator('#frame-note').inputValue(),'Nota del marco anterior ✓');
  await t.page.locator('#frame-note').fill(note);await t.page.locator('#frame-save-note').click();
  await t.page.setViewportSize({width:1024,height:1024});await measure(t,'saved-note-tall');
  await t.page.reload();await t.page.waitForFunction(()=>!!document.documentElement.getAttribute('data-frame-ready'));
  assert.equal(await t.page.locator('#frame-note').inputValue(),note);
  const stored=await t.page.evaluate(({oldKey,ownKey})=>({old:localStorage[oldKey],own:localStorage[ownKey]}),{oldKey:ORIGINAL,ownKey:OWN});
  assert.ok(stored.old===previous,'Original dashboard storage changed');assert.equal(stored.own,note);
  assert.deepEqual(t.errors,[]);await t.context.close();
 });
 await test('Without JavaScript five widgets and source links remain visible',async()=>{
  const t=await setup({js:false});assert.equal(await t.page.locator('main section.card').count(),5);
  for(const card of await t.page.locator('main section.card').all())assert.equal(await card.isVisible(),true);
  assert.equal(await t.page.locator('noscript').isVisible(),true);
  assert.equal(await t.page.locator('#frame-save-note').isDisabled(),true);
  assert.deepEqual(t.errors,[]);await t.context.close();
 });
 const result={browser:await browser.version(),passed:tests.length,tests,snapshots,scope:'Native desktop Chrome fullscreen plus viewport and error simulations; physical Android frame not available.'};
 await fs.writeFile(path.join(qa,'frame-fill-results.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({passed:tests.length,browser:result.browser}));
})().catch(async e=>{
 console.error(e);await fs.writeFile(path.join(qa,'frame-fill-failure.txt'),e.stack);
 await fs.writeFile(path.join(qa,'frame-fill-partial-results.json'),JSON.stringify({tests,snapshots},null,2));process.exitCode=1;
}).finally(async()=>{if(browser)await browser.close();await new Promise(r=>server.close(r));});
