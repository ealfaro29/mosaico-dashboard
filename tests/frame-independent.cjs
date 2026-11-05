/* NODE_PATH=/tmp/mosaico-qa/node_modules node tests/frame-independent.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..'), qa = path.join(root,'.qa');
const OLD = 'mosaico:space:v1', OWN = 'mosaico:frame:note:v1';
const original = JSON.stringify({version:1,widgets:[{id:'note-original',type:'note',title:'Conservar',config:{text:'Texto anterior '.repeat(20000)}},{id:'weather-original',type:'weather',config:{location:{name:'Cartago',latitude:9.86,longitude:-83.92}}}]});
const weather={current:{temperature_2m:24,weather_code:2}};
const exchange={compra:{valor:498.5,fecha:'2026-11-05'},venta:{valor:505.2,fecha:'2026-11-05'}};
const news={hits:[1,2,3].map(i=>({title:'Titular '+i,url:'https://example.org/'+i,objectID:String(i)}))};
const results=[];let browser,base;
const server=http.createServer(async(req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 if(name!='/frame.html'){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
 res.end(await fs.readFile(path.join(root,'frame.html')));
});
async function setup(options={}) {
 const context=await browser.newContext({viewport:{width:1024,height:640},javaScriptEnabled:options.js!==false,userAgent:'Mozilla/5.0 (Android 8.1.0; Tablet; rv:159.0) Gecko/159.0 Firefox/159.0'});
 const page=await context.newPage(), errors=[],requests=[];
 const counter={active:0,max:0,total:0};
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await context.addInitScript(({old,own,hung,blocked})=>{
   if(!sessionStorage.getItem('frame-qa-seed')){
     localStorage.setItem('mosaico:space:v1',old);
     localStorage.setItem('mosaico:data:v1:weather:test','Previous cached data');
     if(own!==undefined)localStorage.setItem('mosaico:frame:note:v1',own);
     sessionStorage.setItem('frame-qa-seed','1');
   }
   window.qa={reads:[],writes:[],canvas:0,raf:0};
   const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
   Storage.prototype.getItem=function(key){qa.reads.push(key);if(key!=='mosaico:frame:note:v1')throw new Error('Unexpected storage read '+key);if(blocked)throw new Error('Storage blocked');return get.call(this,key);};
   Storage.prototype.setItem=function(key,value){qa.writes.push(key);if(key!=='mosaico:frame:note:v1')throw new Error('Unexpected storage write '+key);if(blocked)throw new Error('Storage blocked');return set.call(this,key,value);};
   Storage.prototype.removeItem=Storage.prototype.clear=Storage.prototype.key=function(){throw new Error('Storage enumeration/removal forbidden');};
   Intl.DateTimeFormat=function(){throw new Error('Intl.DateTimeFormat forbidden');};
   Intl.NumberFormat=function(){throw new Error('Intl.NumberFormat forbidden');};
   window.fetch=function(){throw new Error('Fetch forbidden');};window.structuredClone=undefined;
   Object.defineProperty(Crypto.prototype,'randomUUID',{configurable:true,value:undefined});
   const create=document.createElement.bind(document);
   document.createElement=function(tag,...args){if(/^(canvas|svg)$/i.test(tag)){qa.canvas++;throw new Error('Raster/vector scene forbidden');}return create(tag,...args);};
   document.createElementNS=function(){throw new Error('SVG forbidden');};
   if(hung){
     const Native=window.XMLHttpRequest;
     window.XMLHttpRequest=function(){
       const xhr=new Native(),open=xhr.open,send=xhr.send;let url='';
       xhr.open=function(method,uri,...args){url=uri;return open.call(xhr,method,uri,...args);};
       xhr.send=function(...args){if(url.includes('api.open-meteo.com'))return;return send.apply(xhr,args);};
       return xhr;
     };
   }
 },{old:original,own:options.note,hung:!!options.hung,blocked:!!options.blocked});
 await context.route('**/*',async route=>{
   const url=route.request().url();if(url.startsWith(base))return route.continue();
   counter.total++;counter.active++;counter.max=Math.max(counter.max,counter.active);
   try {
    if(options.abort)return await route.abort();
    await new Promise(r=>setTimeout(r,options.delay||75));
    let body=url.includes('open-meteo')?weather:url.includes('hacienda')?exchange:news;
    if(options.bad&&url.includes('open-meteo'))return await route.fulfill({contentType:'application/json',body:'{invalid'});
    if(options.bad&&url.includes('hacienda'))return await route.fulfill({contentType:'application/json',body:JSON.stringify({oversized:'x'.repeat(100000)})});
    if(options.malicious&&url.includes('algolia'))body={hits:[{title:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)',objectID:'123'}]};
    return await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   } finally {counter.active--;}
 });
 return {context,page,errors,requests,counter};
}
async function open(t,query='?offline=1'){
 await t.page.goto(base+'/frame.html'+query);
 await t.page.waitForFunction(()=>document.documentElement.getAttribute('data-frame-ready')==='20261105-fill4');
}
async function update(t){
 await t.page.locator('#frame-refresh').click();
 await t.page.waitForFunction(()=>!document.getElementById('frame-refresh').disabled,{},{timeout:12000});
}
async function test(name,fn){const start=Date.now();await fn();results.push({name,pass:true,ms:Date.now()-start});console.log('PASS '+name);}
(async()=>{
 await fs.mkdir(qa,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 await test('No JavaScript: five visible widgets, usable source links and no asset requests',async()=>{
   const t=await setup({js:false});await t.page.goto(base+'/frame.html');
   assert.equal(await t.page.locator('main section').count(),5);
   for(const card of await t.page.locator('main section').all())assert.equal(await card.isVisible(),true);
   assert.equal(await t.page.locator('noscript').isVisible(),true);
   assert.equal(await t.page.locator('#frame-save-note').isDisabled(),true);
   assert.equal(await t.page.locator('a[href^="https://"]').count(),4);
   assert.equal(t.requests.length,1);assert.equal(t.counter.total,0);
   await t.page.screenshot({path:path.join(qa,'frame-no-js.png')});await t.context.close();
 });
 await test('Offline start: no original APIs, CSS, modules, Canvas, SVG, fonts or network',async()=>{
   const t=await setup();await open(t);await t.page.waitForTimeout(500);
   assert.equal(t.requests.length,1);assert.equal(t.counter.total,0);
   assert.match(await t.page.locator('#frame-clock-value').textContent(),/^\d{2}:\d{2}$/);
   assert.deepEqual(await t.page.evaluate(()=>({reads:qa.reads,canvas:qa.canvas})),{reads:[OWN],canvas:0});
   const styles=await t.page.locator('.card').first().evaluate(n=>{const s=getComputedStyle(n);return {shadow:s.boxShadow,filter:s.filter,transform:s.transform,animation:s.animationName};});
   assert.deepEqual(styles,{shadow:'none',filter:'none',transform:'none',animation:'none'});
   assert.deepEqual(t.errors,[]);await t.context.close();
 });
 await test('Deferred sequential live data: only three bounded requests, one active at a time',async()=>{
   const t=await setup({delay:150});await open(t,'');
   await t.page.waitForTimeout(700);assert.equal(t.counter.total,0);
   await t.page.waitForFunction(()=>document.getElementById('frame-network-status').textContent==='Consultas terminadas.',{},{timeout:8000});
   assert.equal(t.counter.total,3);assert.equal(t.counter.max,1);
   assert.equal(await t.page.locator('#frame-weather-value').textContent(),'24 °C');
   assert.equal(await t.page.locator('#frame-news-list li').count(),3);
   assert.match(await t.page.locator('#frame-exchange-value').textContent(),/505.20/);
   assert.deepEqual(t.errors,[]);await t.page.screenshot({path:path.join(qa,'frame-android.png')});await t.context.close();
 });
 await test('Own saved note reloads exactly; large original space and cache stay byte-for-byte intact',async()=>{
   const t=await setup();await open(t);
   await t.page.locator('#frame-note').fill('Nota independiente: mañana, café y reunión ✓');
   await t.page.locator('#frame-save-note').click();await t.page.reload();await t.page.waitForFunction(()=>document.documentElement.getAttribute('data-frame-ready'));
   assert.equal(await t.page.locator('#frame-note').inputValue(),'Nota independiente: mañana, café y reunión ✓');
   const untouched=await t.page.evaluate(()=>({space:localStorage['mosaico:space:v1'],cache:localStorage['mosaico:data:v1:weather:test']}));
   assert.equal(untouched.space,original);assert.equal(untouched.cache,'Previous cached data');
   await t.page.locator('#frame-note').evaluate(n=>{n.value='x'.repeat(4001);n.dispatchEvent(new Event('input'));});
   await t.page.locator('#frame-save-note').click();
   assert.match(await t.page.locator('#frame-note-status').textContent(),/4000/);
   assert.equal(await t.page.evaluate(()=>localStorage['mosaico:frame:note:v1']),'Nota independiente: mañana, café y reunión ✓');
   assert.deepEqual(t.errors,[]);await t.context.close();
 });
 await test('Blocked storage and oversized own notes never overwrite existing values',async()=>{
   const blocked=await setup({blocked:true});await open(blocked);assert.equal(await blocked.page.locator('#frame-save-note').isDisabled(),true);
   await update(blocked);assert.equal(await blocked.page.locator('#frame-weather-value').textContent(),'24 °C');
   assert.deepEqual(blocked.errors,[]);await blocked.context.close();
   const large=await setup({note:'z'.repeat(5000)});await open(large);assert.equal(await large.page.locator('#frame-note').isDisabled(),true);
   assert.equal(await large.page.evaluate(()=>localStorage['mosaico:frame:note:v1'].length),5000);
   assert.deepEqual(await large.page.evaluate(()=>qa.writes),[]);assert.deepEqual(large.errors,[]);await large.context.close();
 });
 await test('Aborted, malformed and oversized sources fail independently without hiding widgets',async()=>{
   const offline=await setup({abort:true});await open(offline);await update(offline);
   assert.equal(await offline.page.locator('main section').count(),5);assert.match(await offline.page.locator('#frame-weather-status').textContent(),/Sin conexión/);
   assert.equal(await offline.page.locator('#frame-save-note').isEnabled(),true);assert.deepEqual(offline.errors,[]);await offline.context.close();
   const bad=await setup({bad:true});await open(bad);await update(bad);
   assert.match(await bad.page.locator('#frame-weather-status').textContent(),/No se pudo/);
   assert.match(await bad.page.locator('#frame-exchange-status').textContent(),/grande|No se pudo/);
   assert.equal(await bad.page.locator('#frame-news-list li').count(),3);assert.deepEqual(bad.errors,[]);await bad.context.close();
 });
 await test('Hung first request stops at watchdog and later sources still load',async()=>{
   const t=await setup({hung:true});await open(t);await update(t);
   assert.match(await t.page.locator('#frame-weather-status').textContent(),/tardó demasiado/);
   assert.match(await t.page.locator('#frame-exchange-value').textContent(),/505.20/);
   assert.equal(await t.page.locator('#frame-news-list li').count(),3);
   assert.equal(t.counter.total,2);assert.deepEqual(t.errors,[]);await t.context.close();
 });
 await test('Untrusted headlines stay plain text with safe links',async()=>{
   const t=await setup({malicious:true});await open(t);await update(t);
   assert.equal(await t.page.locator('#frame-news-list img').count(),0);
   assert.equal(await t.page.locator('#frame-news-list a').textContent(),'<img src=x onerror=alert(1)>');
   assert.match(await t.page.locator('#frame-news-list a').getAttribute('href'),/^https:\/\/news.ycombinator.com/);
   assert.deepEqual(t.errors,[]);await t.context.close();
 });
 const report={version:'20261105-fill4',browser:await browser.version(),passed:results.length,tests:results,physicalFrameTested:false};
 await fs.writeFile(path.join(qa,'frame-independent-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:results.length,browser:report.browser}));
})().catch(async e=>{console.error(e);await fs.writeFile(path.join(qa,'frame-independent-failure.txt'),e.stack);process.exitCode=1;})
.finally(async()=>{if(browser)await browser.close();await new Promise(r=>server.close(r));});
