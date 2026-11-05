/* Optional QA dependency only: NODE_PATH=/tmp/mosaico-qa/node_modules node tests/frame-smoke.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium, firefox } = require('playwright');
const root = path.resolve(__dirname, '..');
const qa = path.join(root, '.qa');
const KEY = 'mosaico:space:v1';
const androidUA = 'Mozilla/5.0 (Android 8.1.0; Tablet; rv:159.0) Gecko/159.0 Firefox/159.0';
const browserName = process.env.MOSAICO_BROWSER || 'chromium';
const log = [];
const weather = {
  current:{temperature_2m:24,apparent_temperature:25,relative_humidity_2m:73,wind_speed_10m:8,weather_code:2,is_day:1},
  daily:{time:['2026-11-05','2026-11-06'],temperature_2m_max:[27,28],temperature_2m_min:[18,19],weather_code:[2,61]}
};
const exchange = {compra:{valor:498.5,fecha:'2026-11-05'},venta:{valor:505.2,fecha:'2026-11-05'}};
const news = {hits:[1,2,3].map(i=>({objectID:String(i),title:'Noticia de prueba '+i,url:'https://example.org/story/'+i,points:30+i,created_at:'2026-11-05T00:00:00Z'}))};
const saved = {version:1,widgets:[
  {id:'weather-kept',type:'weather',title:'Mi ciudad',config:{location:{name:'San José',country:'Costa Rica',latitude:9.93,longitude:-84.08}}},
  {id:'exchange-kept',type:'exchange',title:'',config:{amount:12,rate:'buy'}},
  {id:'clock-kept',type:'clock',title:'',config:{}},
  {id:'news-kept',type:'news',title:'Mis titulares',config:{topic:'ai'}},
  {id:'note-kept',type:'note',title:'Recuerdos',config:{text:'No perder esta nota: mañana, café y reunión.'}},
]};
const server = http.createServer(async(req,res)=>{
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname+'index.html' : pathname));
  if (!file.startsWith(root+path.sep) || pathname.includes('/.git')) {res.writeHead(403).end();return;}
  try {
    const body=await fs.readFile(file);
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});res.end(body);
  } catch {res.writeHead(404).end();}
});
let browser, base;
async function newPage(options={}) {
  const context=await browser.newContext({viewport:{width:1024,height:640},userAgent:options.desktop ? undefined : androidUA,reducedMotion:options.reduced ? 'reduce' : 'no-preference',acceptDownloads:true});
  const page=await context.newPage();
  const errors=[],requests=[],counts={weather:0,exchange:0,news:0};
  const control={offline:false};
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>requests.push(r.url()));
  await context.route('**/*',async route=>{
    const url=route.request().url();
    if (url.startsWith(base)) return route.continue();
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return route.abort();
    if(control.offline) return route.abort();
    let body;
    if(url.includes('api.open-meteo.com')) {counts.weather++;body=weather;}
    else if(url.includes('api.hacienda.go.cr')) {counts.exchange++;body=exchange;}
    else if(url.includes('hn.algolia.com')) {counts.news++;body=news;}
    else return route.abort();
    if(options.delay) await new Promise(r=>setTimeout(r,options.delay));
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.addInitScript(({seed,missing,brokenIntl,canvasFails,readFails,hungFetch})=>{
    if(seed !== undefined && !sessionStorage.getItem('qa-seeded')) {
      localStorage.setItem('mosaico:space:v1',typeof seed === 'string' ? seed : JSON.stringify(seed));
      sessionStorage.setItem('qa-seeded','1');
    }
    window.qa={canvas:0,raf:0,formatters:0};
    if(hungFetch) window.fetch=()=>new Promise(()=>{});
    const create=document.createElement.bind(document);
    document.createElement=function(name,...args){if(String(name).toLowerCase()==='canvas')window.qa.canvas++;return create(name,...args);};
    const raf=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=function(fn){window.qa.raf++;return raf(fn);};
    const DTF=Intl.DateTimeFormat;
    Intl.DateTimeFormat=new Proxy(DTF,{construct(target,args){
      window.qa.formatters++;
      if(brokenIntl)throw new RangeError('Controlled Intl failure');
      return Reflect.construct(target,args);
    }});
    if(missing) {
      Object.defineProperty(Crypto.prototype,'randomUUID',{configurable:true,value:undefined});
      window.structuredClone=undefined;window.AbortController=undefined;window.ResizeObserver=undefined;
    }
    if(canvasFails)HTMLCanvasElement.prototype.getContext=function(){throw new Error('Controlled canvas failure');};
    if(readFails) {
      const get=Storage.prototype.getItem;
      Storage.prototype.getItem=function(key){if(key==='mosaico:space:v1')throw new Error('Controlled read failure');return get.call(this,key);};
    }
  },{seed:options.seed,missing:!!options.missing,brokenIntl:!!options.brokenIntl,canvasFails:!!options.canvasFails,readFails:!!options.readFails,hungFetch:!!options.hungFetch});
  return {context,page,errors,requests,counts,control};
}
async function ready(page) {
  await page.waitForFunction(()=>document.documentElement.dataset.mosaicoReady==='true');
}
async function dataReady(page) {
  await page.locator('.weather .temperature').waitFor();
  await page.locator('.exchange .rate-value').waitFor();
  await page.locator('.news .news-title').first().waitFor();
}
async function run(name,fn) {
  const start=Date.now();await fn();const result={name,pass:true,ms:Date.now()-start};log.push(result);console.log('PASS '+name);
}
(async()=>{
  await fs.mkdir(qa,{recursive:true});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  base='http://127.0.0.1:'+server.address().port;
  browser=await (browserName==='firefox'?firefox:chromium).launch({
    headless:true,...(browserName==='firefox'?{executablePath:await fs.realpath(firefox.executablePath())}:{}),...(browserName==='chromium'&&process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})
  });
  await run('Android cold start without optional APIs: five widgets, zero canvas/fonts/animation',async()=>{
    const t=await newPage({missing:true,canvasFails:true});
    await t.page.goto(base);await ready(t.page);await dataReady(t.page);
    assert.equal(await t.page.locator('.widget').count(),5);
    assert.match(await t.page.locator('.clock-hm').textContent(),/^\d{2}:\d{2}$/);
    assert.equal(await t.page.locator('.news-title').count(),3);
    assert.equal(await t.page.locator('.weather-scene--static').count(),1);
    assert.deepEqual(await t.page.evaluate(()=>({canvas:qa.canvas,raf:qa.raf})),{canvas:0,raf:0});
    assert.equal(t.requests.some(u=>/fonts\.(googleapis|gstatic)/.test(u)),false);
    assert.equal(await t.page.locator('.skeleton').count(),0);
    assert.equal(await t.page.locator('.app-shell').evaluate(n=>n.getBoundingClientRect().height),640);
    assert.equal(await t.page.locator('.widget').first().evaluate(n=>getComputedStyle(n).animationName),'none');
    assert.deepEqual(t.errors,[]);
    await t.page.screenshot({path:path.join(qa,browserName+'-android.png')});
    await t.context.close();
  });
  await run('Existing IDs, notes, settings, reorder, export and import survive reload',async()=>{
    const t=await newPage({seed:saved,missing:true});
    await t.page.goto(base);await ready(t.page);await dataReady(t.page);
    assert.equal(await t.page.locator('.note-editor').inputValue(),saved.widgets[4].config.text);
    assert.equal(await t.page.locator('.rate-select').inputValue(),'buy');
    assert.equal(await t.page.locator('.converter-input input').inputValue(),'12');
    assert.equal(await t.page.locator('.news-tabs .selected').getAttribute('data-topic'),'ai');
    await t.page.locator('.note-editor').fill('Nota editada: conservar ✓');
    await t.page.locator('.note .widget-config').click();
    await t.page.locator('#config-form input[name=title]').fill('Mi libreta');
    await t.page.locator('#config-form button[type=submit]').click();
    await t.page.locator('#edit-button').click();
    await t.page.locator('.note .move-left').click();
    await t.page.locator('#edit-button').click();
    await t.page.reload();await ready(t.page);await dataReady(t.page);
    assert.equal(await t.page.locator('.note-editor').inputValue(),'Nota editada: conservar ✓');
    assert.equal(await t.page.locator('.note .widget-title').textContent(),'Mi libreta');
    const state=await t.page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
    assert.deepEqual(state.widgets.map(w=>w.id),['weather-kept','exchange-kept','clock-kept','note-kept','news-kept']);
    await t.page.locator('#settings-button').click();
    const downloading=t.page.waitForEvent('download');
    await t.page.locator('#export-button').click();
    const file=path.join(qa,browserName+'-export.json');
    await (await downloading).saveAs(file);
    assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),state);
    t.page.once('dialog',d=>d.accept());
    await t.page.locator('#import-input').setInputFiles(file);
    await t.page.waitForFunction(()=>!document.querySelector('#settings-dialog').open);
    assert.equal(await t.page.locator('.note-editor').inputValue(),'Nota editada: conservar ✓');
    assert.deepEqual(t.errors,[]);await t.context.close();
  });
  await run('Offline warm cache keeps source labels and notes; cold offline widgets retry',async()=>{
    const t=await newPage({seed:saved});
    await t.page.goto(base);await dataReady(t.page);
    t.control.offline=true;await t.page.reload();await ready(t.page);await dataReady(t.page);
    assert.match(await t.page.locator('.weather .source-line').textContent(),/Caché/);
    assert.match(await t.page.locator('.news .source-line').textContent(),/Caché/);
    assert.equal(await t.page.locator('.note-editor').inputValue(),saved.widgets[4].config.text);
    await t.context.close();
    const cold=await newPage();cold.control.offline=true;await cold.page.goto(base);await ready(cold.page);
    await cold.page.waitForFunction(()=>document.querySelectorAll('.error-state').length===3);
    assert.equal(await cold.page.locator('.note-editor').count(),1);
    assert.equal(await cold.page.locator('.clock-hm').count(),1);
    cold.control.offline=false;await cold.page.locator('.weather .error-state button').click();
    await cold.page.locator('.weather .temperature').waitFor();
    assert.deepEqual(cold.errors,[]);await cold.context.close();
  });
  await run('Hung data requests time out without AbortController and leave local widgets usable',async()=>{
    const t=await newPage({missing:true,hungFetch:true});
    await t.page.goto(base);await ready(t.page);
    assert.equal(await t.page.locator('.note-editor').count(),1);
    assert.match(await t.page.locator('.clock-hm').textContent(),/^\d{2}:\d{2}$/);
    await t.page.waitForFunction(()=>document.querySelectorAll('.error-state').length===3,{},{timeout:15000});
    assert.equal(await t.page.locator('.skeleton').count(),0);
    assert.deepEqual(t.errors,[]);await t.context.close();
  });
  await run('Invalid stored space stays byte-for-byte intact and exports its original',async()=>{
    const original=JSON.stringify({version:2,widgets:[{type:'future-widget',config:{text:'Nota del futuro'}}]});
    const t=await newPage({seed:original});
    await t.page.goto(base);await ready(t.page);
    await t.page.locator('.note-editor').fill('Edición provisional');
    assert.equal(await t.page.evaluate(key=>localStorage.getItem(key),KEY),original);
    assert.match(await t.page.locator('#save-status').textContent(),/protegido/);
    await t.page.locator('#settings-button').click();
    const downloading=t.page.waitForEvent('download');await t.page.locator('#export-button').click();
    const file=path.join(qa,browserName+'-protected.json');await (await downloading).saveAs(file);
    assert.equal(await fs.readFile(file,'utf8'),original);
    assert.deepEqual(t.errors,[]);await t.context.close();
  });
  await run('Read failure never writes defaults over unread saved data',async()=>{
    const t=await newPage({seed:saved,readFails:true});
    await t.page.goto(base);await ready(t.page);
    await t.page.locator('.note-editor').fill('Provisional');
    assert.match(await t.page.locator('#save-status').textContent(),/guardado en pausa/);
    // A Storage named-property read bypasses the deliberately broken getItem.
    const original=await t.page.evaluate(key=>localStorage[key],KEY);
    assert.equal(original,JSON.stringify(saved));
    assert.deepEqual(t.errors,[]);await t.context.close();
  });
  await run('Intl failure and desktop canvas failure leave real data and other widgets usable',async()=>{
    const t=await newPage({desktop:true,brokenIntl:true,canvasFails:true});
    await t.page.goto(base);await ready(t.page);await dataReady(t.page);
    assert.equal(await t.page.locator('.weather .error-state').count(),0);
    assert.match(await t.page.locator('.clock-date').textContent(),/de/);
    const initial=await t.page.evaluate(()=>qa.formatters);
    await t.page.waitForTimeout(2100);
    assert.equal(await t.page.evaluate(()=>qa.formatters),initial);
    assert.equal(initial,4);assert.deepEqual(t.errors,[]);await t.context.close();
  });
  await run('Desktop normal weather animates; reduced motion and forced lite stay static',async()=>{
    const desktop=await newPage({desktop:true});
    await desktop.page.goto(base);await dataReady(desktop.page);
    assert.equal(await desktop.page.locator('.weather canvas').count(),1);
    await desktop.page.waitForTimeout(300);
    assert.ok(await desktop.page.evaluate(()=>qa.raf)>0);
    assert.deepEqual(desktop.errors,[]);await desktop.context.close();
    const reduced=await newPage({desktop:true,reduced:true});
    await reduced.page.goto(base);await dataReady(reduced.page);
    assert.equal(await reduced.page.evaluate(()=>qa.canvas),0);
    assert.equal(await reduced.page.evaluate(()=>qa.raf),0);
    assert.deepEqual(reduced.errors,[]);await reduced.context.close();
    const forced=await newPage({desktop:true});
    await forced.page.goto(base+'?lite=1');await dataReady(forced.page);
    assert.equal(await forced.page.evaluate(()=>qa.canvas),0);
    assert.equal(forced.requests.some(u=>/fonts\.(googleapis|gstatic)/.test(u)),false);
    assert.deepEqual(forced.errors,[]);await forced.context.close();
  });
  await run('Forty duplicate data widgets share three in-flight requests on Android',async()=>{
    const widgets=Array.from({length:40},(_,i)=>({...saved.widgets[i%5],id:'many-'+i}));
    const t=await newPage({seed:{version:1,widgets},delay:200,missing:true});
    await t.page.goto(base);await ready(t.page);
    await t.page.waitForFunction(()=>document.querySelectorAll('.skeleton').length===0);
    assert.equal(await t.page.locator('.widget').count(),40);
    assert.deepEqual(t.counts,{weather:1,exchange:1,news:1});
    assert.equal(await t.page.evaluate(()=>qa.canvas),0);
    assert.deepEqual(t.errors,[]);await t.context.close();
  });
  await run('One broken custom widget does not stop later notes and cleanup failure is contained',async()=>{
    const seed={version:1,widgets:[{id:'cleanup-bad',type:'cleanup-broken',title:'',config:{}},{id:'bad',type:'broken',title:'',config:{}},saved.widgets[4]]};
    const t=await newPage({seed});
    await t.context.route('**/js/extensions.js*',async route=>{
      const source=await fs.readFile(path.join(root,'js/extensions.js'),'utf8');
      const extra="\nregisterWidget({type:'broken',name:'Broken',icon:'clock',render(){throw new Error('Controlled widget failure');}});registerWidget({type:'cleanup-broken',name:'Cleanup broken',icon:'clock',render(){return ()=>{throw new Error('Controlled cleanup failure');};}});";
      await route.fulfill({contentType:'text/javascript',body:source+extra});
    });
    await t.page.goto(base);await ready(t.page);
    await t.page.locator('#edit-button').click();
    assert.equal(await t.page.locator('.broken .error-state').count(),1);
    assert.equal(await t.page.locator('.note-editor').inputValue(),saved.widgets[4].config.text);
    assert.deepEqual(t.errors,[]);await t.context.close();
  });
  await run('Focus timer completes correctly, stays idle when paused and skips hidden paints',async()=>{
    const t=await newPage({seed:{version:1,widgets:[{id:'focus-kept',type:'focus',title:'',config:{minutes:1,remainingSeconds:1,startedAt:Date.now()-5000}}]}});
    await t.page.goto(base);await ready(t.page);
    assert.equal(await t.page.locator('.focus-time').textContent(),'00:00');
    assert.equal(await t.page.locator('.focus-toggle').textContent(),'Otra sesión');
    await t.page.evaluate(()=>{
      window.qa.focusMutations=0;
      new MutationObserver(entries=>qa.focusMutations+=entries.length).observe(document.querySelector('.focus-time'),{childList:true,characterData:true,subtree:true});
    });
    await t.page.waitForTimeout(1100);
    assert.equal(await t.page.evaluate(()=>qa.focusMutations),0);
    await t.page.locator('.focus-toggle').click();
    assert.equal(await t.page.locator('.focus-toggle').textContent(),'Pausar');
    await t.page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,value:true});
      qa.focusMutations=0;
    });
    await t.page.waitForTimeout(1100);
    assert.equal(await t.page.evaluate(()=>qa.focusMutations),0);
    await t.page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,value:false});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.notEqual(await t.page.locator('.focus-time').textContent(),'01:00');
    assert.deepEqual(t.errors,[]);await t.context.close();
  });
  await run('Startup watchdog appears while module is pending and hides after recovery',async()=>{
    const t=await newPage();let release;
    const pending=new Promise(r=>release=r);
    await t.context.route('**/js/app.js*',async route=>{await pending;await route.continue();});
    await t.page.goto(base,{waitUntil:'domcontentloaded',timeout:1500}).catch(e=>{if(!/Timeout/.test(e.message))throw e;});
    await t.page.locator('#startup-status').waitFor({state:'visible',timeout:10000});
    release();await ready(t.page);
    assert.equal(await t.page.locator('#startup-status').isVisible(),false);
    assert.deepEqual(t.errors,[]);await t.context.close();
  });
  const result={browser:browserName,version:await browser.version(),passed:log.length,tests:log,scope:'Browser UA simulation and controlled failures; no physical Android frame was available.'};
  await fs.writeFile(path.join(qa,browserName+'-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({browser:browserName,passed:log.length}));
})().catch(async error=>{
  console.error(error);
  await fs.mkdir(qa,{recursive:true});
  await fs.writeFile(path.join(qa,browserName+'-failure.txt'),error.stack);
  process.exitCode=1;
}).finally(async()=>{if(browser)await browser.close();await new Promise(r=>server.close(r));});
