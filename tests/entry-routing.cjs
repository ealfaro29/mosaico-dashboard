/* NODE_PATH=/tmp/mosaico-qa/node_modules node tests/entry-routing.cjs */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'.qa');
const OLD='mosaico:space:v1',NOTE='mosaico:frame:note:v1';
const previous=JSON.stringify({version:1,widgets:[{id:'keep',type:'note',title:'Conservar',config:{text:'No borrar ni migrar '.repeat(10000)}},{id:'clock',type:'clock',title:'',config:{}}]});
const report=[];let browser,base;
const server=http.createServer(async(req,res)=>{
 const uri=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+(uri.endsWith('/')?uri+'index.html':uri));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain'});res.end(body);}catch{res.writeHead(404).end();}
});
async function setup(mode,extra={}) {
 const context=await browser.newContext({viewport:{width:1024,height:640},userAgent:'Mozilla/5.0 (Android 8.1.0; Tablet; rv:159.0) Gecko/159.0 Firefox/159.0'});
 const page=await context.newPage(),requests=[],errors=[];
 page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(({mode,previous})=>{
  if(!sessionStorage.getItem('entry-qa-seed')){
   localStorage.setItem('mosaico:space:v1',previous);localStorage.setItem('mosaico:frame:note:v1','Nota propia anterior ✓');sessionStorage.setItem('entry-qa-seed','1');
  }
  window.qaStorage={oldReads:0,oldWrites:0};
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  Storage.prototype.getItem=function(key){if(key==='mosaico:space:v1')qaStorage.oldReads++;return get.call(this,key);};
  Storage.prototype.setItem=function(key,value){if(key==='mosaico:space:v1')qaStorage.oldWrites++;return set.call(this,key,value);};
  if(mode==='modules')delete HTMLScriptElement.prototype.noModule;
  if(mode==='syntax'){
   const Native=Function;
   window.Function=function(...args){if(args.some(x=>String(x).includes('copy()?.value')))throw new SyntaxError('Simulated old parser');return Native.apply(null,args);};
  }
  if(mode==='dom')Element.prototype.replaceChildren=undefined;
  if(mode==='css-grid'||mode==='css-dvh'||mode==='css-min'){
   const supports=CSS.supports.bind(CSS);
   CSS.supports=function(prop,value){if(mode==='css-grid'&&value==='grid'||mode==='css-dvh'&&String(value).includes('dvh')||mode==='css-min'&&String(value).includes('min('))return false;return supports(prop,value);};
  }
 },{mode,previous});
 await context.route('**/*',async route=>{
   const url=route.request().url();
   if(extra.bootFail&&url.includes('/js/boot.js'))return route.abort();
   if(extra.bootSyntax&&url.includes('/js/boot.js'))return route.fulfill({contentType:'text/javascript',body:'if ('});
   if(extra.cssFail&&url.includes('/style.css'))return route.abort();
   if(extra.moduleFail&&url.includes('/js/app.js'))return route.abort();
   if(url.startsWith(base))return route.continue();
   if(url.includes('fonts.'))return route.abort();
   if(url.includes('open-meteo'))return route.fulfill({contentType:'application/json',body:JSON.stringify({current:{temperature_2m:24,apparent_temperature:25,relative_humidity_2m:50,wind_speed_10m:8,weather_code:2,is_day:1},daily:{time:['2026-11-05'],temperature_2m_max:[27],temperature_2m_min:[18],weather_code:[2]}})});
   if(url.includes('hacienda'))return route.fulfill({contentType:'application/json',body:'{"compra":{"valor":498,"fecha":"2026-11-05"},"venta":{"valor":505,"fecha":"2026-11-05"}}'});
   return route.fulfill({contentType:'application/json',body:'{"hits":[{"title":"Titular de prueba","url":"https://example.org/","objectID":"1","created_at":"2026-11-05T00:00:00Z","points":20}]}'});
 });
 return {context,page,requests,errors};
}
async function frameReady(t){
 await t.page.waitForURL(/\/frame\.html/);
 await t.page.waitForFunction(()=>document.documentElement.getAttribute('data-frame-ready')==='20261105-fill4');
}
async function intact(t){
 assert.equal(await t.page.evaluate(key=>localStorage[key],OLD),previous);
 assert.equal(await t.page.locator('#frame-note').inputValue(),'Nota propia anterior ✓');
 assert.deepEqual(await t.page.evaluate(()=>qaStorage),{oldReads:0,oldWrites:0});
}
async function test(name,fn){const start=Date.now();await fn();report.push({name,pass:true,ms:Date.now()-start});console.log('PASS '+name);}
(async()=>{
 await fs.mkdir(qa,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 await test('Capable engine keeps modern dashboard, layout and lite behavior',async()=>{
  const t=await setup('normal');await t.page.goto(base+'/?lite=1');
  await t.page.waitForFunction(()=>document.documentElement.getAttribute('data-mosaico-ready')==='true');
  assert.equal(new URL(t.page.url()).pathname,'/');
  assert.equal(await t.page.locator('#entry-fallback').isVisible(),false);
  assert.equal(await t.page.locator('.widget').count(),2);
  assert.equal(await t.page.locator('.note-editor').inputValue(),'No borrar ni migrar '.repeat(10000));
  assert.equal(await t.page.evaluate(()=>MosaicoRuntime.lightweight),true);
  assert.equal(await t.page.locator('.app-shell').evaluate(n=>n.getBoundingClientRect().height),640);
  assert.deepEqual(t.errors,[]);await t.page.screenshot({path:path.join(qa,'entry-modern.png')});await t.context.close();
 });
 for(const mode of ['modules','syntax','dom','css-grid','css-min']){
  await test('Missing '+mode+' redirects before dashboard resources and preserves storage',async()=>{
   const t=await setup(mode);await t.page.goto(base+'/?lite=1&offline=1');await frameReady(t);await intact(t);
   const url=new URL(t.page.url());assert.equal(url.searchParams.get('offline'),'1');assert.equal(url.searchParams.get('lite'),'1');assert.equal(url.searchParams.get('v'),'20261105-fill4');
   assert.equal(t.requests.some(u=>/\/style\.css|\/js\/(?:app|data|icons|extensions|compat|weather-scene)\.js/.test(u)),false);
   assert.deepEqual(t.errors,[]);await t.context.close();
  });
 }
 await test('Missing dvh alone keeps capable dashboard and uses existing vh CSS fallbacks',async()=>{
  const t=await setup('css-dvh');
  await t.context.route('**/style.css*',async route=>{
   const css=(await fs.readFile(path.join(root,'style.css'),'utf8')).replace(/[a-z-]+:[^;{}]*dvh[^;{}]*;?/g,'');
   await route.fulfill({contentType:'text/css',body:css});
  });
  await t.page.goto(base+'/?lite=1');
  await t.page.waitForFunction(()=>document.documentElement.getAttribute('data-mosaico-ready')==='true');
  assert.equal(new URL(t.page.url()).pathname,'/');
  assert.equal(await t.page.locator('.app-shell').evaluate(n=>n.getBoundingClientRect().height),640);
  assert.deepEqual(t.errors,[]);await t.context.close();
 });
 await test('Manual dashboard exit avoids redirect loop while incompatible module stays unloaded',async()=>{
  const t=await setup('dom');await t.page.goto(base+'/?offline=1');await frameReady(t);
  await t.page.locator('footer a').click();await t.page.waitForURL(/\?dashboard=1/);
  await t.page.locator('#entry-frame-link').waitFor({state:'visible'});
  await t.page.waitForTimeout(300);
  assert.equal(new URL(t.page.url()).searchParams.get('dashboard'),'1');
  assert.match(await t.page.locator('#entry-message').textContent(),/no admite/);
  assert.equal(t.requests.some(u=>u.includes('/js/app.js')),false);
  assert.equal(await t.page.evaluate(key=>localStorage[key],OLD),previous);
  await t.page.locator('#entry-frame-link').click();await frameReady(t);
  assert.deepEqual(t.errors,[]);await t.context.close();
 });
 await test('Pending deferred bootstrap leaves manual frame link visible before DOMContentLoaded',async()=>{
  const t=await setup('normal');let release;
  const held=new Promise(resolve=>release=resolve);
  await t.context.route('**/js/boot.js*',async route=>{await held;await route.abort().catch(()=>{});});
  await t.page.goto(base+'/?offline=1',{waitUntil:'commit'});
  await t.page.locator('#entry-frame-link').waitFor({state:'visible'});
  assert.equal(t.requests.some(u=>u.includes('/style.css')||u.includes('/js/app.js')),false);
  await t.page.locator('#entry-frame-link').click({noWaitAfter:true});release();await frameReady(t);await intact(t);
  assert.deepEqual(t.errors,[]);await t.context.close();
 });
 for(const kind of ['bootFail','bootSyntax','cssFail','moduleFail']){
  await test(kind+' leaves a real manual frame recovery without storage changes',async()=>{
   const t=await setup('normal',{[kind]:true});await t.page.goto(base+'/?offline=1');
   await t.page.locator('#entry-frame-link').waitFor({state:'visible'});
   assert.match(await t.page.locator('#entry-frame-link').getAttribute('href'),/frame\.html/);
   if(kind!=='moduleFail')assert.equal(t.requests.some(u=>u.includes('/js/app.js')),false);
   assert.equal(await t.page.evaluate(key=>localStorage[key],OLD),previous);
   await t.page.locator('#entry-frame-link').click();await frameReady(t);await intact(t);
   if(kind==='bootSyntax')assert.equal(t.errors.length,1);else assert.deepEqual(t.errors,[]);
   await t.context.close();
  });
 }
 const result={version:'20261105-fill4',browser:await browser.version(),passed:report.length,tests:report,scope:'Capability failures simulated in Chrome; physical Android WebView/Fulguris not available.'};
 await fs.writeFile(path.join(qa,'entry-routing-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:report.length,browser:result.browser}));
})().catch(async e=>{console.error(e);await fs.writeFile(path.join(qa,'entry-routing-failure.txt'),e.stack);process.exitCode=1;})
.finally(async()=>{if(browser)await browser.close();await new Promise(r=>server.close(r));});
